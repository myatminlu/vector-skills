# 33 — Multi-Tenancy Patterns

## TL;DR

- Tenant identity is **server-derived** and enforced in more than one layer: auth, guard, service, repository, and (when available) the database.
- Never trust a client-supplied tenant id by itself. A tenant selector from the client must be validated against the authenticated user's memberships before it is used.
- Pick one isolation strategy deliberately — shared schema with `tenant_id` column, schema-per-tenant, or database-per-tenant — and write the trade-off down in the repo.
- Tenant-scoped tables carry a tenant key. Repository queries filter by tenant for **reads, updates, deletes, and counts** — including list pagination — and inserts set the tenant id from server context.
- Propagate tenant context through async work. Background jobs, schedulers, webhooks, cache keys, file storage paths, and idempotency keys all carry the tenant id explicitly.
- Adding tenant scope to a live table is a **staged migration** (add nullable → backfill → enforce NOT NULL + index → enable filtering), never a single deploy.
- Integration tests seed at least two tenants and assert that tenant A cannot see, mutate, or delete tenant B's data.

## Why it matters

Cross-tenant data leakage is the breach category that quietly ends products. It almost always
comes from a single missing `WHERE tenant_id = ?`, a client-supplied tenant id that was trusted
too early, or a background job that lost its tenant context. Layering isolation across auth,
guard, service, repository, and (where supported) the database means a bug in any one layer
still does not leak data.

This file does not require one specific auth library, JWT claim shape, decorator set, ORM, or
schema layout. The repo's existing model is fine when it preserves the same isolation
properties. The pseudo-code below uses Nest-shaped TypeScript for clarity.

## Core rule

**Tenant identity is server-derived and enforced in more than one layer.**

The usual layers, top to bottom:

1. **Authentication / session** identifies the user and active tenant.
2. **Guard / middleware** attaches identity to the request context.
3. **Controller** reads identity from the trusted context — never from the body.
4. **Service** authorizes the action for that tenant.
5. **Repository / data-access** filters by tenant in the query.
6. **Database** enforces row-level security where supported (defense of last resort).
7. **Tests** prove tenant A cannot access tenant B's data.

If any layer is skipped, the next layer must still prevent cross-tenant access. The repository
is the layer of last resort for application code; RLS is the layer of last resort for the
system.

## Identity models

Common valid models:

- **One active organization in the JWT** — fast, stateless; switching tenants requires a new token.
- **Server-side session with active organization** — easy to revoke and switch; needs session store.
- **Path-based tenant selection** (`/orgs/:orgId/...`) with a guard that verifies membership on every request.
- **Header-based tenant selection** (`X-Tenant-Id`) only when the header is authenticated *and* membership-checked on every request.

Avoid:

- Trusting `tenant_id` from the request body or URL without a membership check.
- Using a tenant id stored in `localStorage` as authoritative.
- Inferring tenant from a hostname/subdomain without a server-side mapping that the user has been authorized against.

## Tenant resolution and propagation

Resolution happens once per request. Propagation carries the resolved id everywhere downstream.

### HTTP request path

```ts
// 1) JwtAuthGuard verifies the token and attaches identity.
//    request.user = { sub, memberships: [{ orgId, role }] }
//
// 2) TenantGuard resolves the active tenant for this request, validates membership,
//    and stores it in async-local context so services and repositories can read it.

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user; // set by JwtAuthGuard

    const requested = req.params.orgId ?? req.headers['x-tenant-id'] ?? user.activeOrgId;
    const membership = user.memberships.find((m) => m.orgId === requested);
    if (!membership) throw new ForbiddenException(); // or NotFoundException for enumeration safety

    this.cls.set('tenantId', membership.orgId);
    this.cls.set('role', membership.role);
    req.tenantId = membership.orgId;
    return true;
  }
}
```

### Reading tenant from anywhere downstream

Do not pass `tenantId` through every function signature by hand. Use a request-scoped store
(Nest `ClsModule`, `nestjs-cls`, or `AsyncLocalStorage` directly):

```ts
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService) {}
  get id(): string {
    const id = this.cls.get<string>('tenantId');
    if (!id) throw new Error('tenant context missing'); // fail loud, never fall back to a default
    return id;
  }
}
```

### Background jobs, schedulers, webhooks

Async workers do not have a request. The job payload **must** carry the tenant id, and the
worker must rehydrate the same `tenantId` into context before any business code runs.

```ts
// Producer
await queue.add('invoice.generate', { tenantId, invoiceId });

// Worker — canonical @nestjs/bullmq shape (see 19-background-jobs.md)
@Processor('invoices')
export class InvoiceWorker extends WorkerHost {
  constructor(private readonly cls: ClsService) {
    super();
  }

  async process(job: Job<{ tenantId: string; invoiceId: string }>) {
    return this.cls.run({}, async () => {
      this.cls.set('tenantId', job.data.tenantId);
      // …business code reads tenantId from TenantContext
    });
  }
}
```

Same rule for `@Cron`, webhook handlers, event consumers, and CLI commands. If the trigger has
no natural tenant (e.g., a cross-tenant maintenance task), state that explicitly and use a
dedicated *system* code path that bypasses tenant filtering deliberately and is logged.

## Isolation strategies

Pick one and write the choice down. Mixing strategies in one service is rarely worth it.

| Strategy | When to use | Trade-offs |
|---|---|---|
| **Shared schema, `tenant_id` column** | Most SaaS. Default. | Cheapest ops; one query bug can leak. Mitigate with RLS + repository wrapper. |
| **Schema-per-tenant** | Strong isolation, regulated data, per-tenant customization. | Migrations fan out N times; connection pool per schema; harder cross-tenant analytics. |
| **Database-per-tenant** | Enterprise / regulated single-tenant deployments. | Strongest isolation; most expensive ops; per-tenant backup/restore is easy but heavy. |

For shared schema (the common case):

- Every tenant-scoped table has `organization_id uuid NOT NULL REFERENCES organizations(id)`.
- Every tenant-scoped query filters on `organization_id`.
- Add a composite index that leads with `organization_id` for hot query paths.
- Enable Postgres RLS (below) where the database supports it.

## Data model invariants

- Tenant-scoped tables carry a tenant/organization key (or use the strategy's equivalent isolation mechanism).
- Repository methods **require** tenant context for tenant-scoped operations: reads, updates, deletes, and counts filter by tenant in the `WHERE` clause; inserts set `tenant_id` from server context.
- Server code sets tenant-owned fields. DTOs do **not** accept `tenantId`/`organizationId` from clients; if they appear, validation strips them (`whitelist: true`, `forbidNonWhitelisted: true`).
- Index tenant keys with the common query paths (e.g., `(organization_id, created_at desc)` for list endpoints).
- Adding tenant scope to an existing live table is a staged migration (see below), not a single risky deploy.

Use the repo's established id strategy and database functions. Verify UUID extension and default
function names against the target database version before writing migrations.

## Tenant-scoped repository pattern

The repository is the application layer of last resort. Wrap the data-access layer so callers
**cannot** forget the tenant predicate.

```ts
// ❌ Forgettable — every caller must remember WHERE
async findInvoice(id: string) {
  return this.db.invoice.findUnique({ where: { id } });
}

// ✅ Tenant predicate is structural; the method literally cannot be called without it
async findInvoice(id: string, tenantId: string) {
  return this.db.invoice.findFirst({ where: { id, organizationId: tenantId } });
}

// ✅✅ Even better — bind tenant once, return a scoped repo; impossible to query without it
class InvoiceRepository {
  constructor(private readonly db: DbClient, private readonly tenant: TenantContext) {}

  private get scope() { return { organizationId: this.tenant.id }; }

  findById(id: string)        { return this.db.invoice.findFirst({ where: { id, ...this.scope } }); }
  list(cursor?: string)       { return this.db.invoice.findMany({ where: this.scope, take: 50, cursor: cursor ? { id: cursor } : undefined }); }
  count()                     { return this.db.invoice.count({ where: this.scope }); }
  update(id: string, p: Patch){ return this.db.invoice.updateMany({ where: { id, ...this.scope }, data: p }); }
  remove(id: string)          { return this.db.invoice.deleteMany({ where: { id, ...this.scope } }); }
}
```

Rules for the repository layer:

- **Reads, updates, deletes, and counts** all carry the tenant predicate. List endpoints filter the data query *and* the count query.
- Mass-mutation methods (`updateMany`, `deleteMany`) are required when the tenant predicate must be in the `WHERE`. A `findUnique` by primary key alone bypasses it.
- A bulk-delete method that takes only ids is an anti-pattern. Take ids **plus** tenant context.
- Joins to other tenant-scoped tables include the tenant predicate on each join (or the joined tables are also RLS-protected).

## Database-level isolation (Postgres RLS)

For the shared-schema strategy, Postgres Row-Level Security is the strongest defense layer.
Application code still filters; RLS catches the bugs application code missed.

```sql
-- 1) Enable on the table
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;  -- applies to table owners too

-- 2) Policy: rows visible only when the session's tenant id matches
CREATE POLICY tenant_isolation ON invoices
  USING (organization_id = current_setting('app.current_tenant')::uuid)
  WITH CHECK (organization_id = current_setting('app.current_tenant')::uuid);
```

The application sets the per-connection variable on every checkout from the connection pool:

```ts
// Run on the same transaction / connection that will execute queries
await db.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
```

Notes:

- `set_config(..., true)` makes the value transaction-local. Pair it with a transaction-per-request (or transaction-per-job) wrapper so connections from the pool cannot leak the previous request's tenant.
- Use a dedicated **non-superuser** application role; superusers bypass RLS unless `FORCE` is set.
- For maintenance tasks that legitimately need cross-tenant access, use a separate role with `BYPASSRLS` and log every use.
- RLS is not a substitute for application-side filtering — it is a backstop. Both run.

## Authorization semantics

Three distinct questions, answered in order:

- **Authentication** — *who are you?* (JWT/session valid)
- **Tenant resolution** — *which tenant is active and are you a member?* (membership check)
- **Authorization** — *can this user do this action in this tenant?* (RBAC/ABAC)

Repository filtering prevents accidental disclosure even if a service-layer check is missed.
Run role/permission checks **after** tenant membership is established — checking role before
tenant lets a non-member with the right role enumerate ids.

For resources that exist in another tenant, prefer a **`404 Not Found`** response when revealing
existence would create an enumeration oracle. Use `403 Forbidden` only when the client legitimately
knows the resource exists (e.g., a public id they own elsewhere) but lacks permission. Use the
repo's error taxonomy (see [`10-error-handling.md`](./10-error-handling.md)).

## Cross-cutting tenant scope

Tenant scope is not just a database concern. Anywhere data is keyed, stored, or addressed,
include the tenant.

- **Cache keys** — always include the tenant segment. See [`24a-caching-patterns.md`](./24a-caching-patterns.md).
  - `app:invoice:v1:tenant:${tenantId}:id:${id}` ✅
  - `app:invoice:v1:id:${id}` ❌ (cross-tenant cache hit)
- **File storage paths** — prefix object keys with the tenant. See [`37-file-uploads.md`](./37-file-uploads.md).
  - `s3://bucket/tenants/${tenantId}/invoices/${id}.pdf` ✅
  - Do not let client-supplied paths escape the tenant prefix.
- **Idempotency keys** — scope to `tenant + user + route + key`. See [`06-api-design.md`](./06-api-design.md).
- **Webhook events / outbound callbacks** — events are scoped to the tenant they belong to; signatures and secrets are per-tenant. See [`36-webhooks.md`](./36-webhooks.md).
- **Background job queues** — payload carries tenant id; consider per-tenant rate limits.
- **Logs and traces** — every log line and span attribute includes `tenant_id` for triage. See [`21-logging.md`](./21-logging.md), [`22-observability.md`](./22-observability.md).
- **Metrics** — tenant-cardinality matters; tag dashboards with `tenant_id` only where cardinality is bounded, otherwise sample.
- **Soft delete** — tenant filter and `deleted_at IS NULL` are *both* required; do not rely on a global ORM filter for one and forget the other.

## Migrations: adding tenant scope to a live table

Never add `tenant_id NOT NULL` in one deploy on a populated table. Stage it.

1. **Add nullable column.** `ALTER TABLE foo ADD COLUMN organization_id uuid REFERENCES organizations(id);`
2. **Backfill.** Populate `organization_id` from the source of truth (parent row, audit log, owner). For large tables, batch with `WHERE organization_id IS NULL LIMIT 10000`.
3. **Dual-write.** Deploy app code that writes `organization_id` on all new inserts/updates while the column is still nullable.
4. **Verify.** Confirm `SELECT count(*) FROM foo WHERE organization_id IS NULL;` is zero.
5. **Enforce.** `ALTER TABLE foo ALTER COLUMN organization_id SET NOT NULL;` and add the index.
6. **Filter.** Deploy app code (and RLS policy if used) that reads with the tenant predicate.

See [`15-migrations.md`](./15-migrations.md) for general staged-migration safety.

## Testing for isolation

Two tenants in the test database, the same operation from each, asserted both ways.

```ts
describe('Invoices isolation', () => {
  let alice: TestUser; // tenant A
  let bob: TestUser;   // tenant B
  let aliceInvoice: Invoice;

  beforeAll(async () => {
    alice = await seedUserInTenant('A');
    bob = await seedUserInTenant('B');
    aliceInvoice = await createInvoiceAs(alice);
  });

  it('owner can read their invoice', async () => {
    const res = await request(app).get(`/invoices/${aliceInvoice.id}`).set(authHeader(alice));
    expect(res.status).toBe(200);
  });

  it('non-member cannot read across tenants — returns 404, not 403', async () => {
    const res = await request(app).get(`/invoices/${aliceInvoice.id}`).set(authHeader(bob));
    expect(res.status).toBe(404); // enumeration oracle prevention
  });

  it('non-member cannot mutate across tenants', async () => {
    const res = await request(app).patch(`/invoices/${aliceInvoice.id}`).set(authHeader(bob)).send({ note: 'pwn' });
    expect(res.status).toBe(404);
    const after = await getInvoiceAs(alice, aliceInvoice.id);
    expect(after.note).not.toBe('pwn');
  });

  it('list endpoint does not include other tenants in data or count', async () => {
    const res = await request(app).get('/invoices').set(authHeader(bob));
    expect(res.body.data.find((i: Invoice) => i.id === aliceInvoice.id)).toBeUndefined();
    expect(res.body.meta.pagination.total).toBe(0); // envelope from 07-standard-responses.md
  });
});
```

Pair the HTTP-level tests with at least one **repository-level** test that verifies a query
without tenant context throws or returns nothing. See [`23-testing.md`](./23-testing.md).

## Anti-patterns

- Reading `tenantId` from `@Body()` or `@Param()` without a membership check.
- Filtering by tenant in the data query but not the count query — list pages reveal totals across tenants.
- Using a single ORM "global filter" without a *per-call* override audit; one method that bypasses it leaks everywhere.
- Background jobs that read "current tenant" from a global mutable variable.
- Cache keys without a tenant segment.
- File storage paths derived from client-supplied strings without a tenant prefix and traversal check.
- Webhook signatures with one shared secret across tenants — rotation and revocation become impossible.
- Adding `NOT NULL tenant_id` in a single migration on a populated table.
- A `bulkDelete(ids: string[])` repository method without tenant context.
- Cross-tenant admin endpoints reusing the same code path as tenant endpoints, distinguished only by an `isAdmin` boolean inside the handler.
- "We have RLS, so the application doesn't need to filter." RLS is a backstop, not a primary defense — application filtering still runs and gives clearer errors and better query plans.
- Logging tenant-scoped data without `tenant_id` on the log line — triage during an incident becomes guesswork.

## Review checklist

- [ ] Tenant id comes from trusted auth/session context or is membership-checked before use.
- [ ] Client DTOs cannot set or override tenant ownership fields (validation strips unknown keys).
- [ ] Service methods receive or derive tenant context for tenant-scoped operations.
- [ ] Repository queries filter by tenant for **reads, updates, deletes, and counts** — including list pagination.
- [ ] Role/permission checks run **after** tenant membership is established.
- [ ] Cross-tenant access returns the repo's safe not-found/forbidden behavior deliberately.
- [ ] List endpoints include tenant filters in both the data query and the count query.
- [ ] Background jobs, schedulers, webhooks, and event consumers carry tenant context in the payload and rehydrate it before business code runs.
- [ ] Cache keys, file storage paths, and idempotency keys include the tenant segment.
- [ ] Logs and traces include `tenant_id`.
- [ ] Postgres RLS is enabled where applicable, with `FORCE ROW LEVEL SECURITY` and a non-superuser app role.
- [ ] Soft-delete filter and tenant filter coexist; neither is silently dropped.
- [ ] E2E or integration tests seed at least two tenants and assert isolation for read, mutate, list, and count paths.
- [ ] Migrations adding tenant scope are staged: add nullable → backfill → dual-write → verify → enforce + index → filter.

## See also

- [`11-security.md`](./11-security.md) — broken access control, IDOR, defense in depth.
- [`12-authentication-patterns.md`](./12-authentication-patterns.md) — auth boundary and `request.user` shape.
- [`13-database-design.md`](./13-database-design.md) — schema fundamentals and tenant key conventions.
- [`14-database-orm-patterns.md`](./14-database-orm-patterns.md) — repository filtering and ORM specifics.
- [`15-migrations.md`](./15-migrations.md) — staged schema changes.
- [`16-cascade-rules.md`](./16-cascade-rules.md) — `ON DELETE` interaction with tenant scope.
- [`17-pipelines-interceptors-guards.md`](./17-pipelines-interceptors-guards.md) — guard/middleware that attach tenant context.
- [`19-background-jobs.md`](./19-background-jobs.md) — carrying tenant context through queues.
- [`23-testing.md`](./23-testing.md) — two-tenant integration test patterns.
- [`24a-caching-patterns.md`](./24a-caching-patterns.md) — tenant-scoped cache key shapes.
- [`36-webhooks.md`](./36-webhooks.md) — per-tenant webhook scoping and secrets.
- [`37-file-uploads.md`](./37-file-uploads.md) — tenant-scoped storage paths.
