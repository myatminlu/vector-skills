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
import { UnprocessableEntityException, ValidationError, ValidationPipe } from '@nestjs/common';

app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,              // strip properties not in DTO
    forbidNonWhitelisted: true,   // error on unknown properties
    forbidUnknownValues: true,    // reject `@Body()` of `undefined` / non-object
    transform: true,              // auto-convert types (string → number, Date, etc.)
    transformOptions: { enableImplicitConversion: true },
    stopAtFirstError: false,      // collect all errors, not just the first
    validationError: { target: false, value: false }, // don't echo user input in error
    exceptionFactory: (errors: ValidationError[]) =>
      new UnprocessableEntityException({
        code: 'VALIDATION.FAILED',
        message: 'Request validation failed.',
        details: flattenValidationErrors(errors),
      }),
  }),
);
```

`exceptionFactory` is what makes class-validator produce **422 + `VALIDATION.FAILED`** instead of Nest's
default 400. The status, code, and `details` shape stay aligned with `10-error-handling.md` and
`39-exception-filters.md`. `flattenValidationErrors` walks nested `ValidationError` trees:

```ts
// common/validation/flatten-validation-errors.ts
import type { ValidationError } from '@nestjs/common';

export interface FieldError {
  field: string;                              // dotted path, e.g. "address.country"
  constraints: Record<string, string>;        // { isEmail: "..." }
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): FieldError[] {
  return errors.flatMap((e) => {
    const field = parent ? `${parent}.${e.property}` : e.property;
    const own: FieldError[] = e.constraints
      ? [{ field, constraints: e.constraints }]
      : [];
    const nested = e.children?.length ? flattenValidationErrors(e.children, field) : [];
    return [...own, ...nested];
  });
}
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

export function IsPhoneE164(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isPhoneE164',
      target: object.constructor,
      propertyName,
      options: { message: 'Must be a valid E.164 phone number', ...options },
      validator: { validate: (v) => typeof v === 'string' && isValidPhoneNumber(v) },
    });
  };
}
```

### Frequently used decorators

All decorators come from `class-validator` unless the **Source** column says otherwise.

| Decorator | Purpose | Source |
|---|---|---|
| `@IsString()`, `@IsInt()`, `@IsNumber()`, `@IsBoolean()`, `@IsDate()` | Primitives | `class-validator` |
| `@IsEmail()`, `@IsUUID()`, `@IsUrl()`, `@IsJWT()` | Formats | `class-validator` |
| `@IsEnum(MyEnum)` | Enum | `class-validator` |
| `@IsArray()`, `@ArrayMinSize(n)`, `@ArrayMaxSize(n)`, `@ArrayUnique()` | Arrays | `class-validator` |
| `@IsOptional()` | Nullable | `class-validator` |
| `@ValidateNested()` | Nested objects | `class-validator` |
| `@Min(n)`, `@Max(n)`, `@Length(min, max)`, `@MaxLength(n)` | Bounds | `class-validator` |
| `@Matches(regex)` | Regex | `class-validator` |
| `@IsDateString()` | ISO 8601 string | `class-validator` |
| `@Type(() => Dto)` | Type hint for nested / coerced values | `class-transformer` |
| `@Transform(({ value }) => ...)` | Custom pre-validation transform | `class-transformer` |

## Zod — env and runtime JSON

### Environment validation (at boot)

```ts
// core/config/env.ts
import { z } from 'zod';

const csvUrls = z
  .string()
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(z.string().url()).min(1));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  ALLOWED_ORIGINS: csvUrls,
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Logger is not bootstrapped yet — plain console + non-zero exit is intentional.
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
      // 400, not 422: a malformed external payload is a transport-level fault, not a
      // user-input semantic failure. See `10-error-handling.md` and `36-webhooks.md`.
      throw new BadRequestException({
        code: 'WEBHOOK.MALFORMED',
        message: 'Webhook payload did not match the expected schema.',
        details: { issues: result.error.issues },
      });
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

The `exceptionFactory` configured in **Global setup** throws an `UnprocessableEntityException`
(HTTP **422**), caught by the global filter (`39-exception-filters.md`) and rendered as:

```json
{
  "code": "VALIDATION.FAILED",
  "message": "Request validation failed.",
  "details": [
    { "field": "email", "constraints": { "isEmail": "email must be a valid email" } },
    { "field": "address.country", "constraints": { "length": "country must be exactly 2 characters" } }
  ],
  "traceId": "req_..."
}
```

- HTTP status: **422 Unprocessable Entity** — body is well-formed JSON, semantics are wrong.
- `code`: stable `VALIDATION.FAILED` (dotted, matches the registry in `10-error-handling.md`).
- `details`: array of `{ field, constraints }`; `field` is a dotted path so clients can map
  errors to nested form inputs.
- `traceId`: added by the global filter, never emitted by the pipe directly.

> **Why 422, not 400?** 400 means "I cannot parse this request" (malformed JSON, missing
> `Content-Type`); 422 means "I parsed it, but the data is semantically invalid." Validation
> is the second case. Webhook *payload* parsing failures stay 400 — that's a transport
> contract, not user input.

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
    throw new BadRequestException('bad email');           // ❌ wrong status (400 vs 422) and free-form message
  }
  return this.users.create(body);                         // ❌ mass assignment risk
}
```

### Path params

A route with a single primitive id is the only place a non-DTO param is acceptable — but it
**still gets a pipe**, never a raw `string`:

```ts
// ✅
@Get(':id')
findOne(@Param('id', ParseUUIDPipe) id: string): Promise<User> { ... }

// ✅
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number): Promise<User> { ... }

// ❌ no pipe — accepts "; DROP TABLE users", typos, anything
@Get(':id')
findOne(@Param('id') id: string) { ... }
```

## Anti-patterns

- Manual `if (!x) throw BadRequest()` in controllers. Use DTOs.
- `@Body() body: any` or `@Body() body: object`. Always a DTO class.
- Validating twice (pipe + service). Validate at the boundary only.
- Using class-validator for env vars. Use Zod — coercion and unions are cleaner.
- Using Zod for HTTP DTOs. Lose Swagger auto-docs; use class-validator.
- Mixing validation and authorization in the DTO (e.g., "userId must equal current user").
- Returning **400** from the validation pipe. The contract here is **422 + `VALIDATION.FAILED`**; configure the `exceptionFactory` so it cannot drift.
- Echoing user input back inside `details` (`value: false` in `validationError` keeps the pipe from doing this for you).

## Code review checklist

- [ ] Every controller input has a DTO. Single `:id`/`:uuid` params use `ParseUUIDPipe` or `ParseIntPipe` — never raw `@Param('id') id: string`.
- [ ] `ValidationPipe` is registered globally with `whitelist`, `forbidNonWhitelisted`, `forbidUnknownValues`, `transform`, and an `exceptionFactory` that returns **422 + `VALIDATION.FAILED`**.
- [ ] Query DTOs use `@Type(() => Number)` for numeric params.
- [ ] Nested DTOs use `@ValidateNested()` + `@Type(() => ChildDto)`.
- [ ] Environment is Zod-validated at boot; process exits on invalid env.
- [ ] External webhook bodies are Zod-parsed before use; malformed payloads → **400 + `WEBHOOK.MALFORMED`**.
- [ ] No manual `if (!x) throw` validation logic in controllers/services.
- [ ] Error responses match `{ code, message, details?, traceId }` from `07-standard-responses.md`.

## See also

- [`10-error-handling.md`](./10-error-handling.md) — mapping validation errors to the standard error response body
- [`20-configuration.md`](./20-configuration.md) — env Zod schema in depth
- [`25-documentation-swagger.md`](./25-documentation-swagger.md) — `@ApiProperty` + `class-validator` synergy
- [`26-ai-product-patterns.md`](./26-ai-product-patterns.md) — Zod-parsing LLM output
