# 15 — Migrations

## TL;DR

- **Forward-only.** Once a migration runs anywhere (even locally on a teammate's machine), it's immutable. New change → new migration.
- **Zero-downtime rollout.** Destructive changes (drop column, rename) are split into multiple deploys: add new → backfill → switch writes → stop reads → drop old.
- One migration = one logical change. Don't batch unrelated changes.
- Numbering: timestamp prefixes (`20260422_add_payments_table.sql`) — avoids merge conflicts.
- Test migrations on a prod-like dataset before merging.

## Why it matters

Migrations are the only code that directly modifies data. A bad migration can corrupt years of
records, break every deployed client, or lock a big table and take the site down. Treat them
with production-grade care.

## Forward-only philosophy

- **Never edit** a migration that's been applied anywhere — including your teammate's local DB.
- **Never rename** a migration file once committed.
- **Down migrations** — write them for dev convenience only; never rely on them in production. Production rollback is a new migration that undoes the change.

If you realize a shipped migration is wrong: **new migration** on top that fixes it. The broken one is part of history now.

## Numbering

Use timestamp prefixes: `20260422113045_add_payments_table`. Avoids merge conflicts that
happen with sequential integers (PR A and PR B both claim `0042`).

## Per-ORM / per-tool patterns

### node-pg-migrate (raw pg projects)

```bash
npx node-pg-migrate create add_payments_table
# edits: migrations/<timestamp>_add_payments_table.js
npx node-pg-migrate up           # apply all pending
npx node-pg-migrate down 1       # dev rollback (NOT for prod)
```

```js
// migrations/20260422113045_add_payments_table.js
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('payments', {
    // UUIDv7 needs Postgres 18+ OR the `pg_uuidv7` extension. On older versions,
    // use `gen_random_uuid()` from pgcrypto, or generate the id in app code.
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'RESTRICT' },
    amount_cents: { type: 'bigint', notNull: true, check: 'amount_cents >= 0' },
    status: { type: 'text', notNull: true, check: `status IN ('pending','paid','refunded','canceled')` },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });
  pgm.createIndex('payments', 'user_id');
  pgm.createIndex('payments', ['user_id', 'created_at'], {
    name: 'idx_payments_user_created', method: 'btree',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('payments');
};
```

### Prisma

```bash
npx prisma migrate dev --name add_payments_table     # dev: generates + applies
npx prisma migrate deploy                             # prod: apply committed migrations
```

- Schema edits in `schema.prisma`; `migrate dev` generates SQL.
- Commit the generated `migrations/` folder.
- **Never** edit generated SQL after `migrate dev` runs. If you need changes, create a follow-up migration with `--create-only` and edit that one.

### TypeORM (0.3.x)

The legacy `-n` flag was removed in TypeORM 0.3 — pass the migration **path** as the
positional argument, and the data source via `-d`:

```bash
# generate (diff entities → migration)
npx typeorm-ts-node-commonjs migration:generate src/migrations/AddPaymentsTable -d src/data-source.ts

# create (empty migration to write by hand)
npx typeorm-ts-node-commonjs migration:create src/migrations/AddPaymentsTable

# apply / revert
npx typeorm-ts-node-commonjs migration:run -d src/data-source.ts
npx typeorm-ts-node-commonjs migration:revert -d src/data-source.ts   # dev only
```

- Generated from entity diff — review carefully, don't trust blindly.
- Check indexes, constraint names, nullability.
- Never set `synchronize: true` on the production data source.

### Drizzle (drizzle-kit ≥ 0.20)

The `:pg` suffix and `push:pg` commands are gone. Dialect is configured in
`drizzle.config.ts` (`dialect: 'postgresql'`), and the CLI is dialect-agnostic:

```bash
# generate SQL from schema diff
npx drizzle-kit generate --name=add_payments_table

# apply migrations (prod-safe runner)
npx drizzle-kit migrate

# dev-only: push schema directly without generating files
npx drizzle-kit push
```

- Commit the generated `drizzle/` folder.
- For programmatic apply in app code, use `drizzle-orm/<driver>/migrator`'s `migrate()`.

## Zero-downtime changes

Some changes are incompatible between old-app / new-app running simultaneously during deploy.
Split into phases. Each phase is a migration or deploy by itself.

### Add a NOT NULL column to an existing table

1. Migration: add column as nullable. Don't set a non-volatile default on a large table — Postgres rewrites the whole table. Use `ALTER TABLE … ADD COLUMN … DEFAULT …` only when you understand the rewrite cost (PG 11+ skips the rewrite for **constant** defaults, but expressions like `now()` still rewrite).
2. Deploy: code reads both (old behavior if null, new if present) and writes the new column.
3. **Backfill out-of-band**, not inside a transactional migration. Most ORM runners wrap the whole migration in `BEGIN … COMMIT`, so a single `UPDATE` and a chunked loop both hold locks until the end. Run the backfill from a script (`commands/`) or a dedicated migration with the runner's transaction disabled, in batches of 1k–10k rows with a short sleep between batches:
   ```sql
   UPDATE payments SET new_col = default_for(row)
   WHERE id IN (
     SELECT id FROM payments WHERE new_col IS NULL ORDER BY id LIMIT 5000 FOR UPDATE SKIP LOCKED
   );
   ```
4. Migration: `ALTER TABLE … ALTER COLUMN new_col SET NOT NULL` only after the backfill verifies zero NULLs.
5. Deploy: clean up "both" reads.

### Rename a column

1. Add new column.
2. Deploy: write both, read from old.
3. Backfill.
4. Deploy: write both, read from new.
5. Deploy: write new only.
6. Migration: drop old column.

### Drop a column

1. Deploy: code stops reading / writing the column.
2. Migration: drop column.

**Never drop a column in the same deploy the code stops using it.** The old instance may be
still serving traffic.

### Add a unique constraint

1. Pre-check: scan data for duplicates. Clean up.
2. Migration: `CREATE UNIQUE INDEX CONCURRENTLY ...` (Postgres) to avoid long locks.
3. Migration: `ALTER TABLE ADD CONSTRAINT ... USING INDEX ...`.

### Large-table changes

- Prefer `CONCURRENTLY` for index creation in Postgres.
- Break data migrations into chunks; run outside peak.
- For 10M+ row updates, consider a dedicated backfill job rather than a migration step.

## Lock and statement timeouts

Migrations that wait indefinitely for a lock can take down a hot table. Always set
short timeouts at the top of any DDL migration so a blocked statement fails fast and
gets retried, instead of queueing behind a long-running query and blocking every
incoming write:

```sql
SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE payments ADD COLUMN refunded_at timestamptz;
```

- `lock_timeout` aborts if the statement can't acquire its lock in time.
- `statement_timeout` aborts a statement that's running too long.
- These are **session-local** — set them inside the migration, not on the role, so
  long-running maintenance scripts can opt out.
- For the runner-level guarantee, also configure `idle_in_transaction_session_timeout`
  on the migration role.

## Adding a foreign key to a large table

`ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY …` takes an `ACCESS EXCLUSIVE` lock on
both the referencing and referenced tables while it scans every row. On a hot table
this is a multi-minute outage. Split it:

```sql
-- Phase 1: add the constraint without scanning. Brief lock only.
ALTER TABLE payments
  ADD CONSTRAINT fk_payments_user
  FOREIGN KEY (user_id) REFERENCES users(id)
  NOT VALID;

-- Phase 2 (separate migration, after phase 1 has been deployed):
-- validate without blocking writes — only takes a SHARE UPDATE EXCLUSIVE lock.
ALTER TABLE payments VALIDATE CONSTRAINT fk_payments_user;
```

`NOT VALID` means the constraint is enforced for *new* rows but the existing rows
aren't checked. `VALIDATE CONSTRAINT` then scans the table without blocking writes.

## Check constraints

Can be added with `NOT VALID` to skip the initial table scan, then validated out-of-band:

```sql
ALTER TABLE payments ADD CONSTRAINT chk_amount_nonneg CHECK (amount_cents >= 0) NOT VALID;
-- later, outside the deploy
ALTER TABLE payments VALIDATE CONSTRAINT chk_amount_nonneg;
```

## Indexes

Always create indexes on large production tables with `CONCURRENTLY`:

```sql
CREATE INDEX CONCURRENTLY idx_payments_user_created ON payments (user_id, created_at DESC);
```

This doesn't block writes. It runs outside a transaction, so Prisma/TypeORM migrations that
wrap everything in `BEGIN` need manual handling — either raw SQL files or disable the txn.

## Data migrations

Prefer separate scripts for heavy data work:

- Schema migration adds the new column.
- A one-off script (in `commands/`) backfills.
- Schema migration enforces the constraint.

This keeps schema changes fast and reversible; data ops can be resumed / chunked.

## Destructive operations — checklist

Before `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`:

- [ ] Data exported / archived somewhere (S3, warehouse).
- [ ] Consumers stopped reading (confirmed via logs / deploy timeline).
- [ ] Tested on staging with realistic data.
- [ ] Second engineer reviews.

## Rollback strategy

- Rollback = a new migration that **undoes** the change (or a new deploy of the prior code + its matching DB state).
- In practice, most companies roll forward (fix with another migration) rather than roll back.
- Backups are your real rollback. Ensure point-in-time-recovery is available on the prod DB.

## Migration testing

- **Local**: run forward, exercise the app, run backward (if safe), forward again.
- **Staging**: copy of prod schema + realistic data volume. Test timing.
- **Shadow reads** for risky rename/change: double-read old + new, compare, alert on mismatches.
- In CI: spin up an empty Postgres, run all migrations, assert success + schema shape.

## Migration ordering

- Never run migrations out of order in production.
- Never manually edit the migrations table.
- If a migration fails mid-way, investigate before retrying — did a partial DDL leave the DB in an odd state?

## Seeds (development only)

- `commands/seed.command.ts` script populates dev data.
- Never runs in prod. Gate with `if (env.NODE_ENV !== 'development') throw`.

## Security-sensitive migrations

- Adding a new "secret-like" column (e.g., `two_factor_secret`): plan encryption at rest from day 1.
- Dropping PII: hard delete and schedule backup rotation; soft delete alone doesn't satisfy compliance.
- Granting new roles / permissions: review at PR level; never auto-run elevation migrations.

## Example: add a new feature module

1. Migration: create `conversations`, `messages`, `attachments` tables with FKs + indexes.
2. Code: add module + repository + service + controller.
3. Migration (later, after feature is live): any enum extension, additional indexes based on EXPLAIN.

## Anti-patterns

- Editing a shipped migration because "it was easier than writing a new one."
- Dropping a column and the code that uses it in the same deploy.
- Creating indexes without `CONCURRENTLY` on hot tables.
- Running a big data update inside a transactional migration that holds locks.
- Adding a foreign key to a large table in one shot (without `NOT VALID` + `VALIDATE`).
- Running DDL without `lock_timeout` / `statement_timeout`.
- Concurrent runners racing on the same DB without an advisory lock — always serialize migrations with `pg_advisory_lock` (most runners do this for you, but verify).
- `synchronize: true` in production (TypeORM).
- Numbering migrations with integers that collide on rebase.
- Skipping staging tests "because the change is small."
- Mixing schema + data + seed changes in one file.

## Code review checklist

- [ ] Single logical change per migration
- [ ] New migration file, not edit of an existing one
- [ ] Timestamp-prefix naming
- [ ] Destructive steps split across deploys (add → backfill → switch → drop)
- [ ] Large indexes use `CONCURRENTLY`
- [ ] Check constraints AND foreign keys on large tables added with `NOT VALID` + `VALIDATE`
- [ ] `lock_timeout` and `statement_timeout` set at the top of DDL migrations
- [ ] Backfills run as a separate script or non-transactional migration, chunked
- [ ] No table-rewriting `ADD COLUMN … DEFAULT <volatile>` on a large table
- [ ] Tested on staging with realistic size
- [ ] No `synchronize: true` or equivalent in prod config

## See also

- [`13-database-design.md`](./13-database-design.md) — target schema conventions
- [`14-database-orm-patterns.md`](./14-database-orm-patterns.md) — ORM specifics
- [`16-cascade-rules.md`](./16-cascade-rules.md) — ON DELETE choices when adding FKs
