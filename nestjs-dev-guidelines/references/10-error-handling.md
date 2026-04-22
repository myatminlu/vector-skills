# 10 — Error Handling

## TL;DR

- Hybrid error taxonomy: **HTTP status** + **namespaced code** + **trace ID**.
- Throw early. Catch only when you can meaningfully recover. Never swallow.
- Domain errors extend `HttpException` (or a shared base class) and carry a stable `code`.
- A single global `AllExceptionsFilter` shapes every error into the standard envelope.
- The filter **must** skip writing when `response.headersSent` (streaming, file download, raw handlers).
- Log 5xx with stack. Don't log 4xx unless debugging a client (they're expected).

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

Keep a registry in `references/31-rules-rationale-examples.md` or a shared `common/types/error-codes.ts` enum.

## Throwing domain errors

### Option A — extend `HttpException` directly

```ts
import { HttpException, HttpStatus } from '@nestjs/common';

// Usage
throw new HttpException(
  { code: 'USER.EMAIL_TAKEN', message: 'That email is already registered.' },
  HttpStatus.CONFLICT,
);
```

### Option B — a shared `AppException` base (recommended at scale)

```ts
// common/errors/app.exception.ts
import { HttpException } from '@nestjs/common';

export interface AppErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class AppException extends HttpException {
  constructor(status: number, body: AppErrorBody) {
    super(body, status);
  }
}

// and per-namespace subclasses for readability
export class UserEmailTakenError extends AppException {
  constructor(email: string) {
    super(409, {
      code: 'USER.EMAIL_TAKEN',
      message: `Email ${email} is already registered.`,
      details: { email },
    });
  }
}
```

Then:
```ts
if (await this.repo.existsByEmail(dto.email)) throw new UserEmailTakenError(dto.email);
```

The class name becomes self-documenting and the error code is guaranteed consistent.

## The global filter

```ts
// common/filters/all-exceptions.filter.ts
import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface NormalizedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // Critical: if downstream already wrote (streaming, raw node handlers),
    // do not attempt to write a JSON envelope.
    if (res.headersSent) return;

    const err = this.normalize(exception);
    const traceId = (req as any).id ?? req.headers['x-request-id'] ?? undefined;

    if (err.status >= 500) {
      this.logger.error(
        { err: exception, code: err.code, path: req.url, method: req.method, traceId },
        err.message,
      );
    }

    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, traceId },
    });
  }

  private normalize(e: unknown): NormalizedError {
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const response = e.getResponse();
      if (typeof response === 'object' && response !== null) {
        const r = response as Record<string, unknown>;
        // class-validator error
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
    // unknown, treat as 500
    return { status: 500, code: 'INTERNAL.UNEXPECTED', message: 'Something went wrong.' };
  }

  private defaultCodeFor(status: number): string {
    switch (status) {
      case 400: return 'REQUEST.BAD';
      case 401: return 'AUTH.UNAUTHORIZED';
      case 403: return 'AUTH.FORBIDDEN';
      case 404: return 'RESOURCE.NOT_FOUND';
      case 409: return 'RESOURCE.CONFLICT';
      case 422: return 'VALIDATION.FAILED';
      case 429: return 'RATE_LIMIT.EXCEEDED';
      case 503: return 'SERVICE.UNAVAILABLE';
      default:  return 'INTERNAL.UNEXPECTED';
    }
  }
}

// main.ts
app.useGlobalFilters(new AllExceptionsFilter());
```

## Don't-s

### Don't swallow

```ts
// ❌
try {
  await dangerous();
} catch { /* whatever */ }

// ❌
catch (e) { console.log(e); }

// ❌
catch (e) { return null; }   // caller now confuses "no result" with "error"
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

### Don't rethrow without context (if you catch)

```ts
// ❌
try { await a(); } catch (e) { throw e; }

// ✅
try {
  await a();
} catch (e) {
  throw new AppException(500, { code: 'A.FAILED', message: 'Step A failed', details: { cause: String(e) } });
}
```

### Don't leak internals

- No stack traces in responses.
- No DB error messages (they may contain column names, query fragments).
- No third-party API error bodies copied verbatim.

## When to use which built-in HttpException

NestJS ships a bunch of these — convenient, but always include `code`:

```ts
throw new NotFoundException({ code: 'USER.NOT_FOUND', message: 'User not found.' });
throw new ForbiddenException({ code: 'AUTH.INSUFFICIENT_PERMISSION', message: '...' });
throw new ConflictException({ code: 'USER.EMAIL_TAKEN', message: '...' });
throw new UnauthorizedException({ code: 'AUTH.SESSION_EXPIRED', message: '...' });
```

The filter reads the `code` from the body. If you don't provide one, it falls back to the
default for that status.

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
const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
```

If the timeout fires, throw `new AppException(504, { code: 'UPSTREAM.TIMEOUT', ... })`.

## Good vs bad

### Good

```ts
async charge(userId: string, amountCents: number): Promise<Payment> {
  const user = await this.users.findById(userId);
  if (!user.paymentMethodId) {
    throw new AppException(422, {
      code: 'PAYMENT.NO_PAYMENT_METHOD',
      message: 'User has no payment method on file.',
    });
  }
  try {
    return await this.stripe.charge(user.paymentMethodId, amountCents);
  } catch (e) {
    if (isStripeCardError(e)) {
      throw new AppException(402, {
        code: 'PAYMENT.DECLINED',
        message: 'Card declined.',
        details: { declineCode: e.decline_code },
      });
    }
    throw new AppException(502, {
      code: 'PAYMENT.UPSTREAM_ERROR',
      message: 'Payment provider error.',
    });
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
- Revealing internal structure in `details` (table names, file paths).

## Code review checklist

- [ ] Every thrown error is an `HttpException` (or subclass) with a `code`
- [ ] HTTP status matches meaning (no 500 for validation, no 200 for error)
- [ ] Global `AllExceptionsFilter` registered and handles unknown + validation + HttpException
- [ ] Filter skips write on `headersSent`
- [ ] 5xx logged with stack; 4xx logged at debug/info max
- [ ] No `console.log(e)`; no bare `catch { }`
- [ ] No internal state leaked in `details` (paths, queries, stack)
- [ ] `traceId` present in every error response
- [ ] Outbound calls have timeouts and handled failures

## See also

- [`07-standard-responses.md`](./07-standard-responses.md) — envelope for errors
- [`21-logging.md`](./21-logging.md) — structured logging + correlation
- [`11-security.md`](./11-security.md) — what to never leak in errors
- [`17-pipelines-interceptors-guards.md`](./17-pipelines-interceptors-guards.md) — where the filter sits
