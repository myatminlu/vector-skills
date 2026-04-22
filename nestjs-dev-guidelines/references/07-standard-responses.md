# 07 — Standard API Responses

## TL;DR

- Every response is enveloped: `{ data, meta?, error? }`.
- Success: `{ data: ..., meta?: ... }`. No `error`.
- Failure: `{ error: { code, message, details?, traceId } }`. No `data`.
- Envelope is applied by a global **interceptor** (for success) and a global **exception filter** (for failures).
- The envelope is the same on v1 and v2 unless you are deliberately breaking the contract.

## Why it matters

A predictable envelope makes SDK generation easy, client error handling one path, and log
analysis machine-parseable. Without one, every team invents its own and every client ships
bugs at integration.

## The envelope

### Success

```json
{
  "data": { "id": "pay_abc", "amount": 1000, "currency": "usd", "status": "pending" }
}
```

### Success — list

```json
{
  "data": [
    { "id": "pay_1", ... },
    { "id": "pay_2", ... }
  ],
  "meta": {
    "pagination": { "nextCursor": "eyJp...", "hasMore": true, "limit": 50 },
    "total": 172        // optional, only if the endpoint supports total counting
  }
}
```

### Error

```json
{
  "error": {
    "code": "PAYMENT.INSUFFICIENT_FUNDS",
    "message": "The card was declined due to insufficient funds.",
    "details": { "declineCode": "insufficient_funds" },
    "traceId": "req_7a2c9f..."
  }
}
```

- `code` — namespaced, stable, programmatic. See `10-error-handling.md`.
- `message` — human-readable, localizable, NOT parsed by clients.
- `details` — optional machine-readable context. Safe to log; never include PII / secrets.
- `traceId` — matches `X-Request-ID`. Always present so support can correlate.

HTTP status code is the primary error signal (`4xx`/`5xx`). The envelope adds granularity.

## Implementation

### Interceptor for success

```ts
// common/interceptors/response-envelope.interceptor.ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body) => {
        // If the handler already returned an envelope (e.g. { data, meta }), pass through.
        if (body && typeof body === 'object' && ('data' in body || 'error' in body)) {
          return body;
        }
        return { data: body };
      }),
    );
  }
}

// main.ts
app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
```

**Service/controller returns:**
- A plain object or array → interceptor wraps it in `{ data }`.
- Already-enveloped `{ data, meta }` (for list endpoints) → passed through.
- `undefined` / `null` → `{ data: null }` (or return `204 No Content` from the controller).

### Exception filter for errors

See `10-error-handling.md` for the full pattern. Short version:

```ts
// common/filters/all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    if (res.headersSent) return; // e.g. Better Auth wrote already

    const { status, code, message, details } = toApiError(exception);
    res.status(status).json({
      error: { code, message, details, traceId: req.id ?? req.headers['x-request-id'] },
    });
  }
}
```

## Content types other than JSON

- **SSE (text/event-stream)** — do not envelope individual events. Envelope the **terminal**
  error frame instead. See `27-ai-streaming-sse.md`.
- **Binary / file download** — no envelope. Status code + Content-Type + Content-Disposition.
- **Health check** — `200 {"status":"ok"}` is fine; simple. Don't envelope health.

## When a list endpoint must return nothing

- Empty list: `{ "data": [], "meta": { "pagination": { ..., "hasMore": false } } }`.
- Not `{ "data": null }`. Clients iterate `.data` safely when it's always an array.

## Localization

- `message` is English by default. Return localized version when `Accept-Language` matches.
- `code` never localizes. Clients map `code` → localized UI strings themselves.

## Controller return shape — recommended

Two options, both fine (pick one per team and stick):

### A. Return plain domain objects; interceptor envelopes

```ts
@Get(':id')
async get(@Param('id') id: string): Promise<Payment> {
  return this.payments.findById(id); // { id, amount, ... }
}
```

Response: `{ "data": { "id": "...", "amount": ... } }` (interceptor wraps).

### B. Controller returns envelope explicitly (for list endpoints)

```ts
@Get()
async list(@Query() q: ListPaymentsQueryDto): Promise<Envelope<Payment[]>> {
  const { rows, nextCursor, hasMore } = await this.payments.list(q);
  return {
    data: rows,
    meta: { pagination: { nextCursor, hasMore, limit: q.limit } },
  };
}
```

Pattern: non-list endpoints use A; list endpoints use B (to include pagination meta).

## Response DTOs

If you want Swagger documentation and precise over-the-wire shape, declare response DTOs:

```ts
export class PaymentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() amountCents!: number;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;

  static from(p: Payment): PaymentResponseDto {
    return {
      id: p.id,
      amountCents: p.amountCents,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    };
  }
}

// controller
@Get(':id')
@ApiResponse({ status: 200, type: PaymentResponseDto })
async get(@Param('id') id: string) {
  const p = await this.payments.findById(id);
  return PaymentResponseDto.from(p);
}
```

The `from()` mapper is the only place where domain → wire shape happens. Keeps entities from
leaking into JSON by accident.

## Versioning the envelope

- v1 envelope is `{ data, meta, error }`. Don't change this in v2 without a compelling reason.
- Per-endpoint response shape can evolve independently inside `data`.

## Good vs bad

### Good

```http
GET /v1/payments/pay_abc

HTTP/1.1 200
Content-Type: application/json
{ "data": { "id": "pay_abc", "amountCents": 1000, "status": "paid" } }
```

### Bad

```http
GET /v1/payments/pay_abc

HTTP/1.1 200
{ "success": true, "result": { "ID": "pay_abc", "amount": 10.00 }, "error": null }
```

Issues: non-standard envelope, inconsistent case, float amount, always-`null` field.

## Anti-patterns

- Returning `null` from a 404 endpoint instead of throwing (`NotFoundException`) — the filter envelope handles it.
- Returning `{ success: false }` with HTTP 200.
- Embedding `error` in a success envelope "just in case" — it's either success or error.
- Serializing DB rows with internal columns leaked (e.g. `passwordHash`, `deletedAt`). Use a mapper or `@Exclude()`.
- Dates as unix timestamps or custom formats. ISO 8601 UTC.

## Code review checklist

- [ ] Global `ResponseEnvelopeInterceptor` is registered
- [ ] Global `AllExceptionsFilter` is registered
- [ ] Successful responses are `{ data }` or `{ data, meta }`
- [ ] Error responses are `{ error: { code, message, details?, traceId } }`
- [ ] HTTP status codes are correct (never `200` for errors)
- [ ] List endpoints include `meta.pagination`
- [ ] Dates are ISO 8601 UTC strings
- [ ] Money is integer minor units or string decimals — never floats
- [ ] No DB internals leaked (password hashes, soft-delete timestamps) in `data`

## See also

- [`06-api-design.md`](./06-api-design.md) — URL, verbs, status codes
- [`08-pagination-filters-sorting.md`](./08-pagination-filters-sorting.md) — list `meta`
- [`10-error-handling.md`](./10-error-handling.md) — error shape, code taxonomy
- [`21-logging.md`](./21-logging.md) — correlation IDs for `traceId`
- [`25-documentation-swagger.md`](./25-documentation-swagger.md) — documenting response shape
