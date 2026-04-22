# 25 — Documentation & Swagger (OpenAPI)

## TL;DR

- Every controller and handler is documented with `@nestjs/swagger`. If it's in the API, it's in the OpenAPI spec.
- Use `@ApiTags` per controller, `@ApiOperation` per handler, `@ApiResponse` for every status you return.
- DTOs use `@ApiProperty` / `@ApiPropertyOptional`. Combined with `class-validator`, the schema is auto-generated.
- Expose Swagger UI in dev; lock it down (or disable) in production.
- Auto-generate a client SDK from the spec for first-party consumers.

## Why it matters

Docs that drift from reality are worse than no docs. OpenAPI generated from the code is docs
that can't drift. Partners, front-end, and mobile all consume the same source of truth.

## Setup

```ts
// main.ts
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const config = new DocumentBuilder()
  .setTitle('My Service API')
  .setDescription('Public API for MyService')
  .setVersion('1.0.0')
  .addBearerAuth()                         // Authorization: Bearer <token>
  .addCookieAuth('session')                // for Better Auth style
  .addServer('https://api.example.com')
  .addServer('http://localhost:3000', 'local')
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('docs', app, document, {
  swaggerOptions: { persistAuthorization: true },
});
```

**Production:** either gate `/docs` behind admin auth or disable entirely. The spec can leak
internal capabilities (staging endpoints, experimental fields). Keep `/docs/openapi.json`
internal or protected.

## Controller decorators

```ts
@ApiTags('payments')                              // groups endpoints in the UI
@ApiBearerAuth()                                  // declares auth for all routes in this controller
@Controller({ path: 'payments', version: '1' })
export class PaymentController {
  @Get()
  @ApiOperation({ summary: 'List payments', description: 'Paginated list of payments.' })
  @ApiQuery({ type: ListPaymentsQueryDto })
  @ApiResponse({ status: 200, description: 'OK', type: PaymentListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list() { ... }

  @Post()
  @ApiOperation({ summary: 'Create payment' })
  @ApiResponse({ status: 201, description: 'Created', type: PaymentResponseDto })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async create(@Body() dto: CreatePaymentDto) { ... }
}
```

## DTO decorators

`class-validator` + `@nestjs/swagger` work together. Add `@ApiProperty` beside the validator:

```ts
export class CreatePaymentDto {
  @ApiProperty({ example: 1000, minimum: 1, description: 'Amount in minor units (cents)' })
  @IsInt() @Min(1)
  amountCents!: number;

  @ApiProperty({ example: 'usd', minLength: 3, maxLength: 3 })
  @IsString() @Length(3, 3)
  currency!: string;

  @ApiPropertyOptional({ description: 'Idempotency key from header' })
  @IsOptional() @IsUUID()
  idempotencyKey?: string;
}
```

Or enable the CLI plugin in `nest-cli.json` to reduce boilerplate:

```json
{ "compilerOptions": { "plugins": ["@nestjs/swagger"] } }
```

With the plugin, `@ApiProperty` is inferred from the TypeScript types + class-validator decorators. Explicit decorators still win when you need examples or descriptions.

## Response DTOs

The envelope matters in the docs. Declare it once:

```ts
export class EnvelopeDto<T> {
  @ApiProperty()
  data!: T;
  @ApiPropertyOptional()
  meta?: Record<string, unknown>;
}

export class ErrorEnvelopeDto {
  @ApiProperty()
  error!: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    traceId?: string;
  };
}
```

Then for each endpoint:

```ts
@ApiExtraModels(PaymentResponseDto, EnvelopeDto)
@ApiResponse({
  status: 200,
  schema: {
    allOf: [
      { $ref: getSchemaPath(EnvelopeDto) },
      { properties: { data: { $ref: getSchemaPath(PaymentResponseDto) } } },
    ],
  },
})
```

Or keep it simple with a per-endpoint response DTO that already wraps:

```ts
export class PaymentResponseDto {
  @ApiProperty() data!: PaymentDto;
}
```

Pick one style per project and stick to it.

## Auth schemes

```ts
config
  .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
  .addCookieAuth('session', { type: 'apiKey', in: 'cookie' })
  .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'apiKey');
```

Apply per-controller or per-handler:

```ts
@ApiBearerAuth()
@UseGuards(BearerGuard)
@Controller(...)
export class ApiController {}
```

## Excluding endpoints

```ts
@ApiExcludeController()   // entire controller hidden (e.g., Better Auth toNodeHandler)
@Controller('api/auth')
export class AuthController {}

@ApiExcludeEndpoint()     // single route hidden
@Post('internal/debug')
async debug() {}
```

## Versioning in docs

URI versioning auto-appears in the paths. To split docs by version, generate multiple
documents:

```ts
const v1 = SwaggerModule.createDocument(app, config, { include: [ApiV1Module] });
const v2 = SwaggerModule.createDocument(app, config, { include: [ApiV2Module] });
SwaggerModule.setup('docs/v1', app, v1);
SwaggerModule.setup('docs/v2', app, v2);
```

## Generated clients

Once the spec is stable, generate SDKs for consumers:

```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3000/docs/openapi.json \
  -g typescript-fetch \
  -o sdk/typescript
```

Check this into the consuming repo (or publish to an internal registry). Regenerate per release.

## Documentation beyond the spec

OpenAPI covers shapes and contracts — it doesn't explain **why**. Keep separate:

- `README.md` — how to run the service
- `docs/ARCHITECTURE.md` — high-level diagram, module boundaries (the "big picture")
- `docs/OPERATIONS.md` — on-call, deploys, dashboards
- `CHANGELOG.md` — human-readable release notes per version

Don't duplicate endpoint docs — link to `/docs` instead.

## Good vs bad

### Good

```ts
@ApiTags('users')
@Controller({ path: 'users', version: '1' })
export class UserController {
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'USER.NOT_FOUND' })
  async getById(@Param('id', ParseUUIDPipe) id: string) { ... }
}
```

### Bad

```ts
@Controller('users')                         // no tag, no version
export class UserController {
  @Get(':id')                                // undocumented
  async getById(@Param('id') id: string) {}  // no ParseUUID, no response doc
}
```

## Anti-patterns

- Writing separate markdown docs alongside the code that describe endpoints. They drift.
- Not documenting error responses. Consumers don't know how to handle failures.
- Using `@ApiProperty({ type: Object })` for unknown shapes. Narrow it or use `additionalProperties`.
- Leaving `/docs` public with every endpoint — including internal/admin — in production.
- Checking generated clients into the **server** repo. They belong in consumer repos.
- Drifting from the envelope: some endpoints documented as raw shape, others as envelope.

## Code review checklist

- [ ] Controller has `@ApiTags` and auth decorator (`@ApiBearerAuth` / `@ApiCookieAuth`)
- [ ] Every handler has `@ApiOperation({ summary })`
- [ ] Every status code returned is declared with `@ApiResponse`
- [ ] DTOs use `@ApiProperty` / `@ApiPropertyOptional`
- [ ] Enums declared with `enum: MyEnum`
- [ ] Response shape matches the envelope consistently
- [ ] Swagger disabled or auth-gated in production
- [ ] Params with specific format (UUID, email) declared + validated

## See also

- [`06-api-design.md`](./06-api-design.md) — URL and versioning decisions reflected in docs
- [`07-standard-responses.md`](./07-standard-responses.md) — envelope in the schema
- [`09-validation.md`](./09-validation.md) — `class-validator` <-> `@ApiProperty`
- [`12-authentication-patterns.md`](./12-authentication-patterns.md) — auth schemes
