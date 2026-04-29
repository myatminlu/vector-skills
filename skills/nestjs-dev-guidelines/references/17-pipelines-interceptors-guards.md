# 17 — Pipelines, Interceptors, Guards

## TL;DR

- Execution order per request: **Middleware → Guard → Interceptor (pre) → Pipe → Handler → Interceptor (post) → Exception Filter**.
- **Guard** — answers "is this allowed?" (authN/authZ, throttling). Returns boolean; sync or async.
- **Pipe** — transforms and validates input (DTO via `ValidationPipe`, `ParseUUIDPipe`, etc.).
- **Interceptor** — wraps the handler (logging, timing, timeout, caching, tracing).
- **Filter** — catches thrown exceptions; shapes into the standard error response body.
- One per concern. Don't do authZ in a pipe or validation in a guard.

## The chain (visualized)

```
HTTP request
    ↓
[Global Middleware]          e.g. pino-http (request logger, correlation id)
    ↓
[Module Middleware]          rare; consumer-configured per-route
    ↓
[Guards]                     auth, throttle, permission — first to fail 401/403/429
    ↓
[Interceptors — before]      start timer, tracing span, timeout setup
    ↓
[Pipes]                      ValidationPipe (DTO), ParseUUIDPipe, custom transforms
    ↓
[Handler]                    your @Get / @Post method
    ↓
[Interceptors — after]       measure timing, emit span, set caching headers
    ↓
(response written)
    ↓
[Exception Filter]           only if something threw; builds the error response body
    ↓
HTTP response
```

Register globals in `main.ts`; per-controller with `@UseGuards` / `@UseInterceptors` /
`@UsePipes`; per-handler likewise.

## Guards

- One job: **should this request continue?**
- Access: `req`, `req.user`, `req.headers`, route metadata (via `Reflector`).
- Typical guards: `AuthGuard`, `RolesGuard`, `ScopeGuard`, `ThrottlerGuard`.

```ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required) return true;
    const user = ctx.switchToHttp().getRequest().user;
    return !!user?.roles?.some((r: string) => required.includes(r));
  }
}
```

### Ordering multiple guards

`@UseGuards(AuthGuard, RolesGuard)` — runs left to right. Fail fast.

### Global auth + opt-out

```ts
// app.module.ts
providers: [{ provide: APP_GUARD, useClass: AuthGuard }]

// Public decorator
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

// in AuthGuard canActivate(ctx: ExecutionContext):
if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
  ctx.getHandler(),
  ctx.getClass(),
])) return true;
```

## Pipes

- Validate and/or transform. Run for specific params (or globally for all bodies).
- Throw `BadRequestException` on invalid; don't return booleans.

### Built-in

- `ValidationPipe` — DTO validation (class-validator).
- `ParseIntPipe`, `ParseBoolPipe`, `ParseUUIDPipe`, `ParseEnumPipe`.
- `DefaultValuePipe(20)` — chained: `@Query('limit', new DefaultValuePipe(20), ParseIntPipe)`.

### Global

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
}));
```

### Custom

```ts
@Injectable()
export class TrimPipe implements PipeTransform<unknown> {
  transform(value: unknown) {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value === 'object') {
      for (const k of Object.keys(value)) {
        if (typeof (value as any)[k] === 'string') (value as any)[k] = (value as any)[k].trim();
      }
    }
    return value;
  }
}
```

Pipes should be **stateless** — rely only on input, not on DB / external.

## Interceptors

- Wrap the handler via RxJS. Can transform input, transform output, short-circuit, or observe.
- Typical: `LoggingInterceptor`, `TimeoutInterceptor`, `CacheInterceptor`, `TracingInterceptor`.

### Response body shape

Response bodies are not shaped by a global interceptor in this skill's conventions — the success
body is chosen in the controller or response DTO, and the error body is produced by the global
exception filter. See `07-standard-responses.md` and `10-error-handling.md`.

### Timeout

```ts
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly ms = 10_000) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.ms),
      catchError(err =>
        err instanceof TimeoutError
          ? throwError(() => new RequestTimeoutException({
              code: 'REQUEST.TIMEOUT',
              message: 'Request timed out.',
            }))
          : throwError(() => err),
      ),
    );
  }
}
```

### Logging + timing

```ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(LoggingInterceptor.name) private readonly logger: PinoLogger,
  ) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    const start = Date.now();
    return next.handle().pipe(
      tap({
        next: () => this.logger.info({
          method: req.method, url: req.url, durationMs: Date.now() - start, status: 'ok',
        }, 'request handled'),
        error: (err) => this.logger.warn({
          method: req.method, url: req.url, durationMs: Date.now() - start,
          status: 'err', errCode: err?.response?.code,
        }, 'request failed'),
      }),
    );
  }
}
```

### Caching

```ts
@UseInterceptors(CacheInterceptor)
@CacheTTL(30) // seconds
@Get('/rates')
```

Good for pure reads, bounded cardinality, safe staleness. Never cache auth decisions or user-specific data by default.

## Exception filters

- Catch thrown exceptions, shape into the standard error body.
- `@Catch()` — catch all. `@Catch(HttpException)` — only these.
- Register global via `APP_FILTER` so dependencies (e.g. `PinoLogger`) inject cleanly:
  `providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }]`.
- **Must** branch on `host.getType()` — `@Catch()` matches every context (HTTP, WebSocket, RPC, BullMQ); re-throw outside HTTP so the right handler runs.
- **Must** skip write when `response.headersSent` (streaming, raw Node handlers).

See `10-error-handling.md`.

## Scope

Guards / interceptors / pipes / filters can be:

- **Global** (`app.use*`) — one instance for the whole app.
- **Controller-level** (`@UseGuards` on class) — inherited by routes.
- **Route-level** (`@UseGuards` on method) — override class.
- **Injectable class or instance** — class enables DI; instance is quick-and-dirty.

Prefer class form (DI) for anything that needs services.

### Global with DI

```ts
// app.module.ts
providers: [
  { provide: APP_GUARD, useClass: AuthGuard },
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  {
    provide: APP_PIPE,
    useValue: new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  },
  { provide: APP_FILTER, useClass: AllExceptionsFilter },
],
```

This enables DI in global components (e.g., guards injecting a revocation service).

## Interceptor ordering

Interceptors execute in the order you list them for the "before" phase; reverse for the
"after" phase — standard onion pattern.

```
before:  [A] [B] [C]
handler:         ↓
after:   [C] [B] [A]
```

So register `LoggingInterceptor` first (outermost) to measure total, `TimeoutInterceptor`
inside, `TracingInterceptor` innermost (so timing includes tracing overhead).

## Middleware vs interceptor vs guard

- **Middleware**: raw Node `(req, res, next)`. No access to NestJS DI, no handler context.
  Use for: framework-level concerns like request id, CORS, helmet, body parsing.
- **Guard**: has DI, has route metadata. Use for: auth decisions.
- **Interceptor**: has DI, has handler context, can transform response. Use for: cross-cutting handler behavior.
- **Pipe**: has DI, scoped to a single parameter. Use for: transform + validate that parameter.

Rule of thumb: Middleware runs for everything including non-route paths. Guards/Interceptors/
Pipes only run once NestJS picks a route. Filters run only on throw.

## Good vs bad

### Good

```ts
@Controller({ path: 'orders', version: '1' })
@UseGuards(AuthGuard)                        // class-level guard
@UseInterceptors(LoggingInterceptor)         // class-level observer
export class OrderController {
  @Post()
  @UseGuards(new ScopeGuard('orders:write')) // route-level extra guard
  @UsePipes(new ValidationPipe({ transform: true }))
  async create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser) {
    return this.orders.create(user.id, dto);
  }
}
```

### Bad

```ts
@Controller('orders')
export class OrderController {
  @Post()
  async create(@Body() body: any, @Req() req: any) {     // no pipe, no DTO, no guard
    if (!req.headers.authorization) return { error: 'auth' };  // manual auth — don't
    return this.db.query('INSERT INTO orders ...', [body]);    // no validation, SQLi risk
  }
}
```

## Anti-patterns

- Authorization in a pipe or interceptor (it belongs in a guard).
- Validation in a guard (it belongs in a pipe / DTO).
- Global interceptors that mutate request state others depend on (fragile).
- Interceptors that catch exceptions (use filters).
- Pipes with external IO (blocking the request pipeline; move to service).
- Filters that return 200 on error.
- Guards that validate request body shape (validation belongs in pipes/DTOs; guards should
  authorize, not validate input). The body is parsed by middleware before guards run, so it's
  technically reachable — but reading it there couples auth to payload shape and skips the
  DTO whitelist.

## Code review checklist

- [ ] Guards handle only auth/permission/throttle; no data mutation
- [ ] Pipes handle only validation/transform; no DB calls
- [ ] Interceptors stay pure (logging, timing, tracing, caching); they don't decide auth and don't shape success or error response bodies
- [ ] Filter catches all; shapes errors into `{ code, message, details?, traceId }`; skips on `headersSent`
- [ ] Global components registered via `APP_*` tokens for DI
- [ ] Order of multiple guards / interceptors is intentional
- [ ] No middleware does what a guard/interceptor should do

## See also

- [`07-standard-responses.md`](./07-standard-responses.md) — response contract
- [`09-validation.md`](./09-validation.md) — ValidationPipe
- [`10-error-handling.md`](./10-error-handling.md) — AllExceptionsFilter
- [`12-authentication-patterns.md`](./12-authentication-patterns.md) — AuthGuard
