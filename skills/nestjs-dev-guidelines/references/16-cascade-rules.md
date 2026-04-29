# 16 — Cascade Rules (ON DELETE / ON UPDATE)

## TL;DR

- **`ON DELETE CASCADE`** — for data that exists only because of the parent (owned data). Deleting the parent should delete this child. Examples: a user's `sessions`, an order's `order_items`, a conversation's `messages`.
- **`ON DELETE RESTRICT`** (or `NO ACTION`) — for data that references the parent but has its own independent existence. Don't allow parent to be deleted while references remain. Examples: a payment linked to an invoice; a user who owns organizations.
- **`ON DELETE SET NULL`** — optional references where losing the parent is fine but the child survives. Examples: `assigned_to_user_id` on a task. Column **must be nullable**.
- **`ON UPDATE`** — usually `NO ACTION`. PKs should be immutable (use UUIDv7/bigint surrogate keys, not natural keys).
- **DB-level cascade ≠ ORM-level cascade.** They are independent mechanisms. Configure DB-level for safety; treat ORM `cascade` options as orchestration sugar, not an enforcement layer.
- **PostgreSQL does NOT auto-index FK columns** (unlike MySQL/InnoDB). You must create the index explicitly, or every parent delete becomes a sequential scan on the child table.
- **Cascades bypass row-level security (RLS).** In multi-tenant schemas, never rely on RLS to scope a cascade — scope by `tenant_id` in the FK target or in application logic.

## Why it matters

Cascade semantics are invisible until a delete happens. A wrong choice either leaves orphan rows
cluttering the DB or deletes data you meant to keep. Decide up-front, document in the
migration, don't change later without a data audit. AI agents writing migrations: treat the
`ON DELETE` clause as **required, not optional** — every FK gets an explicit choice.

## Decision tree

```
Can this child row exist without the parent row?
├── No (life-cycle fully owned by parent)
│   → ON DELETE CASCADE
├── Yes, but the reference is optional
│   → ON DELETE SET NULL  (column must be nullable)
├── Yes, and the reference is required (but parent delete is rare and risky)
│   → ON DELETE RESTRICT  (force application to clean up first)
├── Yes, and you want to explicitly handle the delete in code
│   → ON DELETE NO ACTION  (behaves like RESTRICT but deferrable)
└── Historical/audit row that must survive parent deletion
    → ON DELETE SET NULL on a nullable FK,
      OR drop the FK entirely and store the id as plain text/uuid
      (no referential integrity, but the row is preserved forever)
```

## DB-level vs ORM-level cascade — understand the difference

This is the single most common source of cascade bugs in NestJS apps.

| Layer        | Where it runs | When it fires                          | Trustworthy as a safety net? |
|--------------|---------------|----------------------------------------|------------------------------|
| DB-level     | PostgreSQL    | Any `DELETE` against the parent row    | **Yes** — enforced by the DB |
| ORM-level    | App memory    | Only when you delete via that ORM call | No — bypassed by raw SQL, other services, manual cleanup |

- **TypeORM** — `@OneToMany(..., { cascade: ['remove'] })` and `onDelete: 'CASCADE'` are **two different things**. The first is ORM-level (in-memory). The second writes the actual SQL constraint. You almost always want the second; the first is optional sugar.
- **Prisma** — `onDelete: Cascade` in the schema generates the SQL constraint. There is no separate ORM-only cascade.
- **Drizzle** — `onDelete: 'cascade'` in the relation generates the SQL constraint, same as Prisma.
- **Sequelize** — `onDelete: 'CASCADE'` on the association writes the constraint; `hooks: true` triggers app-level lifecycle hooks.

**Rule for agents:** when generating schema/migration code, always set the DB-level constraint
(`ON DELETE ...` in SQL or its ORM equivalent that emits SQL). Use ORM-level cascade only when
you specifically need lifecycle hooks/events to fire — and document why.

## Examples by relationship

### Parent-owned data → CASCADE

- `users` → `sessions` — sessions die with the user.
- `orders` → `order_items` — items have no meaning without the order.
- `conversations` → `messages` — messages are bound to the conversation.
- `organizations` → `memberships` — when org deleted, memberships too.
- `users` → `api_keys` — keys belong to the user.

```sql
CREATE TABLE sessions (
  ...
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ...
);
CREATE INDEX idx_sessions_user ON sessions (user_id);  -- required, see "Index every FK" below
```

### Referenced but independent → RESTRICT

- `payments` → `invoices` — don't let an invoice be deleted while payments reference it.
- `users` → `orders` — a user with orders can't be deleted directly; force a decision (anonymize? hard-delete + audit?).
- `categories` → `products` — don't drop a category still used by products.

```sql
CREATE TABLE payments (
  ...
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  ...
);
CREATE INDEX idx_payments_invoice ON payments (invoice_id);
```

Application-side: when deleting an invoice, first check / clean up payments or refuse the action
with a meaningful error — `{ code: 'INVOICE.HAS_PAYMENTS' }` (see [`10-error-handling.md`](./10-error-handling.md)).

### Optional link → SET NULL

- `tasks.assigned_to_user_id` — unassign on user deletion.
- `posts.last_edited_by_user_id` — keep the post; clear the editor.
- `files.uploaded_by_user_id` — keep the file; forget who uploaded.

```sql
CREATE TABLE tasks (
  ...
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,  -- nullable
  ...
);
CREATE INDEX idx_tasks_assigned_to_user ON tasks (assigned_to_user_id);
```

The column **must be nullable** for `SET NULL` to work; otherwise the migration fails at runtime
on the first qualifying delete.

### Historical / immutable records — two valid patterns

Audit logs, payment events, and webhook events usually need to survive deletion of the
"parent" (e.g., a deleted user) because they are an immutable record of what happened. Pick
one of these patterns and document it in the migration:

**Pattern A — keep FK, use `SET NULL`.** Preserves referential integrity while the parent
exists; orphans become `NULL` after deletion.

```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_actor ON audit_log (actor_user_id);
```

**Pattern B — no FK, store the id as plain text/uuid.** No referential integrity, but the
historical row is fully decoupled from the parent's lifecycle. Useful when the parent table
may be hard-deleted as part of a GDPR purge while the audit record must remain.

```sql
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  actor_user_id uuid,                     -- NO foreign key
  actor_email_snapshot text,              -- denormalized snapshot for readability
  action text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
```

Trade-off: Pattern A gives you JOINs but ties you to the parent's deletion behavior; Pattern B
gives you durability across hard-deletes but you must maintain denormalized snapshots for any
fields you need to read later.

## Index every FK column (Postgres-specific)

```sql
CREATE INDEX idx_<table>_<column> ON <table> (<column>);
```

PostgreSQL does **not** create an index on the referencing column automatically. Without one:

- Every parent `DELETE` triggers a sequential scan on the child table to find rows to cascade
  or check for restriction.
- For a child table with millions of rows, a single parent delete can lock the table for
  seconds or minutes.

This is mandatory for every FK, not optional. See [`13-database-design.md`](./13-database-design.md) for the
naming convention.

## Multi-tenancy and RLS — cascades bypass row policies

In a multi-tenant schema using PostgreSQL Row-Level Security:

- RLS policies apply to `SELECT/INSERT/UPDATE/DELETE` issued by the app session.
- `ON DELETE CASCADE` runs as a **system-level cascade** and bypasses RLS — it deletes every
  matching child row regardless of tenant policy.
- This is usually what you want (the cascade respects FK structure, which already encodes
  tenant scope), but it becomes a footgun when:
  - A parent table sits "above" the tenant (e.g., a global `users` table), and
  - Cascading from that parent reaches into multiple tenants' child tables at once.

**Safe pattern:** ensure that a CASCADE FK chain stays within a single tenant. Either:

1. Anchor the FK on a tenant-scoped parent (`organization_id` is part of the FK target), or
2. Use `RESTRICT` on cross-tenant edges and force the application to delete tenant by tenant
   inside an authorized loop.

See [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md) for tenant-scoping rules.

## Interaction with soft delete

If you soft-delete users (`users.deleted_at`), FK constraints don't fire — so cascade/restrict
rules only apply to **hard** deletes. Two patterns:

1. **Soft-delete only.** Rows stay forever (filtered by `deleted_at IS NULL`). FKs never fire.
   The app handles the semantic cleanup (e.g., setting `tasks.assigned_to_user_id = NULL`
   when a user is soft-deleted).
2. **Soft-delete then purge.** Background job eventually hard-deletes. FK cascades fire then.
   Application code doesn't have to handle cleanup twice.

Pick one pattern per table and document it in the migration that introduces the FK. Don't mix —
mixing produces tables where the cascade silently does nothing for months and then suddenly
deletes a million rows when the purge job runs.

## Application-level cleanup in services

Even with CASCADE at DB level, sometimes you want service-level orchestration for visibility
(events, side effects). **Wrap multi-step deletes in a transaction** so that a failure halfway
through doesn't leave orphaned external state:

```ts
async deleteUser(userId: string) {
  await this.dataSource.transaction(async (tx) => {
    await this.apiKeys.revokeAll(userId, tx);           // emits revoked events
    await this.billing.cancelSubscriptions(userId, tx); // emits canceled events
    await this.users.hardDelete(userId, tx);            // DB cascade removes sessions, memberships
  });

  // Emit the public event AFTER commit, so subscribers don't see uncommitted state.
  await this.events.emit(new UserDeletedEvent({ userId }));
}
```

Two rules:

1. The DB cascade is the **safety net**. Service-level orchestration handles the meaningful
   cleanup, emits events, and calls third-party APIs.
2. Side effects that touch external systems (Stripe, Slack, S3) happen **after** the DB
   transaction commits. Otherwise a transaction rollback leaves real-world state diverged from
   DB state.

## ON UPDATE

Default to `NO ACTION`. Primary keys should be immutable; if you find yourself updating a PK,
the right fix is usually a new row, not a CASCADE on update.

Rare legitimate uses for `ON UPDATE CASCADE`:

- Migrating a natural key (`country_code` text) when the upstream registry changes a code.
- Renaming an enum-like text key while you transition off natural keys to surrogate keys.

In both cases, prefer adding a surrogate `id` and migrating off the natural key as a one-time
operation. `ON UPDATE CASCADE` on a hot foreign key in a large schema can lock multiple tables
during a single update.

## Composite FKs and multi-column cascades

Supported but unusual. Prefer surrogate keys (`id uuid`) over natural composite keys —
composite FKs make cascade behavior harder to reason about and force every child table to
carry every component column. Use only when modeling a true compound identity (e.g., a
`(tenant_id, external_ref)` natural key in a partitioned table).

## Deferrable constraints

Rare. Allows you to violate the FK inside a transaction as long as it's consistent at COMMIT:

```sql
ALTER TABLE a
  ADD CONSTRAINT fk_a_b
  FOREIGN KEY (b_id) REFERENCES b(id)
  DEFERRABLE INITIALLY DEFERRED;
```

Useful only for cyclic bootstraps (A references B references A) or batch migrations where you
need to insert/update both sides before the FK becomes consistent. Default to immediate
constraints — deferrable adds a real correctness footgun (a bug elsewhere in the transaction
can leave the FK violated until COMMIT, where it then aborts the whole transaction).

## Cascade depth and lock impact

- PostgreSQL does not enforce a recursion-depth limit on cascades — `A → B → C → D → ...` will
  run as long as the chain holds.
- Each cascade hop locks rows in the child table. A cascade chain across five tables can hold
  locks on five tables at once, blocking any concurrent transaction touching them.
- Avoid CASCADE on a child table with hundreds of millions of rows; a single parent delete can
  generate massive WAL, churn the buffer pool, and pause replication.
- For very large child tables, prefer `RESTRICT` and let the application delete in chunks.
  PostgreSQL has no `LIMIT` clause on `DELETE` (that is MySQL syntax) — use a subquery or
  a CTE:

  ```sql
  -- Loop this in the app with throttling, until 0 rows affected.
  DELETE FROM child
   WHERE id IN (
     SELECT id FROM child WHERE parent_id = $1 LIMIT 10000
   );
  ```

## Testing cascade behavior

Unit tests on service methods aren't enough — add an integration test that runs against a
real Postgres (Testcontainers, `pg-mem`, or a dedicated test database). For each cascade
mode, assert the actual constraint behavior:

```ts
// Jest + TypeORM example
describe('cascade rules', () => {
  it('CASCADE: deleting a user removes their sessions', async () => {
    const user = await repo.users.save({ email: 'a@x.test' });
    await repo.sessions.save({ userId: user.id, token: 't' });

    await repo.users.delete(user.id);

    const sessions = await repo.sessions.find({ where: { userId: user.id } });
    expect(sessions).toHaveLength(0);
  });

  it('RESTRICT: deleting an invoice with payments fails', async () => {
    const invoice = await repo.invoices.save({ amountMinor: 1000 });
    await repo.payments.save({ invoiceId: invoice.id, amountMinor: 1000 });

    await expect(repo.invoices.delete(invoice.id))
      .rejects.toThrow(/foreign key|violates|RESTRICT/i);
  });

  it('SET NULL: deleting a user nulls the assignee on tasks', async () => {
    const user = await repo.users.save({ email: 'b@x.test' });
    const task = await repo.tasks.save({ assignedToUserId: user.id, title: 'x' });

    await repo.users.delete(user.id);

    const reloaded = await repo.tasks.findOneByOrFail({ id: task.id });
    expect(reloaded.assignedToUserId).toBeNull();
  });
});
```

See [`23-testing.md`](./23-testing.md) for integration test setup with real Postgres.

## Example schema with mixed cascades

The examples below use `uuidv7()` — built into **PostgreSQL 18+** (added Sept 2025, RFC 9562).
On older Postgres versions, swap in an equivalent: the [`pg_uuidv7`](https://github.com/fboulnois/pg_uuidv7)
extension exposes `uuid_generate_v7()`, or a SQL function you maintain in-repo. Whichever you
pick, use it consistently across every migration in the project — see [`13-database-design.md`](./13-database-design.md).

```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  email citext NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL
);
CREATE INDEX idx_memberships_user ON memberships (user_id);
CREATE INDEX idx_memberships_org  ON memberships (organization_id);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,  -- keep project; forget creator
  name varchar(200) NOT NULL
);
CREATE INDEX idx_projects_org     ON projects (organization_id);
CREATE INDEX idx_projects_creator ON projects (created_by_user_id);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  -- RESTRICT: don't let an org be deleted while invoices exist;
  -- force the app to anonymize or archive first.
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  amount_minor bigint NOT NULL
);
CREATE INDEX idx_invoices_org ON invoices (organization_id);
```

## Anti-patterns

- Default `NO ACTION` everywhere without thought.
- Relying on ORM-level `cascade` to enforce data integrity (it doesn't run on raw SQL or
  cross-service deletes).
- Forgetting the FK index on Postgres — turns every parent delete into a sequential scan.
- CASCADE on a huge child table — a single parent delete can lock & churn millions of rows.
- SET NULL on a `NOT NULL` column (migration succeeds, first cascade fails at runtime).
- Mixing soft-delete on parents with CASCADE on children (cascade never fires; app must handle).
- Using cascades to work around missing application logic (prefer explicit deletion for
  observability).
- Implicit cross-module cascade: module A's table cascades into module B's table — creates a
  hidden coupling between modules.
- Long cascade chains (`A → B → C → D → E`) — debugging a slow delete becomes archaeology.
- Cross-tenant CASCADE — an FK chain that spans multiple tenants can delete unrelated
  tenants' rows in a single operation.

## Code review checklist

- [ ] Every FK has an explicit `ON DELETE` clause in the migration
- [ ] Choice justified by decision tree (owned / independent / optional / historical)
- [ ] Nullable column if `ON DELETE SET NULL`
- [ ] FK column has an explicit index (Postgres does not auto-create one)
- [ ] DB-level constraint is set; ORM-level `cascade` flags only used for lifecycle hooks
- [ ] Soft-delete interaction documented per table
- [ ] Historical / audit tables use `SET NULL` or no-FK pattern, intentionally chosen
- [ ] No giant-table CASCADE without perf consideration
- [ ] No cascade chain crossing tenant boundaries
- [ ] Service-level multi-step deletes wrapped in a transaction
- [ ] External side effects (email, Stripe, S3) emitted **after** the transaction commits
- [ ] Integration test covers each cascade mode (CASCADE / RESTRICT / SET NULL)

## See also

- [`13-database-design.md`](./13-database-design.md) — FK naming + indexing
- [`14-database-orm-patterns.md`](./14-database-orm-patterns.md) — ORM-specific cascade syntax
- [`15-migrations.md`](./15-migrations.md) — adding / changing constraints
- [`03-module-design.md`](./03-module-design.md) — one module owns its tables
- [`23-testing.md`](./23-testing.md) — integration tests against real Postgres
- [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md) — tenant scoping rules
