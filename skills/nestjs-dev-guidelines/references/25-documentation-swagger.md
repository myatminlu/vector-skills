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
  @ApiQuery({ type: ListPaymentsCursorQueryDto })
  @ApiResponse({ status: 200, description: 'OK', type: CursorPaymentListResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async list() { ... }

  @Post()
  @ApiOperation({ summary: 'Create payment' })
  @ApiResponse({ status: 201, description: 'Created', type: PaymentResponseDto })
  @ApiResponse({ status: 422, description: 'Validation failed' })
  async create(@Body() dto: CreatePaymentDto) { ... }
}
```

For an offset-based endpoint, swap in the matching offset query DTO and offset response DTO.

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

Document the actual wire shape. In this skill's standard contract:

- Single-resource success returns the object itself
- List success returns `{ data, meta }`
- `meta.pagination` uses the DTO that matches the endpoint's pagination model
- Errors return `{ code, message, details?, traceId }`

### Single-resource success

```ts
export class PaymentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() amountCents!: number;
  @ApiProperty() status!: string;
}

@ApiResponse({ status: 200, type: PaymentResponseDto })
```

### List success

```ts
export class CursorPaginationMetaDto {
  @ApiProperty({ nullable: true }) nextCursor!: string | null;
  @ApiProperty() hasMore!: boolean;
  @ApiProperty() limit!: number;
}

export class CursorPaymentListMetaDto {
  @ApiProperty({ type: CursorPaginationMetaDto }) pagination!: CursorPaginationMetaDto;
}

export class CursorPaymentListResponseDto {
  @ApiProperty({ type: [PaymentResponseDto] }) data!: PaymentResponseDto[];
  @ApiProperty({ type: CursorPaymentListMetaDto }) meta!: CursorPaymentListMetaDto;
}

@ApiResponse({ status: 200, type: CursorPaymentListResponseDto })
```

```ts
export class OffsetPaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class OffsetUserListMetaDto {
  @ApiProperty({ type: OffsetPaginationMetaDto }) pagination!: OffsetPaginationMetaDto;
}

export class OffsetUserListResponseDto {
  @ApiProperty({ type: [UserResponseDto] }) data!: UserResponseDto[];
  @ApiProperty({ type: OffsetUserListMetaDto }) meta!: OffsetUserListMetaDto;
}

@ApiResponse({ status: 200, type: OffsetUserListResponseDto })
```

### Error response

```ts
export class ApiErrorResponseDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional() details?: Record<string, unknown>;
  @ApiProperty() traceId!: string;
}

@ApiResponse({ status: 422, type: ApiErrorResponseDto })
```

Use the DTO that matches the endpoint's pagination model. Prefer explicit per-endpoint DTOs over
generic wrapper tricks. They produce cleaner Swagger and match the real response contract directly.

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
- Drifting from the standard response contract: e.g., documenting one list endpoint with cursor metadata and another with offset metadata inconsistently, or wrapping single resources inconsistently.
- Documenting a different shape than what the endpoint actually returns on the wire.

## Code review checklist

- [ ] Controller has `@ApiTags` and auth decorator (`@ApiBearerAuth` / `@ApiCookieAuth`)
- [ ] Every handler has `@ApiOperation({ summary })`
- [ ] Every status code returned is declared with `@ApiResponse`
- [ ] DTOs use `@ApiProperty` / `@ApiPropertyOptional`
- [ ] Enums declared with `enum: MyEnum`
- [ ] Response shape matches the standard contract from `07` (single-resource object, `{ data, meta }` for lists, `{ code, message, details?, traceId }` for errors)
- [ ] Swagger disabled or auth-gated in production
- [ ] Params with specific format (UUID, email) declared + validated

## See also

- [`06-api-design.md`](./06-api-design.md) — URL and versioning decisions reflected in docs
- [`07-standard-responses.md`](./07-standard-responses.md) — standard response contract in the schema
- [`09-validation.md`](./09-validation.md) — `class-validator` <-> `@ApiProperty`
- [`12-authentication-patterns.md`](./12-authentication-patterns.md) — auth schemes
