# 39 — Exception Filters

## TL;DR

- One global exception filter shapes every error response into the standard contract: `{ code, message, details?, traceId }` with the right HTTP status.
- Throw domain-specific `HttpException` subclasses (`DuplicateInvoiceNumberError extends ConflictException`) — the filter maps them to the wire shape.
- Don't catch in services to log-and-rethrow. Let domain errors bubble to the filter; the filter logs once with full context.
- Validation, auth, and not-found errors are already typed exceptions — the filter handles them uniformly with everything else.
- Never leak stack traces, internal SQL, or third-party error messages to the client. Map to a code; log the detail server-side.

## Why it matters

Without a global filter, every controller invents its own error shape, status, and log format. The
client ends up writing N error handlers. Support can't triage by `code`. PII leaks through raw
ORM errors. The filter is the single seam that makes errors consistent and safe.

## Layering

```
Service throws domain error
  ↓
HttpException subclass (or AppException for dynamic / non-standard status)
  ↓
Global ExceptionFilter
  ↓
Response: { code, message, details?, traceId }, correct HTTP status
+ structured log (5xx only) with err, code, path, method, traceId
```

- **Service:** throws meaningful errors. Does not format responses.
- **Filter:** classifies, logs, redacts, and writes the wire response.
- **Controller:** never catches except to translate one domain error into another at a real boundary.

## Domain errors

- Each module owns its error classes in `module/errors/` (or in the service file if there's only one).
- Errors extend the closest semantic Nest exception:
  - `BadRequestException` → `400` (input shape, business validation)
  - `UnauthorizedException` → `401` (no/invalid auth)
  - `ForbiddenException` → `403` (auth ok, not allowed)
  - `NotFoundException` → `404`
  - `ConflictException` → `409` (uniqueness, version mismatch)
  - `UnprocessableEntityException` → `422` (semantic input failure)
  - `BadGatewayException` → `502` (upstream returned an error)
  - `ServiceUnavailableException` → `503` (self temporarily unavailable; send `Retry-After`)
  - `GatewayTimeoutException` → `504` (upstream timed out)
- Each error carries a stable `code` (e.g., `INVOICE.DUPLICATE_NUMBER`) the client can switch on. Codes follow the `MODULE.REASON` convention (both halves SCREAMING_SNAKE, joined by a dot) — see `10-error-handling.md`.
- `details` is optional and machine-readable: validation field paths, conflicting ids — never free-form prose.
- **Default to a semantic Nest parent class.** Reach for the shared `AppException` base (defined in `10-error-handling.md`) only when the status is computed at runtime (e.g., proxying an upstream's status) or genuinely outside the standard set. A fixed-status error like `LlmUpstreamTimeoutError` should still extend `GatewayTimeoutException`, not `AppException`.

```ts
export class DuplicateInvoiceNumberError extends ConflictException {
  constructor(public readonly invoiceNumber: string, cause?: unknown) {
    super(
      {
        code: 'INVOICE.DUPLICATE_NUMBER',
        message: 'An invoice with this number already exists',
        details: { invoiceNumber },
      },
      cause ? { cause } : undefined,   // ES2022 Error.cause — pino logs the chain; the wire body stays clean
    );
  }
}
```

When a service catches a driver-level error (e.g., a Postgres `23505` unique violation) and translates it, pass the original via `{ cause: e }` so the stack chain survives in logs without leaking to the client. Use this pattern wherever you rethrow.

> Codes follow the `MODULE.REASON` dotted convention from `10-error-handling.md` (e.g.,
> `USER.EMAIL_TAKEN`, `INVOICE.DUPLICATE_NUMBER`, `VALIDATION.FAILED`). Both halves stay
> SCREAMING_SNAKE; the dot is the only separator.

## The filter

- `@Catch()` (no args) catches everything. Branch on `instanceof`:
  - `HttpException` → use its status and `getResponse()` body, attach `traceId`.
  - `ValidationError`-shaped (from `class-validator`) → wrap into **422** with `code: 'VALIDATION.FAILED'` and `details: [{ field, constraints }, ...]`. Prefer the `exceptionFactory` in `09-validation.md` so this shaping happens at the pipe and the filter only has to forward the response.
  - Anything else (including raw driver/ORM errors like a Postgres `23505` that slipped through) → `500`, `code: 'INTERNAL.UNEXPECTED'`, no internal details on the wire. Translating driver errors into typed domain exceptions (`UserEmailTakenError extends ConflictException`) is the **service's** job, not the filter's — see the Stripe/charge example in `10-error-handling.md`. The filter's job is to keep raw driver text off the wire.
- Guard on `host.getType() !== 'http'` and re-throw — `@Catch()` runs in WebSocket, RPC, and BullMQ contexts too, where `switchToHttp()` returns stub objects.
- Guard on `res.headersSent` and return early — streaming, SSE, and file-download handlers may have already flushed headers; writing a JSON body now would corrupt the response. See `27-ai-streaming-sse.md` for emitting errors after `flushHeaders()`.
- Use `PinoLogger` from `nestjs-pino` (see `21-logging.md`). The `@nestjs/common` `Logger` does not accept structured-metadata signatures and stringifies objects.
- Register via `APP_FILTER` (DI) so the logger and any APM clients are injectable; do not `new` the filter in `main.ts`.
- Log 5xx with structured fields: `err` (preserves the stack and `cause` chain for APM), `code`, `path`, `method`, `traceId`, plus `userId` / `tenantId` when available from the request context. 4xx logs at debug/info max — they're expected client behavior.
- Always redact: do not include `Authorization`, `Cookie`, request body, or third-party message text in the log if they may contain secrets. Configure pino redaction paths centrally — see `21-logging.md`.
- `traceId`: trust `req.id` if upstream middleware (e.g., `nestjs-pino`'s `genReqId`) populated it; otherwise accept a bounded `X-Request-ID` header (reject empty, array-valued, or oversized) and fall back to a minted `req_${randomUUID()}`. Always echo the final id on the `X-Request-ID` response header so clients can quote it in support tickets. The canonical `getOrCreateTraceId(req)` helper lives in `10-error-handling.md`.
- Forward 5xx to APM (Sentry / Datadog / OpenTelemetry) through **exactly one** path — either a pino transport that ships `level >= error`, or an APM SDK call inside the filter. Never both, or you double-count error rates. See `10-error-handling.md` and `22-observability.md`.

## Don't

- Don't catch-rethrow in services for logging; you'll log twice and lose context.
- Don't return `200 { success: false, error: ... }` — use status codes.
- Don't return ORM/driver messages directly. They leak schema and break on driver upgrades.
- Don't use multiple specialized filters by default. One global filter, with branching, is easier to reason about than a stack of `@Catch(SpecificError)`.
- Don't put i18n in the filter. Messages are for logs and support; localization happens in the client or in a translation service.

## Anti-patterns

- A controller `try/catch` that maps to an HTTP response — that's the filter's job.
- Throwing `new Error('something')` from a service. Throw a typed exception or extend a domain error class.
- A filter that swallows `5xx` and returns `200` "to avoid client errors."
- A filter that includes the stack in the response body.
- One filter per module with overlapping `@Catch()` — order becomes load-bearing and breaks on refactor.
- A filter without `host.getType()` and `res.headersSent` guards — crashes on the first BullMQ / WebSocket exception or corrupts streaming responses.
- Calling an APM SDK *and* using a pino APM transport — pick one, or you double-count error rates and confuse on-call.
- Stringifying the cause into `details` (`details: { cause: String(e) }`) — leaks driver/3rd-party text on the wire. Pass `{ cause: e }` to the exception constructor instead so logs see the chain and the wire stays clean.

## Review checklist

- [ ] Exactly one global exception filter is registered (via `APP_FILTER`, not `app.useGlobalFilters(new …)`).
- [ ] Filter writes `{ code, message, details?, traceId }` with correct HTTP status.
- [ ] Domain errors extend the closest semantic Nest exception (`ConflictException`, `NotFoundException`, `BadGatewayException`, `GatewayTimeoutException`, …) with stable `code`s; `AppException` only for runtime-computed or genuinely non-standard statuses.
- [ ] Filter guards on `host.getType() !== 'http'` and on `res.headersSent`.
- [ ] Filter logs via `PinoLogger`, not `@nestjs/common`'s `Logger`; 5xx logged with `err`, `code`, `path`, `method`, `traceId`; 4xx not logged at error level.
- [ ] Services throw, controllers do not catch (except at translation boundaries).
- [ ] Internal/3rd-party error messages are not on the wire; rethrows preserve the original via `{ cause: e }`.
- [ ] `traceId` ties the response to a server log; the same id is echoed on the `X-Request-ID` response header.
- [ ] Sensitive fields are redacted in error logs (centralized pino redaction, not ad-hoc).
- [ ] 5xx forwarding to APM goes through exactly one path (pino transport *or* SDK call, not both).

## See also

- [`07-standard-responses.md`](./07-standard-responses.md) — success and error shape contract
- [`09-validation.md`](./09-validation.md) — `exceptionFactory` produces the `422 + VALIDATION.FAILED` shape the filter forwards
- [`10-error-handling.md`](./10-error-handling.md) — full filter implementation, `getOrCreateTraceId`, `AppException` base, APM forwarding
- [`17-pipelines-interceptors-guards.md`](./17-pipelines-interceptors-guards.md) — where the filter sits in the pipeline; `APP_FILTER` DI pattern
- [`21-logging.md`](./21-logging.md) — `nestjs-pino` setup, `genReqId`, redaction, transport
- [`22-observability.md`](./22-observability.md) — `traceId` propagation, APM correlation
- [`27-ai-streaming-sse.md`](./27-ai-streaming-sse.md) — emitting errors after `flushHeaders()` (`headersSent` path)
