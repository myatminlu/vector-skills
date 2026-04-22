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
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_uuid_v7()') },
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

### TypeORM

```bash
npm run typeorm migration:generate -- -n AddPaymentsTable
npm run typeorm migration:run
npm run typeorm migration:revert     # dev only
```

- Generated from entity diff — review carefully, don't trust blindly.
- Check indexes, constraint names, nullability.

### Drizzle

```bash
npx drizzle-kit generate:pg --name add_payments_table
npx drizzle-kit push:pg                    # dev
# for prod: apply SQL via your own runner or drizzle-orm/migrator
```

## Zero-downtime changes

Some changes are incompatible between old-app / new-app running simultaneously during deploy.
Split into phases. Each phase is a migration or deploy by itself.

### Add a NOT NULL column to an existing table

1. Migration: add column as nullable.
2. Deploy: code reads both (old behavior if null, new if present) and writes the new column.
3. Migration: backfill — `UPDATE table SET new_col = default_for(row) WHERE new_col IS NULL`. Batch by 1000 rows at a time if the table is big.
4. Migration: set `NOT NULL` + default if desired.
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
- [ ] Check constraints added with `NOT VALID` + VALIDATE for large tables
- [ ] Backfill logic chunked if large
- [ ] Tested on staging with realistic size
- [ ] No `synchronize: true` or equivalent in prod config

## See also

- [`13-database-design.md`](./13-database-design.md) — target schema conventions
- [`14-database-orm-patterns.md`](./14-database-orm-patterns.md) — ORM specifics
- [`16-cascade-rules.md`](./16-cascade-rules.md) — ON DELETE choices when adding FKs
