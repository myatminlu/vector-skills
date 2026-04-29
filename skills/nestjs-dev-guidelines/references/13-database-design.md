# 13 — Database Design (Postgres)

## TL;DR

- Tables: **plural, snake_case** (`users`, `payment_intents`, `api_keys`).
- Columns: `snake_case` (`created_at`, `user_id`, `is_active`).
- Primary key: `id` — prefer **UUIDv7** (time-ordered, sort-friendly) or `bigserial`. Never auto-incrementing integers for public IDs.
- Foreign keys: `<referenced_table_singular>_id` (`user_id`, `organization_id`). Always indexed.
- Timestamps: `created_at`, `updated_at`, `deleted_at` — all `timestamptz`.
- Soft-delete via `deleted_at`; every query filters `WHERE deleted_at IS NULL` unless explicitly including them.
- Constraints: `NOT NULL` by default. Foreign keys with explicit `ON DELETE` behavior. Unique constraints on business keys.
- One module owns its tables. No cross-module writes to another module's tables.

## Why it matters

Schema changes are the hardest thing to reverse. A bad column name today is `ALTER TABLE`
pain for a year. Clean conventions save review time and keep queries predictable.

## Naming

### Tables

- Plural nouns: `users`, `orders`, `payments`, `webhook_deliveries`.
- Snake_case; lowercase always.
- Junction tables: alphabetical names joined — `organizations_users`, `posts_tags`.
- Prefix-avoid: don't name tables `tbl_users` or `user_table`. The schema is the namespace.

### Columns

- `snake_case`: `first_name`, `last_login_at`, `is_deleted`.
- Foreign keys: `<singular_referenced>_id` — `user_id` references `users.id`.
- Booleans: `is_active`, `has_verified_email`, `can_post`.
- Timestamps: `<verb>_at` — `created_at`, `verified_at`, `archived_at`.
- Money: `amount_cents` (`bigint`) — never `amount` as a float. `int` overflows past ~$21M.
- Enums: text columns with CHECK constraint, OR Postgres `ENUM` type (harder to change).

### Indexes

- Named: `idx_<table>_<cols>` — `idx_users_email`, `idx_payments_user_created`.
- Unique: `uq_<table>_<cols>` — `uq_users_email`.
- Foreign key names: `fk_<table>_<col>` (often auto-named — override if team prefers).

## Identifiers

### Prefer UUIDv7 for public IDs

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  ...
);
```

- Globally unique — safe to merge, replicate, shard.
- Time-ordered — index-friendly (unlike UUIDv4 which is random and bad for index locality).
- Not guessable — no enumeration attack (unlike auto-increment integers).

Function source — verify which one your Postgres has before writing migrations:

- **Postgres 18+:** native `uuidv7()`. No extension needed.
- **Postgres 17 and older:** install the `pg_uuidv7` extension (`CREATE EXTENSION pg_uuidv7;` → `uuid_generate_v7()`), or generate in app code (e.g. `uuidv7` npm package).
- Pick one and use it consistently across all migrations. Examples below use `uuidv7()` (Postgres 18+).

### Alternative: `bigserial` with a public slug/id

Useful if you want compact URLs.

```sql
CREATE TABLE orders (
  id bigserial PRIMARY KEY,
  public_id text UNIQUE NOT NULL DEFAULT ('ord_' || encode(gen_random_bytes(12), 'base64')),
  ...
);
```

Internal queries use `id`; API uses `public_id`. The integer is never exposed.

## Timestamps — always `timestamptz`

```sql
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
deleted_at timestamptz,
```

- `timestamptz` stores UTC; prints in session tz. `timestamp` without tz is a trap.
- `updated_at` maintained by trigger:

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

## Soft delete

```sql
deleted_at timestamptz
```

- Most queries: `WHERE deleted_at IS NULL`.
- Unique constraints that must ignore deleted rows use a partial unique index:
  ```sql
  CREATE UNIQUE INDEX uq_users_email_active ON users (email) WHERE deleted_at IS NULL;
  ```
- For hard-compliance data (GDPR right to delete), use a dedicated purge job that actually
  deletes rows, not just soft-delete.

Soft delete is not always appropriate — audit log tables should be append-only, not soft-deletable.

## Foreign keys

Always declare explicitly:

```sql
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  ...
);
```

Pick cascade behavior deliberately — see `16-cascade-rules.md`.

Always index the FK column:

```sql
CREATE INDEX idx_orders_user ON orders (user_id);
```

Without the index, `ON DELETE` on the parent is O(n) on the child.

## NULL vs NOT NULL

- **Default: NOT NULL.** Only allow NULL when it has a meaning ("not yet verified" = `verified_at IS NULL`).
- Don't use empty string as "no value" — use NULL.
- Be consistent: a nullable `email` should always mean the same thing.

## Types — common choices

| Need | Type |
|---|---|
| Short text (≤ 255 chars) | `varchar(n)` or `text` (Postgres treats both same internally) |
| Long text | `text` |
| Email | `citext` (case-insensitive) or `text` + lower index |
| Money | `bigint` (store cents / minor units) |
| Float measurements | `numeric(precision, scale)` — NOT `float`/`double` |
| Booleans | `boolean` |
| Dates only | `date` |
| Timestamps | `timestamptz` |
| Enums | `text` + CHECK constraint (easier to add values), or `CREATE TYPE ... AS ENUM` |
| JSON | `jsonb` (always prefer over `json`) |
| Binary | `bytea` (small) or S3 reference (large) |
| UUIDs | `uuid` |
| IP | `inet` |

## Check constraints

Express business rules at the DB level when you can:

```sql
CREATE TABLE orders (
  ...
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  currency char(3) NOT NULL CHECK (currency = upper(currency)),
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'refunded', 'canceled'))
);
```

DB constraints catch bugs the app missed, and document invariants close to the data.

## Indexes — rules of thumb

- Every FK column: indexed.
- Every column you `WHERE` or `ORDER BY` at scale: indexed (alone or as part of composite).
- Composite order matters: most-selective column first, then filters, then sort columns.
- Partial indexes for common filters: `... WHERE deleted_at IS NULL`.
- Avoid indexing everything — writes slow down; storage grows.
- Measure with `EXPLAIN (ANALYZE, BUFFERS)` on realistic data.

### Common patterns

```sql
-- list by user, most recent first
CREATE INDEX idx_payments_user_created ON payments (user_id, created_at DESC) WHERE deleted_at IS NULL;

-- lookup by email (active users)
CREATE UNIQUE INDEX uq_users_email_active ON users (lower(email)) WHERE deleted_at IS NULL;

-- text search (if needed)
CREATE INDEX idx_posts_title_trgm ON posts USING gin (title gin_trgm_ops);
```

## Transactions

Any mutation that spans two or more rows or tables that must stay consistent runs in a transaction. In NestJS, use the ORM's transaction helper instead of raw `BEGIN`/`COMMIT` so the connection lifecycle is managed:

```ts
// TypeORM
await this.dataSource.transaction(async (tx) => {
  await tx.update(Inventory, { id }, { qty: () => `qty - ${n}` });
  await tx.insert(OrderItem, items);
  await tx.insert(Order, order);
});

// Prisma
await this.prisma.$transaction(async (tx) => {
  await tx.inventory.update({ where: { id }, data: { qty: { decrement: n } } });
  await tx.orderItem.createMany({ data: items });
  await tx.order.create({ data: order });
});
```

Raw SQL equivalent (only when ORM is bypassed):

```ts
await client.query('BEGIN');
try {
  await client.query('UPDATE inventory SET qty = qty - $1 WHERE id = $2', [n, id]);
  await client.query('INSERT INTO order_items ...');
  await client.query('INSERT INTO orders ...');
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
}
```

Use `SELECT ... FOR UPDATE` when you read-then-write and need to prevent interleaving.

See [`14-database-orm-patterns.md`](./14-database-orm-patterns.md) for ORM transaction details and [`19-background-jobs.md`](./19-background-jobs.md) for the outbox pattern (transaction + event emission).

## Multi-tenant

Quick summary — see [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md) for the full strategy comparison, RLS setup, and Nest-side enforcement.

- **Row-level isolation** (same DB, `organization_id` column): simplest; risks query-bug leaks.
- **Schema-per-tenant**: harder; supported by Postgres but harder to migrate.
- **DB-per-tenant**: isolation is strong; ops is expensive.

If row-level:
- Every tenant-owned table has `organization_id uuid NOT NULL REFERENCES organizations(id)`.
- Every query filters on `organization_id = $current_org`. Consider Postgres RLS (row-level security) to enforce at the DB level.

## Schema migrations

See `15-migrations.md`. Key rule: never edit a migration that has run anywhere.

## Audit / history

For tables whose history matters (money, privileges):

- **Append-only log**: separate table `payment_events (payment_id, action, actor, at, metadata)`.
- **Temporal table (manual)**: `<table>_history` with all historical row versions.
- **CDC** (Debezium, Postgres logical replication) for ETL to a data warehouse.

Don't overwrite the current row with snapshots; keep history beside it.

## Example schema

```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name varchar(200) NOT NULL,
  slug varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_organizations_slug_active ON organizations (slug) WHERE deleted_at IS NULL;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  email citext NOT NULL,
  name varchar(200) NOT NULL,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX uq_users_email_active ON users (email) WHERE deleted_at IS NULL;

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_memberships_user_org ON memberships (user_id, organization_id);
CREATE INDEX idx_memberships_org ON memberships (organization_id);
```

## Anti-patterns

- Singular table names (`user`, `order`).
- Mixed case columns (`createdAt`, `UserId`).
- Integer auto-increment as public ID (enumeration attack).
- `timestamp` without tz.
- `float` for money.
- `NULL` meaning different things in different columns.
- `email text` without case handling (`citext` or lower() index).
- Missing FK indexes.
- Mutable `created_at` (updated by app).
- JSON column that grows unbounded (move to dedicated rows).
- No soft delete where it's clearly needed (cannot audit who had what).

## Code review checklist

- [ ] Table name is plural snake_case; columns are snake_case
- [ ] PK is `id`; FKs are `<entity>_id` and indexed
- [ ] Timestamps are `timestamptz`; `created_at` + `updated_at` present
- [ ] Soft delete column if domain requires reversibility
- [ ] `NOT NULL` by default; NULLs have documented meaning
- [ ] Unique constraints respect soft delete (partial index)
- [ ] Check constraints for enums / ranges
- [ ] Indexes for all WHERE / ORDER BY paths; partial where appropriate
- [ ] FK `ON DELETE` behavior deliberate (see `16`)
- [ ] Money as integer minor units or `numeric`; never float
- [ ] Multi-tenant tables carry `organization_id` + index

## See also

- [`14-database-orm-patterns.md`](./14-database-orm-patterns.md) — ORM-specific patterns
- [`15-migrations.md`](./15-migrations.md) — safe schema change
- [`16-cascade-rules.md`](./16-cascade-rules.md) — ON DELETE matrix
- [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md) — full multi-tenancy guide (RLS, scoping, isolation)
- [`08-pagination-filters-sorting.md`](./08-pagination-filters-sorting.md) — indexes for list endpoints
