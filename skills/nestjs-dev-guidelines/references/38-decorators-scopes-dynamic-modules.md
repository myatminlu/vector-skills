# 38 — Custom Decorators, Provider Scopes, Dynamic Modules

## TL;DR

- Custom param decorators extract from the request — they never authenticate, authorize, or run business logic. Auth lives in guards.
- Default to `Scope.DEFAULT` (singleton). Use `Scope.REQUEST` only when state must be per-request and an `AsyncLocalStorage`-based context wouldn't do.
- `Scope.REQUEST` cascades up the dependency chain — every consumer becomes per-request. Treat that as a perf decision, not a free knob.
- Dynamic modules (`forRoot` / `forRootAsync` / `forFeature`) are for configurable infrastructure: DB clients, HTTP clients, mailers, queue registrations. Feature modules don't need them.
- Use typed DI tokens (`InjectionToken<T>` or a `Symbol`) for `provide:` values — string tokens collide silently across modules.
- `forwardRef` is a smell, not a fix. Prefer breaking the cycle; reach for `forwardRef` only when both sides genuinely need each other.

## Why it matters

These three primitives are where senior NestJS code goes wrong silently. Wrong decorator usage
puts trust on the request body. Wrong provider scope tanks throughput by rebuilding the graph
per request. Wrong dynamic-module shape leaks config across tests and prod.

## Custom param decorators

- Read from `ExecutionContext`. Do not call services or run business logic.
- Returning a typed value from a decorator is a contract — keep it stable.
- Auth-context decorators (`@CurrentUser()`, `@TenantId()`) read from `request.user` populated by a guard. They do not authenticate; they just expose what the guard already proved.
- Validation belongs in pipes and DTOs, not in decorators. A decorator that throws on bad shape is a hidden pipe.
- A decorator may assert its own preconditions (e.g., the guard ran) — that's a contract check, not authentication or validation.

```ts
// good — pure extraction; the guard already authenticated, this just asserts it ran
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const user = ctx.switchToHttp().getRequest().user;
    // defensive assertion that the auth guard populated the request.
    // if this throws, the route is misconfigured (missing @UseGuards), not under attack.
    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH.UNAUTHENTICATED',
        message: 'No authenticated user on the request.',
      });
    }
    return user;
  },
);
```

## Provider scopes

| Scope | When |
|---|---|
| `DEFAULT` (singleton) | Most services, repositories, gateways |
| `REQUEST` | Per-request mutable state that must not leak — and only when `AsyncLocalStorage` won't fit |
| `TRANSIENT` | Per-consumer instances that need the consumer's identity (e.g., a child logger bound to the importing class) |

- Per-request data (user, tenant, correlation id) belongs in `AsyncLocalStorage`-backed context, not in `Scope.REQUEST` providers.
- A single `Scope.REQUEST` provider forces every dependent provider to also be request-scoped, which means a graph rebuild per request and lost provider lifecycle hooks.
- Loggers and tracers usually do not need `REQUEST` scope — they accept context per call.
- `TRANSIENT` is legitimate but uncommon: prefer it only when each consumer genuinely needs its own instance (e.g., a logger that captures `MyService.name` at injection time). Otherwise it's a smell.

## Dynamic modules

- Use for infrastructure that needs config: DB modules, queue modules, mail, storage, feature flags.
- `forRoot(options)` for static config; `forRootAsync({ useFactory, inject })` for config derived at boot from `ConfigService`.
- `forFeature(...)` registers per-module pieces against an already-rooted module — e.g., `TypeOrmModule.forFeature([Entity])`, `BullModule.forFeature({ name })`. Use it inside the feature module that owns the entities/queues; do not call `forRoot` again.
- For new modules with several options, prefer `ConfigurableModuleBuilder` over hand-rolling `forRoot`/`forRootAsync` — it generates a typed builder, async wiring, and `MODULE_OPTIONS_TOKEN` for you.
- Export `Global()` only when the module is truly app-wide infra; feature modules import explicitly.
- Keep options strongly typed; validate at boot (Zod) the same way you validate env.
- Use a typed DI token for `provide:` — `const STRIPE_CLIENT = Symbol('STRIPE_CLIENT')` or an `InjectionToken<Stripe>`. String literals collide silently across modules and lose type information at the injection site.

```ts
// good — async config wired through ConfigService, typed token
export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

@Module({})
export class StripeModule {
  static forRootAsync(): DynamicModule {
    return {
      module: StripeModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: STRIPE_CLIENT,
          inject: [ConfigService],
          useFactory: (cfg: ConfigService) => new Stripe(cfg.getOrThrow('STRIPE_SECRET')),
        },
      ],
      exports: [STRIPE_CLIENT],
    };
  }
}
```

## Circular dependencies and `forwardRef`

- A circular dep almost always means the boundary is wrong. Two services that need each other are usually one service split too eagerly, or two services that should communicate via an event.
- Refactor first: extract the shared logic into a third service, or invert the dependency by emitting an event.
- Only when both directions are genuinely required (e.g., `UserService` reads notification preferences while `NotificationService` resolves the recipient's user record), use `forwardRef(() => OtherModule)` and document why in a comment above the import.

## Anti-patterns

- A param decorator that runs queries or calls services.
- A param decorator that "validates" — that's a pipe.
- Marking a service `Scope.REQUEST` to carry a user id; use `AsyncLocalStorage` instead.
- A feature module exposing `forRoot` for config it doesn't actually need.
- String literals as DI tokens (`provide: 'STRIPE_CLIENT'`) — use a `Symbol` or `InjectionToken<T>`.
- Using `forwardRef` to "make it compile" without understanding the cycle.
- Re-exporting an internal provider from `index.ts` so other modules can DI it directly — that breaks module boundaries.

## Review checklist

- [ ] Param decorators only read from the request; no logic, no IO, no service calls.
- [ ] Auth-context decorators rely on a guard having populated `request.user`; the only thrown error is a contract assertion.
- [ ] No `Scope.REQUEST` unless explicitly justified; `AsyncLocalStorage` preferred for per-request context.
- [ ] `Scope.TRANSIENT` is used only when each consumer genuinely needs its own instance.
- [ ] Dynamic modules are reserved for configurable infra; options are typed and validated; `forFeature` is used for per-module registration.
- [ ] DI tokens are `Symbol` or `InjectionToken<T>`, not bare strings.
- [ ] No `forwardRef` without a comment explaining why the cycle is real.
- [ ] Module boundaries respected: external callers go through the module's exported service, not internal providers.

## See also

- [`03-module-design.md`](./03-module-design.md) — module boundaries and exports
- [`04-code-quality.md`](./04-code-quality.md) — DI, layering
- [`12-authentication-patterns.md`](./12-authentication-patterns.md) — `request.user` and the auth guard
- [`17-pipelines-interceptors-guards.md`](./17-pipelines-interceptors-guards.md) — pipe vs decorator boundary
- [`20-configuration.md`](./20-configuration.md) — env validation for dynamic-module options
