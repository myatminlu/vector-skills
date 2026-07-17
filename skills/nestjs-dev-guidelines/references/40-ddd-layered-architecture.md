# 40 — DDD Layered Architecture

## TL;DR

- The six-bucket layout in `01-folder-structure.md` stays the **default**. Adopt DDD layering
  only when the domain is complex enough to pay for it, or the repo already uses it.
- Three tiers, smallest that fits wins:
  1. **Simple** — classic `application/ domain/ infrastructure/ interfaces/` directly under `src/`.
  2. **Modular** — a `shared/` module plus feature modules, each containing the same four layers.
  3. **Hexagonal (ports & adapters)** — split driving (inbound) from driven (outbound) adapters;
     application layer exposes use cases and owns port interfaces.
- **The dependency rule is the whole point:** source dependencies point inward only.
  `domain` imports nothing framework-y; `application` imports `domain`; `infrastructure` and
  `interfaces` import `application`/`domain` — never the reverse.
- The domain layer is framework-free: no Nest decorators, no ORM entities as domain models,
  no HTTP types.
- Every non-negotiable still applies (DTO validation, stable response contract, module owns its
  tables, tenant isolation). DDD changes *where code lives*, not *what must be true*.

## Why it matters

A layered/hexagonal structure keeps business rules independent of frameworks, databases, and
transports — you can test the domain without booting Nest, and swap an adapter (ORM, provider
SDK, transport) without touching use cases. But layers have a real cost: more files, more
mapping, more indirection. Applied to a CRUD app, DDD folders are cargo cult. Applied to a rich
domain (billing, scheduling, pricing, workflow), they are the cheapest insurance you can buy.

## Choosing a tier

```
Does the repo already use DDD folders?
  → Follow the existing tier. Do not restructure mid-task.

Is the domain mostly CRUD (forms over data, thin rules)?
  → No DDD. Use the default six-bucket layout (01).

Rich domain rules, but one team / one deployable, few bounded contexts?
  → Tier 1: simple layers at src root.

Multiple bounded contexts / feature areas that evolve independently?
  → Tier 2: shared module + feature modules, each layered.

Multiple transports (HTTP + queue + CLI) or swappable infra (multi-provider,
multi-DB), or the domain must be testable with zero infrastructure?
  → Tier 3: hexagonal — ports, adapters, use cases.
```

Escalate a tier only when the pain is real. De-escalating (deleting layers) is much harder
than escalating, so start at the lowest tier that fits.

## Tier 1 — simple: classic layers at the root

For a single bounded context with real domain rules.

```
src/
├── main.ts
├── app.module.ts
│
├── domain/                        # pure business logic — NO Nest, NO ORM imports
│   ├── model/
│   │   ├── order.ts               # entity/aggregate with behavior
│   │   └── money.ts               # value object
│   ├── event/
│   │   └── order-placed.event.ts
│   ├── repository/
│   │   └── order.repository.ts    # interface (port) — implemented in infrastructure
│   └── error/
│       └── order-errors.ts        # domain errors (no HTTP status here)
│
├── application/                   # orchestration — use cases / application services
│   ├── place-order.use-case.ts
│   ├── cancel-order.use-case.ts
│   └── dto/                       # commands/results the use cases speak
│
├── infrastructure/                # driven side — DB, external services, messaging
│   ├── persistence/
│   │   ├── order.orm-entity.ts    # ORM entity ≠ domain model
│   │   ├── order.mapper.ts        # ORM entity ⇄ domain model
│   │   └── typeorm-order.repository.ts   # implements domain OrderRepository
│   └── payment/
│       └── stripe-payment.adapter.ts
│
└── interfaces/                    # driving side — HTTP, CLI, consumers
    └── http/
        ├── order.controller.ts    # thin: DTO in, use case call, response shape out
        └── dto/
            └── create-order.dto.ts   # class-validator DTOs live HERE, not in domain
```

**Nest wiring** — layers are folders, modules are still the composition unit:

```ts
// app.module.ts (or an order.module.ts if you prefer one module per context)
@Module({
  controllers: [OrderController],
  providers: [
    PlaceOrderUseCase,
    CancelOrderUseCase,
    { provide: ORDER_REPOSITORY, useClass: TypeormOrderRepository },
    { provide: PAYMENT_PORT, useClass: StripePaymentAdapter },
  ],
})
export class AppModule {}
```

```ts
// domain/repository/order.repository.ts — a port, defined by the domain
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
```

```ts
// application/place-order.use-case.ts — depends on the port, not the adapter
@Injectable()
export class PlaceOrderUseCase {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository) {}

  async execute(command: PlaceOrderCommand): Promise<OrderResult> {
    const order = Order.place(command);          // domain behavior, not a setter parade
    await this.orders.save(order);
    return OrderResult.from(order);
  }
}
```

Interfaces (ports) are TypeScript types and vanish at runtime, so bind them with a
`Symbol`/string token via `{ provide, useClass }` — see
[`38-decorators-scopes-dynamic-modules.md`](./38-decorators-scopes-dynamic-modules.md).

## Tier 2 — modular: shared + feature modules, each layered

When several bounded contexts each deserve their own layers. Feature module folders replace
the flat `modules/<feature>/` internal layout from `03-module-design.md`; everything else in
that reference (barrel exports, cross-module rules, `@Module()` hygiene) still applies.

```
src/
├── main.ts
├── app.module.ts
│
├── shared/                        # cross-context building blocks, same layer split
│   ├── domain/                    # base classes: AggregateRoot, DomainEvent, ValueObject
│   ├── application/               # shared use-case plumbing (e.g., UnitOfWork port)
│   ├── infrastructure/            # db connection, outbox, message bus adapters
│   └── interfaces/                # global filters, generic pipes, response mappers
│
└── modules/
    ├── ordering/
    │   ├── ordering.module.ts
    │   ├── domain/
    │   ├── application/
    │   ├── infrastructure/
    │   └── interfaces/
    ├── billing/
    │   ├── billing.module.ts
    │   ├── domain/
    │   ├── application/
    │   ├── infrastructure/
    │   └── interfaces/
    └── catalog/
        └── ... same shape
```

**Rules:**
- `shared/` holds *technical* building blocks and truly cross-context value objects (Money,
  Email). If it knows about orders or invoices, it is not shared.
- Cross-context communication is unchanged: call the other module's exported application
  service, or subscribe to its events (`18-events.md`). Never import another context's
  `domain/` or `infrastructure/` internals, and never read its tables.
- Each context still owns its DB tables (non-negotiable #4).

## Tier 3 — hexagonal: ports & adapters, driving/driven split

The full form: name the sides explicitly. Inside each context (or at the root for tier 1):

```
modules/ordering/
├── ordering.module.ts             # composition root: binds ports → adapters
├── domain/                        # entities, value objects, domain events, domain services
├── application/
│   ├── port/
│   │   ├── inbound/               # what the app offers (use-case interfaces)
│   │   │   └── place-order.port.ts
│   │   └── outbound/              # what the app needs (repos, gateways, clocks)
│   │       ├── order.repository.ts
│   │       └── payment.gateway.ts
│   └── use-case/
│       └── place-order.use-case.ts        # implements inbound port, calls outbound ports
└── adapter/
    ├── driving/                   # inbound — calls INTO the application
    │   ├── http/                  #   controllers + class-validator DTOs
    │   ├── queue/                 #   BullMQ processors (19)
    │   └── cli/                   #   commands
    └── driven/                    # outbound — called BY the application
        ├── persistence/           #   ORM entities, mappers, repository impls
        └── payment/               #   provider SDK adapters (Stripe, …)
```

- **Driving adapters** (HTTP controller, queue processor, CLI command) depend on inbound
  ports. A controller must not know which use-case class implements the port.
- **Driven adapters** implement outbound ports. The application never imports an adapter.
- The Nest module is the **composition root** — the only place that sees both sides and
  binds tokens to implementations.
- What was `integrations/<provider>/` in the default layout becomes a driven adapter here;
  the thin-wrapper rule from `01-folder-structure.md` is unchanged.

## What does NOT change under DDD

| Concern | Still governed by |
|---|---|
| DTO validation at every boundary | `09-validation.md` — DTOs live in driving adapters/interfaces |
| Response contract `{ data, meta }` / `{ code, message, details?, traceId }` | `07`, `10`, `39` — shaping happens in the interfaces layer; domain errors are mapped, never thrown raw to the wire |
| One context owns its tables | `03`, `13` |
| Tenant isolation layered through guard/service/repository | `33` — the repository *implementation* filters by tenant; the port signature carries tenant context |
| Testing at boundaries | `23` — plus: domain and use cases get pure unit tests with in-memory port fakes |

## Good vs bad

### Good — domain free of framework

```ts
// domain/model/order.ts — no imports from @nestjs/*, typeorm, prisma
export class Order {
  private constructor(readonly id: OrderId, private status: OrderStatus, private lines: OrderLine[]) {}

  static place(cmd: { customerId: string; lines: OrderLine[] }): Order { /* invariants here */ }

  cancel(now: Date): void {
    if (this.status === 'shipped') throw new OrderAlreadyShippedError(this.id);
    this.status = 'cancelled';
  }
}
```

### Bad — ORM entity doubling as domain model

```ts
// domain/model/order.ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';   // ✗ infrastructure in domain

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() status: string;        // ✗ anemic: no behavior, invariants live in services
}
```

### Bad — use case importing an adapter

```ts
// application/place-order.use-case.ts
import { TypeormOrderRepository } from '../infrastructure/persistence/typeorm-order.repository';
// ✗ inward layer importing outward layer — depend on the port interface instead
```

## Anti-patterns

- **Cargo-cult layers.** `application/domain/infrastructure` folders wrapping a CRUD app where
  every "use case" is one repository call. If the domain has no rules, use the default layout.
- **Anemic domain + DDD folders.** All behavior in "domain services" acting on getter/setter
  bags. Put invariants and state transitions on the aggregate itself.
- **One shared `entities/` used as both ORM and domain model.** Pick one: either accept the
  coupling consciously (tier 0 — the default layout) or map explicitly. Half-DDD gives you the
  mapping cost *and* the coupling.
- **Ports for everything.** An outbound port per third-party SDK method call. Define ports at
  the level the *application* thinks (`PaymentGateway.charge`), not the vendor's API shape.
- **Skipping the composition root.** Adapters self-registering or use cases instantiating
  adapters with `new`. All binding happens in the module's `providers` array.
- **`shared/domain` becoming a dumping ground.** If a "shared" concept references a specific
  context's language, move it into that context.
- **Cross-context deep imports.** `import ... from '../billing/domain/invoice'` — contexts
  talk via exported application services or events only.

## Code review checklist

- [ ] Does `domain/` import zero framework/ORM/HTTP packages?
- [ ] Do dependencies point inward only (interfaces/adapters → application → domain)?
- [ ] Are ports defined by the inner layer (domain/application), implemented by the outer?
- [ ] Are port tokens bound in the module (composition root), not hardwired with `new`?
- [ ] Is there an explicit mapper between ORM entities and domain models (tiers 1–3)?
- [ ] Do class-validator DTOs live in the driving adapter / interfaces layer, not in domain?
- [ ] Are domain errors mapped to the standard error contract at the boundary (`10`, `39`)?
- [ ] Is the tier justified — would the default six-bucket layout (01) have been enough?
- [ ] Do cross-context calls go through exported services or events, never internals?

## See also

- [`01-folder-structure.md`](./01-folder-structure.md) — the default layout; when no DDD is the right call
- [`03-module-design.md`](./03-module-design.md) — module boundaries, barrels, cross-module rules
- [`04-code-quality.md`](./04-code-quality.md) — layering rules that apply in any structure
- [`38-decorators-scopes-dynamic-modules.md`](./38-decorators-scopes-dynamic-modules.md) — token-based providers for binding ports
- [`18-events.md`](./18-events.md) — domain events across contexts
- [`23-testing.md`](./23-testing.md) — pure domain tests, port fakes, boundary e2e
