# 10 — Error Handling

## TL;DR

- Hybrid error taxonomy: **HTTP status** + **namespaced code** + **trace ID**.
- Throw early. Catch only when you can meaningfully recover. Never swallow.
- **Default —** domain errors extend the closest semantic Nest exception (`ConflictException`, `NotFoundException`, `BadGatewayException`, `GatewayTimeoutException`, …) and carry a stable `code`. Reach for a shared `AppException` base only when the status is computed at runtime (e.g., proxying an upstream's status) or genuinely non-standard.
- A single global `AllExceptionsFilter` shapes every HTTP error into the standard error body.
- The filter **must** branch on `host.getType()` (it is invoked outside HTTP too — BullMQ workers, gateways, microservices) and **must** skip writing when `response.headersSent` (streaming, file download, raw handlers).
- Use the project's structured logger (`PinoLogger` from `nestjs-pino`, see `21-logging.md`). The `@nestjs/common` `Logger` does not accept structured-metadata signatures and will stringify objects.
- Log 5xx with stack and forward to your APM (Sentry, Datadog). Don't log 4xx unless debugging a client (they're expected).

## Why it matters

Error handling is the most-read code during incidents. Inconsistent error handling turns a
small bug into a multi-hour outage because nobody can figure out what the error means. A
stable taxonomy is the difference between "page the on-call" and "engineer grep the code
path in ten seconds."

## Taxonomy

Every error has three parts:

1. **HTTP status** (from the spec — what kind of failure)
2. **`code`** — dotted, uppercase, stable: `<NAMESPACE>.<REASON>` — `USER.EMAIL_TAKEN`, `PAYMENT.INSUFFICIENT_FUNDS`
3. **`traceId`** — correlation ID matching logs and `X-Request-ID`

Clients switch on `code` (never on `message`). Humans read `message`. Support traces by `traceId`.

### Naming codes

- Namespace is the module or subsystem: `USER`, `AUTH`, `PAYMENT`, `BILLING`, `VALIDATION`, `LLM`, `RATE_LIMIT`, `WEBHOOK`, `IDEMPOTENCY`.
- Reason is a short `SCREAMING_SNAKE`: `NOT_FOUND`, `ALREADY_EXISTS`, `INSUFFICIENT_PERMISSION`, `QUOTA_EXCEEDED`.
- Examples:
  - `USER.EMAIL_TAKEN` → 409
  - `AUTH.INVALID_CREDENTIALS` → 401
  - `AUTH.SESSION_EXPIRED` → 401
  - `AUTH.INSUFFICIENT_PERMISSION` → 403
  - `USER.NOT_FOUND` → 404
  - `PAYMENT.DECLINED` → 402
  - `PAYMENT.INSUFFICIENT_FUNDS` → 402
  - `BILLING.QUOTA_EXCEEDED` → 429
  - `VALIDATION.FAILED` → 422
  - `IDEMPOTENCY.KEY_MISMATCH` → 422
  - `RATE_LIMIT.EXCEEDED` → 429
  - `LLM.UPSTREAM_TIMEOUT` → 504
  - `WEBHOOK.SIGNATURE_INVALID` → 401

Keep the registry in a shared `common/types/error-codes.ts` enum so codes are typed at usage sites and stay stable. The cross-cut rule for namespaced, stable codes is `R6` in `31-rules-rationale-examples.md`.

## Throwing domain errors

### Default — extend the closest semantic Nest exception

Each module owns its error classes in `module/errors/` (or in the service file if there is only one). The class name documents the failure; the parent class fixes the HTTP status.

| Parent | Status | Use for |
|---|---|---|
| `BadRequestException` | 400 | malformed input the pipe could not catch |
| `UnauthorizedException` | 401 | no/invalid credentials, expired session |
| `ForbiddenException` | 403 | authenticated but not allowed |
| `NotFoundException` | 404 | resource does not exist |
| `ConflictException` | 409 | uniqueness violation, version mismatch |
| `UnprocessableEntityException` | 422 | semantic input failure |
| `BadGatewayException` | 502 | upstream returned an error |
| `ServiceUnavailableException` | 503 | self temporarily unavailable, send `Retry-After` |
| `GatewayTimeoutException` | 504 | upstream call timed out |

```ts
// users/errors/user-email-taken.error.ts
import { ConflictException } from '@nestjs/common';

export class UserEmailTakenError extends ConflictException {
  constructor(public readonly email: string) {
    super({
      code: 'USER.EMAIL_TAKEN',
      message: `Email ${email} is already registered.`,
      details: { email },
    });
  }
}

// users/users.service.ts
if (await this.repo.existsByEmail(dto.email)) {
  throw new UserEmailTakenError(dto.email);
}
```

The class name is self-documenting, the code is guaranteed consistent, and tests can assert on the typed class.

### Quick throws — built-in Nest exceptions with a `code`

NestJS ships these — convenient for one-offs, but **always** include `code`:

```ts
throw new NotFoundException({ code: 'USER.NOT_FOUND', message: 'User not found.' });
throw new ForbiddenException({ code: 'AUTH.INSUFFICIENT_PERMISSION', message: '...' });
throw new ConflictException({ code: 'USER.EMAIL_TAKEN', message: '...' });
throw new UnauthorizedException({ code: 'AUTH.SESSION_EXPIRED', message: '...' });
```

The filter reads `code` from the body. If you don't provide one, it falls back to the default for that status.

### Fallback — shared `AppException` base for dynamic / custom statuses

Almost every standard HTTP status has a Nest exception (`BadGatewayException`, `GatewayTimeoutException`, `ServiceUnavailableException`, …). Reach for `AppException` only when:

- The status is computed at runtime (e.g., reflecting an upstream's status when proxying).
- The status is genuinely outside the standard set.
- You need a uniform `(status, body, options)` constructor across many call sites.

```ts
// common/errors/app.exception.ts
import { HttpException, HttpExceptionOptions } from '@nestjs/common';

export interface AppErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class AppException extends HttpException {
  constructor(status: number, body: AppErrorBody, options?: HttpExceptionOptions) {
    super(body, status, options);   // forwards { cause } so Error chains survive
  }
}
```

For a fixed-status case, prefer the semantic Nest parent:

```ts
// llm/errors/llm-upstream-timeout.error.ts
import { GatewayTimeoutException } from '@nestjs/common';

export class LlmUpstreamTimeoutError extends GatewayTimeoutException {
  constructor(cause?: unknown) {
    super(
      { code: 'LLM.UPSTREAM_TIMEOUT', message: 'Upstream model timed out.' },
      cause ? { cause } : undefined,
    );
  }
}
```

## The global filter

```ts
// types/express.d.ts (declared once, project-wide)
//   declare module 'express' {
//     interface Request { id?: string }
//   }
// nestjs-pino's genReqId (see 21-logging.md) populates req.id; the filter just reads it.

// common/filters/all-exceptions.filter.ts
import { randomUUID } from 'crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Request, Response } from 'express';

// Bounded to defend against malformed upstream proxies or header-smuggling.
// 128 covers UUIDs, ULIDs, and most distributed-tracing IDs with headroom.
const MAX_REQUEST_ID_LENGTH = 128;

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

function getOrCreateTraceId(req: Request): string {
  // Trust req.id if upstream middleware (nestjs-pino genReqId) already set it.
  if (typeof req.id === 'string' && req.id.length > 0) return req.id;

  const incoming = req.headers['x-request-id'];
  if (
    typeof incoming === 'string' &&
    incoming.trim().length > 0 &&
    incoming.length < MAX_REQUEST_ID_LENGTH
  ) {
    return incoming.trim();
  }
  return `req_${randomUUID()}`;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // The filter is registered globally and `@Catch()` matches every context
    // (HTTP, WebSocket, RPC, BullMQ workers wired through Nest). switchToHttp()
    // returns stub objects outside HTTP — re-throw and let the right handler deal.
    if (host.getType() !== 'http') throw exception;

    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // Streaming, raw Node handlers, or file downloads may have already flushed
    // headers. Writing a JSON body now would corrupt the response.
    if (res.headersSent) return;

    const err = this.normalize(exception);
    const traceId = getOrCreateTraceId(req);
    res.setHeader('X-Request-ID', traceId);

    if (err.status >= 500) {
      // Structured metadata first, message second — pino's signature.
      // The error object is preserved here so APM exporters (Sentry, Datadog)
      // wired via pino transport receive the original stack and `cause` chain.
      this.logger.error(
        {
          err: exception,
          code: err.code,
          path: req.url,
          method: req.method,
          traceId,
        },
        err.message,
      );
    }

    res.status(err.status).json({
      code: err.code,
      message: err.message,
      details: err.details,
      traceId,
    });
  }

  private normalize(e: unknown): NormalizedError {
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const response = e.getResponse();
      if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        // class-validator default shape: { message: string[], error: string }
        // Should not normally reach here — the ValidationPipe exceptionFactory
        // in 09-validation.md reshapes this at the pipe boundary. Defensive only.
        if (Array.isArray(r.message)) {
          return {
            status,
            code: 'VALIDATION.FAILED',
            message: 'Request validation failed.',
            details: r.message,
          };
        }
        return {
          status,
          code: (r.code as string) ?? this.defaultCodeFor(status),
          message: (r.message as string) ?? e.message,
          details: r.details,
        };
      }
      return { status, code: this.defaultCodeFor(status), message: String(response) };
    }
    // Unknown / non-HttpException — treat as 500. Never leak the real message.
    return { status: 500, code: 'INTERNAL.UNEXPECTED', message: 'Something went wrong.' };
  }

  private defaultCodeFor(status: number): string {
    switch (status) {
      case 400: return 'REQUEST.BAD';
      case 401: return 'AUTH.UNAUTHORIZED';
      case 403: return 'AUTH.FORBIDDEN';
      case 404: return 'RESOURCE.NOT_FOUND';
      case 409: return 'RESOURCE.CONFLICT';
      // 422 fallback is intentionally generic. `VALIDATION.FAILED` is owned by
      // the ValidationPipe exceptionFactory; other 422s (idempotency, semantic
      // input failures) get a neutral default and override with their own code.
      case 422: return 'REQUEST.UNPROCESSABLE';
      case 429: return 'RATE_LIMIT.EXCEEDED';
      case 503: return 'SERVICE.UNAVAILABLE';
      default:  return 'INTERNAL.UNEXPECTED';
    }
  }
}

// app.module.ts — register globally with DI so PinoLogger is injectable.
//   import { APP_FILTER } from '@nestjs/core';
//   providers: [
//     { provide: APP_FILTER, useClass: AllExceptionsFilter },
//   ],
```

> **Why `APP_FILTER` and not `app.useGlobalFilters(new AllExceptionsFilter(...))`:** the
> filter needs `PinoLogger` injected. Instantiating it in `main.ts` skips the DI container
> and you'd have to construct the logger by hand. See `17-pipelines-interceptors-guards.md`
> for the global-with-DI pattern.

### Forwarding 5xx to APM

The filter is the single seam where every server-side error funnels through, so it is the
right place to forward to Sentry / Datadog / OpenTelemetry. Either:

- Attach a pino transport that ships `level >= error` events to your APM (preferred — one
  pipeline, no duplication). `21-logging.md` covers transport setup.
- Or call your APM SDK directly inside the `if (err.status >= 500)` branch, with the same
  `traceId` so logs and traces line up. See `22-observability.md` for trace propagation.

Never call both: you'll double-count error rates and confuse on-call.

## Don't-s

### Don't swallow

```ts
// ❌
try { await dangerous(); } catch { /* whatever */ }

// ❌
try { await dangerous(); } catch (e) { console.log(e); }

// ❌  caller now confuses "no result" with "error"
try { return await dangerous(); } catch (e) { return null; }
```

### Do recover explicitly

```ts
try {
  return await this.cache.get(key);
} catch (e) {
  this.logger.warn({ err: e, key }, 'cache read failed, falling back to DB');
  return await this.db.find(key);
}
```

Never omit `traceId` from an error response. If upstream middleware/logger already generated
a request id, reuse it; otherwise accept only a bounded string `X-Request-ID`, ignore empty,
array-valued, or oversized values, mint a fallback, and echo the final id via `X-Request-ID`.

### Don't rethrow without context (if you catch)

```ts
// ❌ no context added; might as well not catch
try { await a(); } catch (e) { throw e; }

// ❌ leaks driver/3rd-party message text on the wire (column names, SQL, secrets)
try {
  await a();
} catch (e) {
  throw new InternalServerErrorException({
    code: 'A.FAILED',
    message: 'Step A failed',
    details: { cause: String(e) },
  });
}

// ✅ preserve cause for logs, do not leak it on the wire
try {
  await a();
} catch (e) {
  throw new InternalServerErrorException(
    { code: 'A.FAILED', message: 'Step A failed' },
    { cause: e },          // ES2022 Error.cause — pino logs the chain; the filter does not
  );
}
```

Every Nest `HttpException` (and our `AppException`) accepts an `options` object (`{ cause }`)
on Nest 9+. The filter logs the chain via the `err` field; the wire body stays clean.

### Don't leak internals

- No stack traces in responses.
- No DB error messages (they may contain column names, query fragments).
- No third-party API error bodies copied verbatim.
- No raw `Error.message` in `details`. If you need machine context, surface only fields you control (`{ provider: 'stripe', declineCode: e.decline_code }`).

## 5xx vs 4xx

- **4xx = client's fault.** Return the error; do not log stack. Optional info log for debugging.
- **5xx = your fault.** Log with stack and full context. Page on-call if frequency exceeds threshold.
- **Don't return 5xx when it's 4xx.** If a user sent bad data, it's a 4xx. Don't `throw e` into a 500 when a `BadRequestException` is correct.

## Retries and 5xx

- **Idempotent requests** (GET, PUT, DELETE): clients can retry. Include `Retry-After` on 503.
- **Non-idempotent** (POST without `Idempotency-Key`): clients cannot safely retry. Document this.
- **Your own retries** (to upstreams): exponential backoff, jitter, max attempts, circuit breaker.

## Timeouts

Every outbound call has a timeout — no exceptions. Never a default infinite Fetch/axios timeout.

```ts
// Verify the target Node runtime supports AbortSignal.timeout before copying.
const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
```

If the timeout fires, throw a `GatewayTimeoutException` (or a typed subclass like
`LlmUpstreamTimeoutError`).

## Good vs bad

### Good

```ts
async charge(userId: string, amountCents: number): Promise<Payment> {
  const user = await this.users.findById(userId);
  if (!user.paymentMethodId) {
    throw new UnprocessableEntityException({
      code: 'PAYMENT.NO_PAYMENT_METHOD',
      message: 'User has no payment method on file.',
    });
  }
  try {
    return await this.stripe.charge(user.paymentMethodId, amountCents);
  } catch (e) {
    if (isStripeCardError(e)) {
      // 402 has no semantic Nest exception, so AppException carries the status.
      throw new AppException(
        402,
        {
          code: 'PAYMENT.DECLINED',
          message: 'Card declined.',
          details: { declineCode: e.decline_code },   // controlled field, safe
        },
        { cause: e },
      );
    }
    throw new BadGatewayException(
      { code: 'PAYMENT.UPSTREAM_ERROR', message: 'Payment provider error.' },
      { cause: e },
    );
  }
}
```

### Bad

```ts
async charge(userId: string, amountCents: number): Promise<any> {
  try {
    const user = await this.users.findById(userId);
    return await this.stripe.charge(user.paymentMethodId!, amountCents);
  } catch (e) {
    console.log(e);                         // ❌ swallowed, unstructured
    return { error: 'charge failed' };      // ❌ not thrown, not typed, leaks as 200
  }
}
```

## Anti-patterns

- Bare `catch { }` or `catch (e) { console.log(e); }`.
- Returning error objects instead of throwing (`return { error: '...' }`).
- Throwing strings: `throw 'bad'`. Always an `Error` subclass.
- Deep `try/catch` nesting. Flatten by early returns or by letting the filter handle it.
- Custom HTTP status codes (999, 422 for auth) — use the standard ones.
- Omitting `traceId` in error responses. Support will ask for it.
- Revealing internal structure in `details` (table names, file paths, raw `Error.message`).
- Using the `@nestjs/common` `Logger` for structured fields. It serializes objects as strings; use `PinoLogger`.
- Filter without a `host.getType()` guard. It will crash on the first BullMQ or websocket exception.
- Calling APM SDK *and* using a pino APM transport — pick one to avoid double-counting.

## Code review checklist

- [ ] Every thrown error is an `HttpException` (or subclass) with a `code`
- [ ] Domain errors extend the closest semantic Nest exception (`ConflictException`, `NotFoundException`, …); `AppException` only for non-semantic statuses
- [ ] HTTP status matches meaning (no 500 for validation, no 200 for error)
- [ ] Global `AllExceptionsFilter` registered via `APP_FILTER` (so `PinoLogger` is injected)
- [ ] Filter guards on `host.getType() !== 'http'` and on `res.headersSent`
- [ ] 5xx logged with `PinoLogger` (structured), 4xx logged at debug/info max
- [ ] No `console.log(e)`; no bare `catch { }`
- [ ] Rethrows preserve the original error via `{ cause: e }`, not via stringification
- [ ] No internal state leaked in `details` (paths, queries, raw `Error.message`, stack)
- [ ] `traceId` present in every error response and matches `X-Request-ID`
- [ ] Outbound calls have timeouts and handled failures
- [ ] 5xx forwarding to APM goes through exactly one path (pino transport *or* SDK call, not both)

## See also

- [`07-standard-responses.md`](./07-standard-responses.md) — standard error response body
- [`09-validation.md`](./09-validation.md) — `exceptionFactory` produces `422 + VALIDATION.FAILED`
- [`17-pipelines-interceptors-guards.md`](./17-pipelines-interceptors-guards.md) — where the filter sits, `APP_FILTER` DI pattern
- [`21-logging.md`](./21-logging.md) — `nestjs-pino` setup, `genReqId`, redaction, transport
- [`22-observability.md`](./22-observability.md) — trace propagation, APM correlation
- [`27-ai-streaming-sse.md`](./27-ai-streaming-sse.md) — emitting errors after `flushHeaders()`
- [`39-exception-filters.md`](./39-exception-filters.md) — filter design, domain error layering
