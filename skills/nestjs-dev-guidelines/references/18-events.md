# 18 — Events (Domain Events & Messaging)

## TL;DR

- In-process: **NestJS EventEmitter2** (`@nestjs/event-emitter`). Synchronous, fast, no infra.
- Cross-service or durable: **outbox pattern** + message bus (Kafka, NATS, RabbitMQ, Redis Streams).
- Event naming: `<subject>.<verb-past-tense>` — `user.created`, `payment.captured`, `order.cancelled`.
- Payload = snapshot of relevant state. Events are immutable facts.
- Idempotent handlers: receiving the same event twice must not produce double side effects.
- Document each event in one place (schema, payload, emitters, consumers).

## Why it matters

Events decouple modules. Module A publishes "user.created"; modules B, C, D listen without A
knowing about them. Add a new consumer without touching A. Good for growth; bad if the
naming/payload/routing is ad hoc.

## When to use events

**Yes:**
- Cross-module side effects ("on user created, send welcome email + initialize billing").
- Audit trail ("every permission change is an event").
- Async work triggered by a state change ("on payment captured, start fulfillment job").
- Decoupled fan-out ("on order placed, notify 5 consumers").

**No:**
- Sequential operations that must complete or roll back together. Use a transaction + direct call.
- Request-response needs. Events are fire-and-forget.
- Ordering across many publishers (hard; message bus required).

## In-process: EventEmitter2

### Setup

```ts
// app.module.ts
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [EventEmitterModule.forRoot({
    wildcard: true,                    // enable only if you need 'user.*' listeners; small overhead
    delimiter: '.',                    // 'user.created' style
    verboseMemoryLeak: !isProduction,  // dev/staging only — noisy in prod
  })],
})
export class AppModule {}
```

### Emit

```ts
// modules/user/user.service.ts
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserCreatedEvent } from '../../events/user-created/user-created.event.js';

@Injectable()
export class UserService {
  constructor(private readonly events: EventEmitter2) {}

  async create(dto: CreateUserDto): Promise<User> {
    const user = await this.repo.insert(dto);
    this.events.emit('user.created', new UserCreatedEvent(user));
    return user;
  }
}
```

Event class:

```ts
// events/user-created/user-created.event.ts
export class UserCreatedEvent {
  constructor(public readonly user: { id: string; email: string; name: string }) {}
}
```

### Listen

```ts
// events/user-created/send-welcome-email.listener.ts
@Injectable()
export class SendWelcomeEmailListener {
  constructor(private readonly mail: MailService) {}

  @OnEvent('user.created', { async: true })
  async handle(event: UserCreatedEvent) {
    await this.mail.sendTemplate(event.user.email, 'welcome', { name: event.user.name });
  }
}
```

### Semantics

- **Synchronous by default** — `emit()` runs listeners in the same tick.
- **`async: true`** makes the listener run via promise; `emit()` still returns before listener completes.
- Listener errors don't propagate back to the publisher. Log them.
- No ordering guarantees across listeners.
- No persistence — if the process crashes, in-flight events are lost.
- In-process events are intentionally simpler than cross-service: no envelope, no `id`/`traceId`/`version`. If you need any of those, promote the event through the outbox so it gets the full envelope downstream.

### For reliability: outbox pattern

If losing events on crash is unacceptable (payments, audit), don't use EventEmitter2 alone.

## Outbox pattern (reliable)

### The problem

You update the DB and emit an event. One succeeds, one fails. Which?

### The fix

1. In the same DB transaction, write the change **and** an outbox row.
2. A background poller reads outbox rows and publishes to the message bus / emitter.
3. Mark outbox row as published.
4. On failure, retry (exponential backoff).

### Schema

```sql
CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  aggregate_type text NOT NULL,    -- 'user', 'payment', 'order'
  aggregate_id text NOT NULL,
  event_type text NOT NULL,        -- 'user.created'
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text
);
CREATE INDEX idx_outbox_unpublished ON outbox (created_at) WHERE published_at IS NULL;
```

> `uuidv7()` requires Postgres 18+, the `pg_uuidv7` extension on older versions, or app-side generation. See [`13-database-design.md`](./13-database-design.md) for the project-wide convention.

### Write in the same transaction

The domain write and the outbox insert must share **one** connection so they commit or roll back together. Use a checked-out client (or your ORM's transaction API — see [`14-database-orm-patterns.md`](./14-database-orm-patterns.md)).

```ts
// Plain pg — share a single client across the whole transaction
const client = await this.pool.connect();
try {
  await client.query('BEGIN');
  const { rows: [user] } = await client.query(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *`,
    [dto.email, dto.name],
  );
  await client.query(
    `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload) VALUES ($1, $2, $3, $4)`,
    ['user', user.id, 'user.created', { id: user.id, email: user.email }],
  );
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

ORM equivalents:

```ts
// TypeORM
await this.dataSource.transaction(async (manager) => {
  const user = await manager.save(User, dto);
  await manager.insert(Outbox, {
    aggregateType: 'user', aggregateId: user.id,
    eventType: 'user.created', payload: { id: user.id, email: user.email },
  });
});

// Prisma
await this.prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: dto });
  await tx.outbox.create({ data: {
    aggregateType: 'user', aggregateId: user.id,
    eventType: 'user.created', payload: { id: user.id, email: user.email },
  }});
});
```

Calling `pool.query()` directly for each statement is **wrong** — each call may pick a different pooled connection, so `BEGIN`/`COMMIT` and the writes won't share a transaction.

### Poller (background job)

- Every N seconds, `SELECT * FROM outbox WHERE published_at IS NULL ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED`.
- Publish to bus / emitter.
- `UPDATE outbox SET published_at = now() WHERE id IN (...)`.
- On error, bump `attempts` and log. Back off.

## Cross-service buses

### Choices

| Bus | When |
|---|---|
| **Redis Streams** | Lightweight, ordered, Redis already in stack. Limited throughput. |
| **NATS JetStream** | Fast, flexible subjects, per-subject streams. |
| **RabbitMQ** | Mature, routing patterns, per-queue acks. |
| **Kafka** | Very high throughput, log retention, replay. Biggest ops overhead. |
| **AWS SNS → SQS** | Managed; fan-out + retries. |

Pick based on volume + existing infra. Resist adding Kafka unless you measure a real need.

### Serialization

- JSON with an envelope:

```json
{
  "id": "evt_01HXXX...",          // unique event id (for dedupe)
  "type": "payment.captured",
  "version": 1,                    // schema version
  "occurredAt": "2026-04-22T10:15:30Z",
  "aggregateId": "pay_abc",
  "actor": { "type": "user", "id": "usr_123" },
  "data": { ... },                 // domain payload
  "traceId": "req_..."             // for correlation
}
```

- Include `version` so consumers can handle schema changes.

## Idempotent handlers

Every event handler must be idempotent (running twice = same outcome).

```ts
async handle(event: PaymentCapturedEvent) {
  // Side effect + dedupe marker must commit together, otherwise a crash between
  // them will replay the side effect on retry.
  await this.dataSource.transaction(async (tx) => {
    if (await this.inbox.hasProcessed(tx, event.id)) return;
    await this.loyalty.award(tx, event.aggregateId, event.data.amount);
    await this.inbox.markProcessed(tx, event.id);
  });
}
```

Two acceptable shapes:

1. **Inbox table + transactional side effect** — wrap the dedupe check, side effect, and marker insert in one DB transaction (shown above).
2. **Naturally idempotent action** — e.g. `INSERT ... ON CONFLICT DO NOTHING`, an `UPSERT` keyed by `event.id`, or setting an absolute state instead of incrementing. No inbox needed.

Avoid: `if-not-processed → side effect → mark processed` as three separate, non-transactional steps. A crash between step 2 and step 3 means the next retry repeats the side effect.

Use a dedicated `event_inbox(event_id PRIMARY KEY)` table when the side effect can't be made naturally idempotent.

## Ordering

- Within a single aggregate (one user, one payment), preserve order — at-rest timestamps +
  bus partitioning by `aggregateId` in Kafka/NATS.
- Across aggregates, order doesn't matter.

## Versioning schemas

- Add fields freely (optional).
- Remove fields only after all consumers updated.
- Rename: support both names; deprecate.
- Bump `version` on breaking changes; dispatch old + new to consumers during transition.

Keep a shared `events/` schema registry so consumers don't drift.

## Events module layout

```
src/events/
├── user-created/
│   ├── user-created.event.ts            # event class + payload type
│   ├── send-welcome-email.listener.ts
│   └── init-billing.listener.ts
├── payment-captured/
│   ├── payment-captured.event.ts
│   └── award-loyalty.listener.ts
└── events.module.ts                     # optional: wire listeners
```

Each event folder is self-contained. The publishing module imports the event class only.

## Documentation

In the event folder, keep a `README.md`:

```
# user.created

Emitted when a new user account is created.

## Payload
| field | type   | notes     |
| ----- | ------ | --------- |
| id    | string | UUIDv7    |
| email | string | lowercased |
| name  | string |           |

## Published by
- `UserService.create`

## Consumed by
- `SendWelcomeEmailListener`
- `InitBillingListener`

## Version history
- v1 (2026-04-22): initial
```

One page per event; easy to answer "who cares about this?"

## Good vs bad

### Good

```ts
await this.repo.insert(user);
this.events.emit('user.created', new UserCreatedEvent(user));
```

### Bad

```ts
await this.repo.insert(user);
await this.mail.sendWelcome(user.email);              // ❌ direct cross-module call
await this.billing.createCustomer(user.id);           // ❌ still direct; transaction split
await this.analytics.track('user created', user.id);  // ❌ coupled to every consumer
```

Three problems: module A now knows about B, C, D; any new consumer means touching A; any
of these failing leaves user-created-but-no-welcome state.

## Anti-patterns

- Using events where a direct call + transaction is correct (sequential dependencies).
- Publishing without a schema — consumers break on minor changes.
- No dedupe in handlers — events delivered twice trigger double emails.
- Long-running listener blocking the publisher (synchronous EventEmitter2, slow handler).
- Event names without past-tense verbs (`user.create` vs `user.created`) — implies imperative.
- Events containing references (`userId`) when the consumer needs the whole state — refetch or embed.
- No `traceId` in events — hard to debug across services.

## Code review checklist

- [ ] Event naming: `subject.verb-past-tense`
- [ ] Event class / schema is versioned
- [ ] Payload is a snapshot, not a reference requiring lookup (unless intentional)
- [ ] Handlers are idempotent: dedupe-marker write commits in the same transaction as the side effect, or the action is naturally idempotent (`ON CONFLICT DO NOTHING`, absolute-state upsert)
- [ ] For durability needs: outbox pattern, not fire-and-forget
- [ ] `traceId` propagated from publisher → event → listener
- [ ] New event documented in `events/<name>/README.md`
- [ ] No cross-module direct calls where an event would decouple

## See also

- [`03-module-design.md`](./03-module-design.md) — events as cross-module communication
- [`19-background-jobs.md`](./19-background-jobs.md) — async work spawned from events
- [`13-database-design.md`](./13-database-design.md) — outbox + inbox tables
