# 09 — Validation

## TL;DR

- **class-validator + class-transformer** for HTTP DTOs (auto-generates Swagger).
- **Zod** for environment variables, runtime JSON parsing (webhooks, LLM responses, config).
- `ValidationPipe` is global, always with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.
- Every controller input (`@Body`, `@Query`, `@Param`) uses a DTO — never a raw `object` or `any`.
- Validate at the boundary; trust internal calls.

## Why it matters

Unvalidated input is the root cause of most security bugs (SQL injection, SSRF, mass
assignment) and half the runtime crashes. Validation is the cheapest layer of defense and the
one with the highest ROI.

## Global setup

```ts
// main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,              // strip properties not in DTO
    forbidNonWhitelisted: true,   // error on unknown properties
    transform: true,              // auto-convert types (string → number, Date, etc.)
    transformOptions: { enableImplicitConversion: true },
    stopAtFirstError: false,      // collect all errors, not just the first
    validationError: { target: false, value: false }, // don't echo user input in error
  }),
);
```

## DTO patterns — class-validator

### Create

```ts
// modules/user/dto/create-user.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString() @Length(1, 100)
  name!: string;

  @ApiProperty({ minLength: 12 })
  @IsString() @Length(12, 128)
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain a digit' })
  password!: string;
}
```

### Update (Partial)

```ts
import { PartialType } from '@nestjs/swagger';
export class UpdateUserDto extends PartialType(CreateUserDto) {}
```

`PartialType` makes all fields optional. Don't pick subsets manually unless you need precise control (then use `PickType`).

### Query params

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListUsersQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 20;

  @IsOptional() @IsString()
  cursor?: string;

  @IsOptional() @IsString()
  search?: string;
}
```

`@Type(() => Number)` is required for query params because they arrive as strings. Without it,
`@IsInt` fails for literal `"20"`.

### Nested

```ts
import { ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

class AddressDto {
  @IsString() street!: string;
  @IsString() city!: string;
  @IsString() @Length(2, 2) country!: string; // ISO code
}

export class CreateUserDto {
  // ...
  @ValidateNested() @Type(() => AddressDto)
  address!: AddressDto;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10)
  @ValidateNested({ each: true }) @Type(() => AddressDto)
  backupAddresses?: AddressDto[];
}
```

### Custom validators

```ts
import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidPhoneNumber } from 'libphonenumber-js';

export function IsPhoneE164(options?: ValidationOptions): PropertyDecorator {
  return (object, propertyName) => {
    registerDecorator({
      name: 'isPhoneE164',
      target: object.constructor,
      propertyName: propertyName as string,
      options: { message: 'Must be a valid E.164 phone number', ...options },
      validator: { validate: (v) => typeof v === 'string' && isValidPhoneNumber(v) },
    });
  };
}
```

### Frequently used decorators

| Decorator | Purpose |
|---|---|
| `@IsString()`, `@IsInt()`, `@IsNumber()`, `@IsBoolean()`, `@IsDate()` | Primitives |
| `@IsEmail()`, `@IsUUID()`, `@IsUrl()`, `@IsJWT()` | Formats |
| `@IsEnum(MyEnum)` | Enum |
| `@IsArray()`, `@ArrayMinSize(n)`, `@ArrayMaxSize(n)`, `@ArrayUnique()` | Arrays |
| `@IsOptional()` | Nullable |
| `@ValidateNested()` + `@Type(() => Dto)` | Nested objects |
| `@Min(n)`, `@Max(n)`, `@Length(min, max)`, `@MaxLength(n)` | Bounds |
| `@Matches(regex)` | Regex |
| `@IsDateString()` | ISO 8601 string |
| `@Transform(({ value }) => ...)` | Custom pre-validation transform |

## Zod — env and runtime JSON

### Environment validation (at boot)

```ts
// core/config/env.ts
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  ALLOWED_ORIGINS: z.string().transform((s) => s.split(',').map((x) => x.trim())),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}
```

Call `loadEnv()` at the top of `main.ts` — fail fast before Nest starts.

### Runtime JSON parsing

For webhooks, LLM responses, untrusted external JSON:

```ts
import { z } from 'zod';

const stripePaymentIntentSchema = z.object({
  id: z.string().startsWith('pi_'),
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  status: z.enum(['requires_payment_method', 'succeeded', 'failed']),
});

export class StripeWebhookService {
  async handle(rawBody: unknown) {
    const result = stripePaymentIntentSchema.safeParse(rawBody);
    if (!result.success) {
      throw new BadRequestException({ code: 'WEBHOOK.MALFORMED', details: result.error.issues });
    }
    const event = result.data; // fully typed
    // ...
  }
}
```

### LLM response parsing

See `26-ai-product-patterns.md`. Short version: Zod schema for the expected tool-call JSON,
`safeParse`, retry once on failure.

## Validation vs authorization

- **Validation:** "Is the input well-formed?" — runs in the pipe.
- **Authorization:** "Is this user allowed to do this?" — runs in a guard (see `12` and `17`).

Don't mix them. A DTO says "userId must be a UUID"; a guard says "this user can only
access their own userId." Validation cannot know about the current user; guards cannot
(shouldn't) know about the shape of the body.

## Sanitization

`class-validator` does not sanitize. If you want to trim / lowercase / escape, use
`@Transform`:

```ts
@Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
@IsEmail()
email!: string;
```

Never trust a transform to replace validation. Sanitize then validate.

## Error shape

Validation failures throw `BadRequestException`, caught by your global filter and rendered as:

```json
{
  "code": "VALIDATION.FAILED",
  "message": "Request validation failed.",
  "details": [
    { "field": "email", "constraints": { "isEmail": "email must be a valid email" } },
    { "field": "password", "constraints": { "length": "password must be longer than or equal to 12 characters" } }
  ],
  "traceId": "req_..."
}
```

Map the default NestJS validation error to this shape in your filter or a custom
`exceptionFactory` in `ValidationPipe`.

## Good vs bad

### Good

```ts
@Post()
async create(@Body() dto: CreateUserDto): Promise<User> {
  return this.users.create(dto);
}
```

### Bad

```ts
@Post()
async create(@Body() body: any): Promise<User> {          // ❌ no DTO
  if (!body.email || !body.email.includes('@')) {         // ❌ manual validation
    throw new BadRequestException('bad email');
  }
  return this.users.create(body);                         // ❌ mass assignment risk
}
```

## Anti-patterns

- Manual `if (!x) throw BadRequest()` in controllers. Use DTOs.
- `@Body() body: any` or `@Body() body: object`. Always a DTO class.
- Validating twice (pipe + service). Validate at the boundary only.
- Using class-validator for env vars. Use Zod — coercion and unions are cleaner.
- Using Zod for HTTP DTOs. Lose Swagger auto-docs; use class-validator.
- Mixing validation and authorization in the DTO (e.g., "userId must equal current user").

## Code review checklist

- [ ] Every controller input parameter has a DTO (no `any`/`object`/raw primitives except `:id`)
- [ ] `ValidationPipe` global with `whitelist`, `forbidNonWhitelisted`, `transform`
- [ ] Query DTOs use `@Type(() => Number)` for numeric params
- [ ] Nested DTOs use `@ValidateNested()` + `@Type(() => ChildDto)`
- [ ] Environment is Zod-validated at boot; process exits on invalid env
- [ ] External webhook bodies are Zod-parsed before use
- [ ] No manual `if (!x) throw` validation logic in controllers/services

## See also

- [`10-error-handling.md`](./10-error-handling.md) — mapping validation errors to the standard error response body
- [`20-configuration.md`](./20-configuration.md) — env Zod schema in depth
- [`25-documentation-swagger.md`](./25-documentation-swagger.md) — `@ApiProperty` + `class-validator` synergy
- [`26-ai-product-patterns.md`](./26-ai-product-patterns.md) — Zod-parsing LLM output
