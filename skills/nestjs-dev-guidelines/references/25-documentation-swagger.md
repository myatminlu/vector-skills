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
  .addBearerAuth(                                          // Authorization: Bearer <token>
    { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    'bearer',                                              // security name (used by @ApiBearerAuth)
  )
  .addCookieAuth(                                          // session cookie (Better Auth style)
    'session',                                             // cookie name on the wire
    { type: 'apiKey', in: 'cookie', name: 'session' },
    'cookie',                                              // security name (used by @ApiCookieAuth)
  )
  .addServer('https://api.example.com')
  .addServer('http://localhost:3000', 'local')
  .build();

// Gate registration so /docs and /docs-json are not exposed in production by default.
const docsEnabled = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DOCS === 'true';
if (docsEnabled) {
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
```

When registered, `SwaggerModule.setup('docs', ...)` exposes:

- `/docs` — Swagger UI
- `/docs-json` — OpenAPI JSON spec (used by SDK generators)
- `/docs-yaml` — OpenAPI YAML spec

**Production:** prefer disabling registration (as above) over only hiding the UI. Even if
you serve the UI behind a guard, the spec can leak internal capabilities (staging
endpoints, experimental fields). `/docs-json` is what SDK generators and crawlers fetch —
locking only the UI is not enough.

## Controller decorators

```ts
@ApiTags('payments')                              // groups endpoints in the UI
@ApiBearerAuth('bearer')                          // security name must match DocumentBuilder
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

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod', example: PaymentMethod.Card })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;
}
```

Always pass `enumName` for enums so the generated OpenAPI schema uses a named type
(`PaymentMethod`) instead of an inline union — generated SDKs become much cleaner.

Or enable the CLI plugin in `nest-cli.json` to reduce boilerplate:

```json
{ "compilerOptions": { "plugins": ["@nestjs/swagger"] } }
```

With the plugin, `@ApiProperty` is inferred from the TypeScript types + class-validator decorators. Explicit decorators still win when you need examples or descriptions.

## Headers (not body)

Headers like `Idempotency-Key` or `X-Tenant-Id` belong in `@ApiHeader`, not in the body
DTO. Putting them in a DTO mis-documents the contract — generated SDKs will send them as
JSON body fields and the server will not see them.

```ts
@Post()
@ApiOperation({ summary: 'Create payment' })
@ApiHeader({
  name: 'Idempotency-Key',
  description: 'Client-supplied UUID; replays return the original response',
  required: true,
  schema: { type: 'string', format: 'uuid' },
})
@ApiResponse({ status: 201, type: PaymentResponseDto })
async create(
  @Headers('idempotency-key') idempotencyKey: string,
  @Body() dto: CreatePaymentDto,
) { ... }
```

For headers shared across every route in a controller, declare them once on the class
with `@ApiHeader(...)` at controller level.

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

## Polymorphic / discriminated responses

When an endpoint returns one of several shapes (e.g. webhook events, union responses),
register every variant with `@ApiExtraModels` and reference them via `getSchemaPath` so
the spec emits a proper `oneOf` with a `discriminator`:

```ts
@ApiExtraModels(InvoicePaidEvent, InvoiceVoidedEvent, InvoiceFailedEvent)
@Post('webhooks')
@ApiOperation({ summary: 'Receive invoice webhook' })
@ApiBody({
  schema: {
    oneOf: [
      { $ref: getSchemaPath(InvoicePaidEvent) },
      { $ref: getSchemaPath(InvoiceVoidedEvent) },
      { $ref: getSchemaPath(InvoiceFailedEvent) },
    ],
    discriminator: { propertyName: 'type' },
  },
})
async receive(@Body() event: InvoiceEvent) { ... }
```

Without `@ApiExtraModels`, classes that are not directly referenced by a controller are
**not emitted** into the spec, so `$ref` lookups break in generated SDKs.

## Streaming endpoints (SSE / chunked)

For SSE handlers (see [`27-ai-streaming-sse.md`](./27-ai-streaming-sse.md)), declare the
content type with `@ApiProduces` so consumers know not to expect JSON:

```ts
@Sse('chat/:id/stream')
@ApiOperation({ summary: 'Stream assistant tokens for a chat session' })
@ApiProduces('text/event-stream')
@ApiResponse({
  status: 200,
  description: 'SSE stream of `data: { delta: string }` events',
})
stream(@Param('id') id: string): Observable<MessageEvent> { ... }
```

OpenAPI cannot fully describe an SSE stream's event grammar — capture the event shape in
the response `description`, or define a typed DTO and reference it textually.

## Auth schemes

The `DocumentBuilder` example above declares two schemes (`bearer`, `cookie`). Add an
API-key scheme the same way when needed:

```ts
config.addApiKey(
  { type: 'apiKey', in: 'header', name: 'X-API-Key' },
  'apiKey',                                              // security name → used by @ApiSecurity
);
```

Apply per-controller or per-handler. The decorator's argument **must match the security
name** declared on the builder (the third argument above):

```ts
@ApiBearerAuth('bearer')                                 // matches addBearerAuth(..., 'bearer')
@UseGuards(BearerGuard)
@Controller({ path: 'payments', version: '1' })
export class PaymentController {}

@ApiCookieAuth('cookie')                                 // matches addCookieAuth(..., 'cookie')
@UseGuards(SessionGuard)
@Controller({ path: 'me', version: '1' })
export class MeController {}

@ApiSecurity('apiKey')                                   // matches addApiKey(..., 'apiKey')
@Controller({ path: 'integrations', version: '1' })
export class IntegrationController {}
```

If the builder names and decorator names drift, the "Authorize" button in Swagger UI
sends the wrong scheme and requests will fail with `401`.

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
# NestJS Swagger exposes JSON at `/<setupPath>-json` — match the path in SwaggerModule.setup()
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:3000/docs-json \
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
- Leaving `/docs` (UI) **or** `/docs-json` public in production. Locking only the UI does nothing — SDK generators and crawlers hit the JSON.
- Declaring an auth scheme on `DocumentBuilder` under one security name and applying the decorator with a different name. Swagger UI's "Authorize" button silently sends the wrong header.
- Checking generated clients into the **server** repo. They belong in consumer repos.
- Drifting from the standard response contract: e.g., documenting one list endpoint with cursor metadata and another with offset metadata inconsistently, or wrapping single resources inconsistently.
- Documenting a different shape than what the endpoint actually returns on the wire.

## Code review checklist

- [ ] Controller has `@ApiTags` and auth decorator (`@ApiBearerAuth('bearer')` / `@ApiCookieAuth('cookie')` / `@ApiSecurity('apiKey')`) with the **same security name** as `DocumentBuilder`
- [ ] Every handler has `@ApiOperation({ summary })`
- [ ] Every status code returned is declared with `@ApiResponse`
- [ ] DTOs use `@ApiProperty` / `@ApiPropertyOptional`
- [ ] Enums declared with `enum: MyEnum, enumName: 'MyEnum'`
- [ ] Headers declared with `@ApiHeader`, not as DTO body fields
- [ ] Polymorphic responses registered via `@ApiExtraModels` + `oneOf` + `getSchemaPath`
- [ ] SSE / streaming endpoints declare `@ApiProduces('text/event-stream')`
- [ ] Response shape matches the standard contract from `07` (single-resource object, `{ data, meta }` for lists, `{ code, message, details?, traceId }` for errors)
- [ ] Both `/docs` UI **and** `/docs-json` are disabled or auth-gated in production
- [ ] Params with specific format (UUID, email) declared + validated

## See also

- [`06-api-design.md`](./06-api-design.md) — URL and versioning decisions reflected in docs
- [`07-standard-responses.md`](./07-standard-responses.md) — standard response contract in the schema
- [`09-validation.md`](./09-validation.md) — `class-validator` <-> `@ApiProperty`
- [`12-authentication-patterns.md`](./12-authentication-patterns.md) — auth schemes
- [`27-ai-streaming-sse.md`](./27-ai-streaming-sse.md) — SSE handler shape that pairs with `@ApiProduces`
