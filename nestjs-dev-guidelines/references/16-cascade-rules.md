# 16 — Cascade Rules (ON DELETE / ON UPDATE)

## TL;DR

- **`ON DELETE CASCADE`** — for data that exists only because of the parent (owned data). Deleting the parent should delete this child. Examples: a user's `sessions`, an order's `order_items`, a conversation's `messages`.
- **`ON DELETE RESTRICT`** (or `NO ACTION`) — for data that references the parent but has its own independent existence. Don't allow parent to be deleted while references remain. Examples: a payment linked to an invoice; a user who owns organizations.
- **`ON DELETE SET NULL`** — optional references where losing the parent is fine but the child survives. Examples: `assigned_to_user_id` on a task.
- **`ON UPDATE`** — usually leave as NO ACTION since PKs shouldn't change (use immutable UUIDs).
- Always index the FK column; otherwise cascade is O(n) per delete.

## Why it matters

Cascade semantics are invisible until a delete happens. A wrong choice either leaves orphan
rows cluttering the DB or deletes data you meant to keep. Decide up-front, document in the
migration, don't change later without a data audit.

## Decision tree

```
Can this child row exist without the parent row?
├── No (life-cycle fully owned by parent)
│   → ON DELETE CASCADE
├── Yes, but the reference is optional
│   → ON DELETE SET NULL  (column must be nullable)
├── Yes, and the reference is required (but parent delete is rare and risky)
│   → ON DELETE RESTRICT  (force application to clean up first)
└── Yes, and you want to explicitly handle the delete in code
    → ON DELETE NO ACTION  (behaves like RESTRICT but deferrable)
```

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
```

Application-side: when deleting an invoice, first check / clean up payments or refuse the action
with a meaningful error: `{ code: 'INVOICE.HAS_PAYMENTS' }`.

### Optional link → SET NULL

- `tasks.assigned_to_user_id` — unassign on user deletion.
- `posts.last_edited_by_user_id` — keep the post; clear the editor.
- `files.uploaded_by_user_id` — keep the file; forget who uploaded.

```sql
CREATE TABLE tasks (
  ...
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  ...
);
```

Column **must be nullable** for SET NULL to work.

### Historical / immutable records

Audit logs, payment events, webhook events — these usually need to survive deletion of the
"parent" (e.g., a deleted user) because they're an immutable record of what happened.

```sql
CREATE TABLE audit_log (
  ...
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  -- or no FK at all, just store the ID as text
  ...
);
```

## Interaction with soft delete

If you soft-delete users (`users.deleted_at`), FK constraints don't fire — so cascade/restrict
rules only apply to **hard** deletes. Two patterns:

1. **Soft-delete only.** Rows stay forever (filtered by `deleted_at IS NULL`). FKs never fire.
   The app handles the semantic cleanup (e.g., setting `tasks.assigned_to_user_id = NULL`
   when a user is soft-deleted).
2. **Soft-delete then purge.** Background job eventually hard-deletes. FK cascades fire then.
   Application code doesn't have to handle cleanup twice.

Pick one pattern per table and document it.

## Application-level cleanup in services

Even with CASCADE at DB level, sometimes you want service-level orchestration for visibility
(events, side effects):

```ts
async deleteUser(userId: string) {
  await this.apiKeys.revokeAll(userId);           // emits revoked events
  await this.billing.cancelSubscriptions(userId); // emits canceled events
  await this.users.hardDelete(userId);            // DB cascade removes sessions, memberships
  await this.events.emit(new UserDeletedEvent({ userId }));
}
```

The DB cascade is the safety net. Services do the meaningful cleanup with events so downstream
systems know.

## ON UPDATE

Usually `NO ACTION`. PKs should be immutable. If you're updating a PK you're doing something
unusual — avoid it.

## Composite FKs and multi-column cascades

Supported but unusual. Prefer surrogate keys (`id uuid`) over natural composite keys that
cascade complicates.

## Deferrable constraints

Rare. Allows you to violate the FK inside a transaction as long as it's consistent at COMMIT:

```sql
ALTER TABLE a ADD CONSTRAINT ... REFERENCES b(id) DEFERRABLE INITIALLY DEFERRED;
```

Useful for cyclic bootstraps (A references B references A). Use sparingly; understand the
failure modes.

## Testing cascade behavior

Unit tests on service methods aren't enough — add an integration test that:

1. Creates parent + children.
2. Hard-deletes the parent.
3. Asserts children gone (CASCADE) or query fails (RESTRICT) or reference nulled (SET NULL).

## Example schema with mixed cascades

```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_uuid_v7(),
  name varchar(200) NOT NULL,
  ...
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_uuid_v7(),
  email citext NOT NULL,
  ...
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_uuid_v7(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role text NOT NULL,
  ...
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_uuid_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,  -- keep project; forget creator
  ...
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_uuid_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT, -- audit trail
  ...
);
```

## Anti-patterns

- Default `NO ACTION` everywhere without thought.
- CASCADE on a huge child table — a single parent delete can lock & churn millions of rows.
- SET NULL on a `NOT NULL` column (migration fails).
- Mixing soft-delete on parents with CASCADE on children (cascade never fires; app must handle).
- Using cascades to work around missing application logic (prefer explicit deletion for observability).
- Implicit cross-module cascade: module A's table cascades into module B's table — creates a
  hidden coupling between modules.

## Code review checklist

- [ ] Every FK has an explicit `ON DELETE` clause in the migration
- [ ] Choice justified by decision tree (owned / independent / optional)
- [ ] Nullable column if `ON DELETE SET NULL`
- [ ] FK column indexed (required for reasonable delete perf)
- [ ] Soft-delete interaction documented
- [ ] Historical / audit tables use `SET NULL` or ID-only reference (no FK)
- [ ] No giant-table CASCADE without perf consideration

## See also

- [`13-database-design.md`](./13-database-design.md) — FK naming + indexing
- [`15-migrations.md`](./15-migrations.md) — adding / changing constraints
- [`03-module-design.md`](./03-module-design.md) — one module owns its tables
