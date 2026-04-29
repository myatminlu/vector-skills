# 03 — Module Design

## TL;DR

- One module per bounded context. A module owns its DB tables, services, controllers, DTOs.
- Internal layout: `module.ts`, `controller.ts`, `service.ts`, `dto/`, `entities/`, `utils/`, `index.ts`.
- Export only the public API from `index.ts` (usually the service + types). Do not export internals.
- Cross-module communication: call the other module's **service** (via DI) or **subscribe to events**.
  Never read another module's tables directly.
- `@Global()` only for app-wide infrastructure (auth, database, cache, logger). Not for features.
- Avoid circular deps. If you need them, `forwardRef()` — but first check if you really need both imports.

## Why it matters

Modules are the unit of isolation. Good module boundaries make features independent: you can
test, replace, or delete one without destabilizing others. Bad boundaries (shared mutable state,
cross-module DB access) create implicit contracts that break every refactor.

## Canonical module layout

```
modules/payment/
├── payment.module.ts           # @Module() declaration
├── payment.controller.ts       # HTTP layer (thin)
├── payment.service.ts          # business logic
├── payment.repository.ts       # DB access (optional — can live in service for small modules)
├── dto/
│   ├── create-payment.dto.ts
│   ├── update-payment.dto.ts
│   └── list-payments.query.dto.ts
├── entities/                   # ORM entities or DB row types
│   └── payment.entity.ts
├── types/                      # module-internal types
│   └── payment-status.type.ts
├── events/                     # module-internal events (cross-module → src/events/)
│   └── payment-captured.event.ts
├── utils/                      # module-specific helpers
│   └── calculate-fee.util.ts
├── payment.service.spec.ts     # unit tests beside impl
└── index.ts                    # barrel — public API only
```

## The `@Module()` declaration

```ts
// payment.module.ts
import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import { PaymentRepository } from './payment.repository.js';
import { StripeModule } from '../../integrations/stripe/stripe.module.js';

@Module({
  imports: [StripeModule],          // other modules this one depends on
  controllers: [PaymentController], // HTTP entry points
  providers: [PaymentService, PaymentRepository],
  exports: [PaymentService],        // what other modules can use
})
export class PaymentModule {}
```

**Rules:**
- `imports` — the minimum. Don't import modules "just in case".
- `controllers` — zero or one per module. If you need two, consider splitting.
- `providers` — everything the module needs internally.
- `exports` — **only** the services/types other modules will call. Keep this list small.

## The barrel (`index.ts`)

```ts
// modules/payment/index.ts
export { PaymentModule } from './payment.module.js';
export { PaymentService } from './payment.service.js';
export type { Payment } from './entities/payment.entity.js';
export type { PaymentStatus } from './types/payment-status.type.js';
// Do NOT export PaymentRepository, DTOs, internal utils, or the controller.
```

Consumers then import cleanly:
```ts
import { PaymentService, type Payment } from '../payment/index.js';
```

## When to create a new module

Answer these questions:

1. **Does it own DB tables?** — Yes → new module.
2. **Does it have its own domain rules / lifecycle?** — Yes → new module.
3. **Is it used by multiple features but owns no data?** — No → it's a `common/` utility.
4. **Is it a helper for one specific module?** — No → put it inside that module (`utils/`).

Examples:

| Thing | Where |
|---|---|
| User profile management | `modules/user/` (new module, owns `users` table) |
| Payment processing | `modules/payment/` (new module, owns `payments`, `refunds`) |
| Email sending (generic) | `core/mail/` (app-wide infra) |
| Stripe client | `integrations/stripe/` (external wrapper) |
| `calculateTax()` utility used only by payment | `modules/payment/utils/` |
| `toSnakeCase()` utility used everywhere | `common/utils/` |
| "Comments" feature for posts | `modules/comment/` (owns `comments`, references `posts.id`) |

## Cross-module communication

### Rule: Never read another module's tables directly.

Each module owns its tables. Other modules must go through the owner's service.

### Good — service-to-service via DI

```ts
// modules/order/order.service.ts
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { UserService } from '../user/index.js';
import { PaymentService } from '../payment/index.js';

@Injectable()
export class OrderService {
  constructor(
    private readonly users: UserService,
    private readonly payments: PaymentService,
  ) {}

  async create(userId: string, amount: number) {
    const user = await this.users.findById(userId);
    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'USER.INACTIVE',
        message: 'User is inactive.',
      });
    }
    const payment = await this.payments.charge(user, amount);
    // ... create order row
  }
}
```

### Good — events for loose coupling

```ts
// modules/payment/payment.service.ts (publisher)
await this.events.emit(new PaymentCapturedEvent({ paymentId, userId, amount }));

// modules/loyalty/listeners/award-points.listener.ts (subscriber)
@OnEvent('payment.captured')
async handle(event: PaymentCapturedEvent) {
  await this.loyalty.award(event.userId, event.amount * 0.01);
}
```

See `18-events.md` for full event patterns.

### Bad — reading another module's table

```ts
// modules/order/order.service.ts
// ❌ Reaches into payments module's table directly
const payment = await this.db.query(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
```

This couples `order` to `payment`'s schema. When `payment` renames a column, `order` breaks
silently. Always call through the owning service.

## Circular dependencies

If module A needs B and B needs A, you have a design smell. First ask:

1. **Can the shared concept move to a third module?** Often yes. Extract the shared piece.
2. **Can one side use events instead?** Yes → `payment` emits, `order` subscribes — no import.
3. **Is one a subset of the other?** Merge them.

Only when none of those work, use `forwardRef()`:

```ts
@Module({
  imports: [forwardRef(() => PaymentModule)],
  providers: [OrderService],
})
export class OrderModule {}

// in OrderService constructor:
constructor(@Inject(forwardRef(() => PaymentService)) private readonly payments: PaymentService) {}
```

`forwardRef()` works, but it signals that you haven't found the right boundary yet. Revisit.

## `@Global()` — sparingly

```ts
@Global()
@Module({ ... })
export class AuthModule {}
```

`@Global()` means: "other modules can inject my exports without importing me."

**Use for:** auth, database, cache, logger, config, mail — things every feature needs.

**Don't use for:** feature modules. If `OrderModule` imports `PaymentModule`, make it explicit —
it documents the dependency.

## Dynamic modules

For configurable infrastructure, use the dynamic module pattern:

```ts
// core/cache/cache.module.ts
@Module({})
export class CacheModule {
  static forRoot(options: CacheOptions): DynamicModule {
    return {
      module: CacheModule,
      providers: [
        { provide: CACHE_OPTIONS, useValue: options },
        CacheService,
      ],
      exports: [CacheService],
      global: true,
    };
  }
}

// app.module.ts
@Module({
  imports: [
    CacheModule.forRoot({ ttl: 60, max: 1000 }),
  ],
})
export class AppModule {}
```

Use `forRoot` for app-wide config, `forFeature` for per-module config (e.g. TypeORM entity
registration).

## DI tokens

For non-class providers (pools, clients, config objects), use **Symbol** tokens:

```ts
// database.module.ts
export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (cfg: ConfigService) => new Pool({ connectionString: cfg.get('DATABASE_URL') }),
      inject: [ConfigService],
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}

// consumer
@Injectable()
export class UserRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}
}
```

String tokens work but collide silently. Symbols are unique and greppable.

## Good vs bad

### Good — clean boundary

```ts
// orders module depends on payment via service
import { PaymentService } from '../payment/index.js';

@Injectable()
export class OrderService {
  constructor(private readonly payments: PaymentService) {}
  async create(data: CreateOrderDto) {
    const payment = await this.payments.charge(data.amount);
    // ...
  }
}
```

### Bad — reaching across boundaries

```ts
// orders module reaches into payment's repository
import { PaymentRepository } from '../payment/payment.repository.js'; // ❌ not exported
import { paymentsTable } from '../payment/entities/payment.entity.js'; // ❌ internal type

@Injectable()
export class OrderService {
  constructor(private readonly paymentRepo: PaymentRepository) {}
  async create(data: CreateOrderDto) {
    await this.paymentRepo.insert({ ... }); // ❌ writing to another module's table
  }
}
```

## Anti-patterns

- **"Shared" module holding everybody's services.** That's not a boundary; it's a junk drawer.
- **Circular imports resolved with `forwardRef()` everywhere.** Fix the design; `forwardRef` is a last resort.
- **`@Global()` on feature modules.** Features should be explicit dependencies. Global is for infra.
- **Controller in a module with no HTTP responsibility.** If it's a worker module (only consumes events), no controller.
- **Barrel exports everything.** Makes refactoring painful; internal types leak into consumers.
- **Cross-module raw SQL.** Every module owns its tables. Cross-boundary = service call or event.
- **Service used only by one controller extracted for "reusability".** YAGNI. Extract when the second caller appears.

## Code review checklist

- [ ] Module has a clear bounded context; does it own its tables?
- [ ] `imports` is minimal; no unused imports
- [ ] `exports` is minimal; internal types not exposed
- [ ] `index.ts` exports only the public API (module + service + types)
- [ ] No cross-module DB reads; all cross-module calls go via service or event
- [ ] No `@Global()` on a feature module
- [ ] No unresolved `forwardRef()`; if present, design smell documented
- [ ] DI tokens are Symbols for non-class providers

## See also

- [`01-folder-structure.md`](./01-folder-structure.md) — where modules sit in the app
- [`04-code-quality.md`](./04-code-quality.md) — what goes into a service vs controller
- [`18-events.md`](./18-events.md) — event-based cross-module communication
