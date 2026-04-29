# 07 — Standard API Responses

## TL;DR

- Single-resource success returns the object itself. No outer `data` wrapper.
- List success returns `{ data: [...], meta: { pagination, ... } }`.
- `meta.pagination` depends on the endpoint's pagination model.
- Cursor/keyset lists use `{ nextCursor, hasMore, limit }`.
- Offset lists use `{ page, limit, total, totalPages }`.
- Failure returns `{ code, message, details?, traceId }`. No outer `error` wrapper.
- Success shape is chosen in the controller/response DTO. Errors are shaped by a global **exception filter**.
- Keep this response contract stable across versions unless you are deliberately breaking it.

## Why it matters

A predictable response contract makes SDK generation easy, client error handling one path, and log
analysis machine-parseable. Without one, every team invents its own and every client ships bugs at
integration.

## The response contract

### Success

```json
{
  "id": "pay_abc",
  "amountCents": 1000,
  "currency": "usd",
  "status": "pending"
}
```

### Success — list (cursor/keyset)

```json
{
  "data": [
    { "id": "pay_1", "amountCents": 1000 },
    { "id": "pay_2", "amountCents": 2500 }
  ],
  "meta": {
    "pagination": {
      "nextCursor": "eyJp...",
      "hasMore": true,
      "limit": 50
    }
  }
}
```

### Success — list (offset)

```json
{
  "data": [
    { "id": "user_101", "email": "a@example.com" },
    { "id": "user_102", "email": "b@example.com" }
  ],
  "meta": {
    "pagination": {
      "page": 3,
      "limit": 50,
      "total": 1274,
      "totalPages": 26
    }
  }
}
```

### Error

```json
{
  "code": "PAYMENT.INSUFFICIENT_FUNDS",
  "message": "The card was declined due to insufficient funds.",
  "details": { "declineCode": "insufficient_funds" },
  "traceId": "req_7a2c9f..."
}
```

- `code` — namespaced, stable, programmatic. See `10-error-handling.md`.
- `message` — human-readable, localizable, NOT parsed by clients.
- `details` — optional machine-readable context. Safe to log; never include PII / secrets.
- `traceId` — matches `X-Request-ID`. Always present so support can correlate.

HTTP status code is the primary error signal (`4xx`/`5xx`). The body adds granularity.

## Pagination metadata

- Cursor/keyset endpoint → `meta.pagination = { nextCursor, hasMore, limit }`
- Offset endpoint → `meta.pagination = { page, limit, total, totalPages }`
- Top-level list shape stays the same (`{ data, meta }`); only the `pagination` object changes.
- Do not mix cursor fields and offset fields in the same endpoint contract.
- Cursor endpoints usually omit `total` unless the product truly needs it and the cost was measured.

## Implementation

### Success responses

Return the wire shape directly from the controller or response DTO:

- Single resource / action result → plain object
- Cursor list endpoint → `{ data, meta: { pagination: { nextCursor, hasMore, limit } } }`
- Offset list endpoint → `{ data, meta: { pagination: { page, limit, total, totalPages } } }`
- No content → `204 No Content` where appropriate

#### Status code per success type

| Verb / outcome | Status | Notes |
|---|---|---|
| `GET` resource | `200` | body = the resource |
| `GET` list | `200` | body = `{ data, meta }` |
| `POST` creates a resource | `201` | set `Location: /v1/<collection>/<id>`; body = the created resource |
| `POST` action (no new resource) | `200` | body = the action result |
| `PUT` / `PATCH` updates | `200` | body = the updated resource |
| `DELETE` | `204` | empty body |
| Async accepted (job queued) | `202` | body = job handle, e.g. `{ jobId, statusUrl }` |

`Location` on `201` is not optional — clients use it to fetch the canonical resource without
guessing the URL. Status code rules are mirrored in [`06-api-design.md`](./06-api-design.md);
keep both in sync if you change them.

### Exception filter for errors

See `10-error-handling.md` for the full pattern (including the `getOrCreateTraceId` helper and
error normalization). Short version, focused on the response body shape:

```ts
// common/filters/all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;   // see 10-error-handling.md
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    if (res.headersSent) return;                      // e.g. SSE handler already flushed

    const { status, code, message, details } = toApiError(exception);
    const traceId = getOrCreateTraceId(req);          // see 10-error-handling.md
    res.setHeader('X-Request-ID', traceId);

    res.status(status).json({
      code,
      message,
      details,
      traceId,
    });
  }
}
```

If your request pipeline already guarantees `req.id` (for example via `nestjs-pino` `genReqId`,
see `21-logging.md`), reuse it. Otherwise accept only a bounded string `X-Request-ID`; ignore
empty, array-valued, or oversized values, mint a fallback, and echo the final id in
`X-Request-ID` so the header and body stay aligned.

> **Typing tip:** rather than `(req as any).id`, declare the field once in a `types/express.d.ts`
> module augmentation (`declare module 'express' { interface Request { id?: string } }`) and read
> `req.id` directly — `nestjs-pino` and most request-id middlewares already attach this property.

## Content types other than JSON

- **SSE (text/event-stream)** — do not wrap individual events. Once headers are flushed the
  global filter cannot rewrite the body, so emit a terminal `error` event with the same `code` /
  `message` semantics, then end the stream:

  ```
  event: error
  data: {"code":"AI.PROVIDER_TIMEOUT","message":"Upstream model timed out."}
  ```

  See [`27-ai-streaming-sse.md`](./27-ai-streaming-sse.md) for the full event vocabulary
  (`chunk`, `tool_call`, `tool_result`, `usage`, `done`, `error`) and reconnection rules.
- **Binary / file download** — no wrapper. Status code + `Content-Type` + `Content-Disposition`.
- **Health check** — `200 {"status":"ok"}` is fine; keep it simple. See
  [`34-health-shutdown.md`](./34-health-shutdown.md) for liveness vs. readiness shapes.

## When a list endpoint must return nothing

- Empty cursor page: `{ "data": [], "meta": { "pagination": { "nextCursor": null, "hasMore": false, "limit": 50 } } }`
- Empty offset page (in-range, no rows match the filter): `{ "data": [], "meta": { "pagination": { "page": 1, "limit": 50, "total": 0, "totalPages": 0 } } }`
- Out-of-range offset page (e.g. `?page=27` when `totalPages=26`): return `200` with `{ "data": [], "meta": { "pagination": { "page": 27, "limit": 50, "total": 1274, "totalPages": 26 } } }` — echo the requested `page` so the client sees why its slice is empty. Do **not** 404; out-of-range is not a missing resource, it's an empty slice. **Echo, do not clamp** — see [`08-pagination-filters-sorting.md`](./08-pagination-filters-sorting.md) (Edge cases) for the rationale.
- Not `{ "data": null }`. Clients iterate `.data` safely when it's always an array.

## Localization

- `message` is English by default. Return a localized version when `Accept-Language` matches a
  supported locale.
- Negotiate against an explicit allow-list (e.g. `['en', 'my', 'ja']`) — never trust
  `Accept-Language` blindly.
- Fallback chain: exact tag (`my-MM`) → primary tag (`my`) → default (`en`). If none match,
  serve `en` and set `Content-Language: en` so the client can detect the fallback.
- Keep `details` keys and enum values in English; only `message` is translated.
- `code` never localizes. Clients map `code` → localized UI strings themselves — that way the
  client can render copy without a server round-trip when locale changes.

## Controller return shape — recommended

Three patterns, all valid:

### A. Return plain response DTOs for single-resource endpoints

```ts
@Get(':id')
async get(@Param('id') id: string): Promise<PaymentResponseDto> {
  const payment = await this.payments.findById(id);
  return PaymentResponseDto.from(payment);
}
```

Response: `{ "id": "...", "amountCents": ..., "status": "..." }`.

### B. Cursor list endpoints return `{ data, meta }` with cursor metadata

```ts
export interface CursorPaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface CursorListResponse<T> {
  data: T[];
  meta: {
    pagination: CursorPaginationMeta;
  };
}

@Get()
async list(@Query() q: ListPaymentsCursorQueryDto): Promise<CursorListResponse<PaymentResponseDto>> {
  const { rows, nextCursor, hasMore } = await this.payments.list(q);
  return {
    data: rows.map(PaymentResponseDto.from),
    meta: { pagination: { nextCursor, hasMore, limit: q.limit } },
  };
}
```

### C. Offset list endpoints return `{ data, meta }` with offset metadata

```ts
export interface OffsetPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface OffsetListResponse<T> {
  data: T[];
  meta: {
    pagination: OffsetPaginationMeta;
  };
}

@Get('/admin/users')
async listUsers(@Query() q: ListUsersOffsetQueryDto): Promise<OffsetListResponse<UserResponseDto>> {
  const { rows, total } = await this.users.list(q);
  return {
    data: rows.map(UserResponseDto.from),
    meta: {
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    },
  };
}
```

Pattern: single-resource endpoints return the object itself; list endpoints return `{ data, meta }`; `meta.pagination` matches the endpoint's chosen pagination model.

## Response DTOs

If you want Swagger documentation and precise over-the-wire shape, declare response DTOs:

```ts
export class PaymentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() amountCents!: number;
  @ApiProperty({ enum: PaymentStatus, enumName: 'PaymentStatus' }) status!: PaymentStatus;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;

  static from(p: Payment): PaymentResponseDto {
    return {
      id: p.id,
      amountCents: p.amountCents,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    } as PaymentResponseDto;
  }
}
```

The `from()` mapper is the only place where domain → wire shape happens. Keeps entities from
leaking into JSON by accident.

> **`class-transformer` gotcha:** the object-literal style above is fine for pure data DTOs
> (definite-assignment fields + `@ApiProperty()`). The moment you add `class-transformer`
> decorators that change serialization (`@Exclude()`, `@Expose()`, `@Transform()`) or any
> instance method, return a real instance instead, e.g.
> `Object.assign(new PaymentResponseDto(), { ... })` or `plainToInstance(PaymentResponseDto, raw, { excludeExtraneousValues: true })`.
> A plain object literal does not carry the decorator metadata, so `ClassSerializerInterceptor`
> silently ships unfiltered fields.

## Versioning the response contract

- v1 uses: plain object for single success, `{ data, meta }` for lists, and `{ code, message, details?, traceId }` for errors.
- Do not change those top-level shapes in v2 without a compelling reason.
- Once an endpoint publishes cursor vs offset pagination metadata, keep that endpoint's pagination contract stable unless you version the change.
- Per-endpoint fields can evolve inside the success object or inside list `data` items.

## Good vs bad

### Good

```http
GET /v1/payments/pay_abc

HTTP/1.1 200
Content-Type: application/json
{ "id": "pay_abc", "amountCents": 1000, "status": "paid" }
```

### Bad

```http
GET /v1/payments/pay_abc

HTTP/1.1 200
{ "success": true, "result": { "ID": "pay_abc", "amount": 10.00 }, "error": null }
```

Issues: non-standard shape, inconsistent case, float amount, always-`null` field.

## Anti-patterns

- Returning `null` from a 404 endpoint instead of throwing (`NotFoundException`) — the filter shapes the error body.
- Returning `{ success: false }` with HTTP 200.
- Embedding `error` in a success body "just in case" — it's either success or error.
- Mixing cursor metadata and offset metadata in one endpoint contract.
- Serializing DB rows with internal columns leaked (e.g. `passwordHash`, `deletedAt`). Use a mapper or `@Exclude()`.
- Dates as unix timestamps or custom formats. ISO 8601 UTC.

## Code review checklist

- [ ] Global `AllExceptionsFilter` is registered
- [ ] Single-resource success responses return the object itself
- [ ] List responses use `{ data, meta }`
- [ ] `meta.pagination` matches the endpoint's chosen pagination model
- [ ] Error responses are `{ code, message, details?, traceId }`
- [ ] HTTP status codes are correct (never `200` for errors)
- [ ] Dates are ISO 8601 UTC strings
- [ ] Money is integer minor units or string decimals — never floats
- [ ] No DB internals leaked (password hashes, soft-delete timestamps) in `data`

## See also

- [`06-api-design.md`](./06-api-design.md) — URL, verbs, status codes
- [`08-pagination-filters-sorting.md`](./08-pagination-filters-sorting.md) — choosing cursor vs offset
- [`10-error-handling.md`](./10-error-handling.md) — error shape, code taxonomy
- [`21-logging.md`](./21-logging.md) — correlation IDs for `traceId`
- [`25-documentation-swagger.md`](./25-documentation-swagger.md) — documenting response shape
