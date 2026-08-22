# 41 — N+1 Elimination

## TL;DR

- **Prove it before you fix it.** Count queries per request. An N+1 is any query count that grows with the number of rows returned; if the count is flat, there is nothing to fix.
- N+1 has **six shapes**, and only one of them is a loop with `await` in it. The other five hide in mappers, lazy getters, resolvers, remote calls, and cache misses.
- The fix is not always a JOIN. Pick from **JOIN / two-query batch-load / DataLoader / batch endpoint** based on the relation's cardinality and whether the list is paginated.
- **A JOIN across a paginated one-to-many relation returns the wrong page.** Row multiplication makes `LIMIT` count joined rows, not parents. This is the most common way an N+1 "fix" becomes a correctness bug.
- Batch-load = one query with `id = ANY($1)`, a `Map`, and a stitch. Learn this pattern; it works with every ORM and with no ORM.
- DataLoader belongs in NestJS behind `AsyncLocalStorage`, not `Scope.REQUEST` — and it is per-request for a security reason, not just a performance one.
- Close the loop with a **query-count test** so the N+1 cannot come back on the next refactor.

## Why it matters

N+1 is the single most common real performance defect in a Nest backend, and it is unusual in
three ways that make it worth its own file.

It **scales with success**: the endpoint is fast in dev with 5 seeded rows and falls over in prod
with 500. It is **invisible in the diff** — the offending line is often a `.map()` in a mapper or
a property access on an entity, not a query. And the obvious fix carries its **own failure mode**:
adding a JOIN to a paginated list endpoint silently changes what the endpoint returns, which is
worse than the slowness it replaced.

`24-performance.md` names N+1 as the top performance win and shows the canonical fix.
This file is the full playbook: how to detect it, how to recognize the variants, how to choose the
right fix, and how to keep it from coming back.

## Detection: prove it with a number

Do not reason about whether an endpoint has an N+1. Count.

### The signal

Query count that **scales with result count**. Fetch 10 rows and see 11 queries; fetch 100 and see
101. The absolute number matters less than the slope. In dev logs the smoking gun is the same SQL
string repeated back to back with different parameters.

### Count queries in dev

Use the ORM's own hook rather than wrapping things by hand where one exists.

```ts
// Prisma — event-based query log
const prisma = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] });
let count = 0;
prisma.$on('query', () => { count += 1; });

// TypeORM — a counting logger
class CountingLogger extends AdvancedConsoleLogger {
  count = 0;
  logQuery(query: string, params?: unknown[], runner?: QueryRunner) {
    this.count += 1;
    super.logQuery(query, params, runner);
  }
}
```

For raw `pg`, wrap the pool where it is provided rather than mutating the shared instance:

```ts
// test/support/counting-pool.ts
export function countingPool(pool: Pool) {
  let count = 0;
  const proxy = new Proxy(pool, {
    get(target, prop, receiver) {
      if (prop === 'query') {
        return (...args: Parameters<Pool['query']>) => {
          count += 1;
          return (target.query as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  return { pool: proxy as Pool, count: () => count, reset: () => { count = 0; } };
}
```

Because the repository layer is the only thing touching the DB (`14-database-orm-patterns.md`),
swapping in a counting pool in a test module reaches every query in the app.

### Find it in production

- **Traces.** Count `db.client` spans per request span. An endpoint whose span count tracks its
  response item count is an N+1, and the trace waterfall shows it as a staircase of identical
  short spans. See [`22-observability.md`](./22-observability.md).
- **`pg_stat_statements`.** Look for a query whose `calls` is orders of magnitude above the traffic
  of any endpoint that could legitimately call it once.
- **Slow-query logs will not catch it.** Each individual query is fast — that is the whole problem.
  N+1 is a *count* problem, not a *latency-per-query* problem, so alerting on slow queries misses it
  entirely.

## The six shapes

Only the first is the textbook one. Reviewers who look only for that miss most real N+1s.

### 1. Loop over rows

```ts
// ❌ 1 + N
const orders = await this.orders.findPage(query);
for (const o of orders) {
  o.items = await this.items.findByOrder(o.id);
}
```

**Special case worth naming: per-item authorization.** Non-negotiable #3 requires an ownership
check on everything the client touches, and the naive way to satisfy it on a list is a check per
row:

```ts
// ❌ correct, and an N+1
for (const row of rows) await this.acl.assertCanRead(user, row);
```

Push the check into the query instead (`WHERE tenant_id = $1`) so it costs nothing, and keep the
per-row check for single-resource reads. See [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md).

### 2. Lazy relation access

TypeORM lazy relations type a property as `Promise<T[]>`. Every access is a query, and the access
does not look like one:

```ts
// ❌ one query per order, and no `await this.repo` in sight
const rows = await Promise.all(orders.map(async (o) => ({
  id: o.id,
  itemCount: (await o.items).length,
})));
```

`Promise.all` makes this concurrent, not cheap: it is still N queries, now arriving all at once and
saturating the pool. Concurrency is not a fix for N+1.

### 3. Mapper or DTO factory

The N+1 lives in presentation code, so a reviewer reading the repository sees a clean single query:

```ts
// ❌ orders.map(OrderResponseDto.from) → one query per order
static async from(order: Order, users: UsersService) {
  const customer = await users.findById(order.customerId);
  return new OrderResponseDto(order, customer.name);
}
```

Mappers are pure functions over data already loaded. A mapper that takes a service is a design
smell — see [`04-code-quality.md`](./04-code-quality.md).

### 4. Loop of remote calls

Same shape, worse constant. A DB round trip is under a millisecond on a local network; an HTTP call
to another service is tens of milliseconds, so a 50-item list becomes seconds of pure waiting.

```ts
// ❌ 50 sequential HTTP round trips
for (const id of userIds) profiles.push(await this.http.axiosRef.get(`/users/${id}`));
```

### 5. Per-item resolver or interceptor

GraphQL `@ResolveField` runs once per parent object by design — that is exactly what DataLoader
exists for. The same shape appears in a REST interceptor that "enriches" each element of a
response array.

### 6. Per-item cache miss

A `getOrSet` cache hides an N+1 at a 95% hit rate and reveals it after a deploy, a flush, or an
eviction storm — the worst possible moment, because it coincides with cold caches everywhere else.

```ts
// ❌ N cache round trips, then N DB queries on a cold cache
for (const id of ids) results.push(await this.cache.getOrSet(`user:${id}`, () => this.users.findById(id)));
```

Use the cache's multi-get (`MGET`) and batch-load only the misses. See
[`24a-caching-patterns.md`](./24a-caching-patterns.md).

## Choosing the fix

Cardinality and pagination decide the fix, not preference.

| Situation | Fix |
|---|---|
| **Many-to-one** (order → customer), any page size | JOIN or ORM `include`/`relations`. One row per parent — no multiplication. |
| **One-to-many**, no pagination, small bounded children | JOIN is fine; the ORM de-duplicates parents for you. |
| **One-to-many** with `take`/`skip` pagination | **Two queries.** Page the parents, then batch-load children by parent id. |
| **Two or more sibling one-to-many** relations | Never one JOIN — that is a cartesian product. One query per collection, stitched in memory. |
| Same entity needed from several **independent call sites** | DataLoader, per request. |
| Data lives in **another service** | Batch endpoint (`GET /users?ids=`). No batch endpoint → bounded concurrency + cache is mitigation, not a fix. |
| N is **small and bounded** (2–3 known ids) | Leave it. See "When N+1 is fine" below. |

## JOIN — and the row explosion it causes

This is the trap that turns an N+1 fix into a correctness bug.

Joining a one-to-many relation multiplies rows. An order with 20 items joined to 3 payments
produces **60 rows for that one order**. Ask for a page of 20 orders with `LIMIT 20` applied at the
SQL level and you get 20 *joined rows* — which might be a single order. The endpoint now returns
the wrong page, and no test that seeds one child row per parent will ever catch it.

```ts
// ❌ LIMIT counts joined rows — this returns fewer than 20 orders
qb.leftJoinAndSelect('order.items', 'item').limit(20).offset(0);

// ✅ entity-aware paging — the ORM pages parent ids first, then joins
qb.leftJoinAndSelect('order.items', 'item').take(20).skip(0);
```

In TypeORM, `limit`/`offset` are raw SQL and `take`/`skip` are entity-aware — that distinction is
the entire bug. Other ORMs make different choices: some issue a separate batched query per
relation, some use lateral joins, and the behavior changes between major versions.

**Do not trust your memory of what your ORM does here.** Turn on SQL logging once, run the
endpoint, and read the queries it actually emitted. Per
[`35-source-of-truth-freshness.md`](./35-source-of-truth-freshness.md), this is exactly the class
of volatile fact worth verifying against the docs and the running code rather than recalling.

Two more things a JOIN costs you:

- **Over-fetch.** `relations: ['payments', 'memberships', 'profile']` pulls three collections you
  probably do not render. One query is not automatically better than three if it returns 50× the
  bytes.
- **Column bloat.** Every joined row repeats the full parent row. Wide parents multiply fast.

When any of these bite, the two-query batch-load below is both correct and usually faster.

## Batch-load and stitch

The pattern that works everywhere, with any ORM or none: **collect the ids, one query, build a
`Map`, stitch.** Two queries total, regardless of page size.

The repository exposes a plural finder:

```ts
async findByIds(ids: string[]): Promise<User[]> {
  if (ids.length === 0) return [];                        // never emit `IN ()`
  const { rows } = await this.pool.query(
    `SELECT id, email, name FROM users
      WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
    [[...new Set(ids)]],                                   // de-duplicate
  );
  return rows.map(toDomain);
}
```

**Many-to-one** — a `Map` from id to entity:

```ts
const orders   = await this.orders.findPage(query);                    // 1
const users    = await this.users.findByIds(orders.map(o => o.customerId));  // 2
const byId     = new Map(users.map(u => [u.id, u]));

return orders.map(o => ({ ...o, customer: byId.get(o.customerId) ?? null }));
```

**One-to-many** — a `Map` from parent id to an array:

```ts
const items    = await this.items.findByOrderIds(orders.map(o => o.id));     // 2
const byOrder  = new Map<string, OrderItem[]>();
for (const item of items) {
  const bucket = byOrder.get(item.orderId);
  if (bucket) bucket.push(item);
  else byOrder.set(item.orderId, [item]);
}

return orders.map(o => ({ ...o, items: byOrder.get(o.id) ?? [] }));
```

Three details that matter:

- **Handle the missing key.** `?? null` / `?? []` is not defensive noise. A soft-deleted or
  cross-tenant-filtered row legitimately will not come back, and `undefined` leaking into a
  response is a crash in the serializer.
- **Empty input short-circuits.** An empty id list must not reach the database as `IN ()`.
- **Chunk very large id lists.** Thousands of ids in one `ANY` degrades the query plan and can hit
  driver parameter limits. If a page can produce that many ids, the page is too big — see
  [`08-pagination-filters-sorting.md`](./08-pagination-filters-sorting.md).

## DataLoader in NestJS

Batch-loading by hand works when one service method owns the whole read. It stops working when the
same entity is needed from several independent call sites that cannot see each other — GraphQL
field resolvers, a deep call graph, or an enrichment step layered on top of a service you do not
control. DataLoader solves exactly that: it collects `.load(id)` calls made in the same tick and
issues one batched query.

### Why per-request is a security rule, not a tuning knob

DataLoader caches by key for its lifetime. A **singleton** loader would serve one tenant's cached
row to the next tenant's request — a cross-tenant read, the exact failure
[`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md) exists to prevent. The loader's
lifetime must be the request, and the batch function must still filter by the request's tenant.
Treat a loader that outlives a request as a data-leak bug, not a performance choice.

### Wiring it without the `Scope.REQUEST` cascade

The obvious wiring — a `Scope.REQUEST` provider — is the one
[`38-decorators-scopes-dynamic-modules.md`](./38-decorators-scopes-dynamic-modules.md) warns
against, because request scope cascades to every consumer and rebuilds the DI graph per request.
Resolve the conflict the way that file already recommends for per-request state: keep the loaders
in `AsyncLocalStorage` and let the registry stay a singleton.

```ts
// core/loaders/loader.registry.ts
export const LOADER_STORE = 'loader-store';

@Injectable()
export class LoaderRegistry {
  constructor(
    private readonly cls: ClsService,
    private readonly users: UsersRepository,
  ) {}

  get user(): DataLoader<string, User | null> {
    return this.scoped('user', () =>
      new DataLoader<string, User | null>(async (ids) => {
        const rows = await this.users.findByIds([...ids], this.cls.get('tenantId'));
        const byId = new Map(rows.map(r => [r.id, r]));
        return ids.map(id => byId.get(id) ?? null);   // same length, same order
      }),
    );
  }

  private scoped<T>(key: string, factory: () => T): T {
    const store = this.cls.get<Map<string, unknown>>(LOADER_STORE);
    let loader = store.get(key) as T | undefined;
    if (!loader) {
      loader = factory();
      store.set(key, loader);
    }
    return loader;
  }
}
```

The store is seeded once per request by the CLS middleware:

```ts
ClsModule.forRoot({
  global: true,
  middleware: { mount: true, setup: (cls) => cls.set(LOADER_STORE, new Map()) },
});
```

**The batch function contract is where DataLoader bugs come from:** it must return an array of the
same length as `ids`, in the same order, with a placeholder for every key that had no row. Returning
the raw query result — which drops missing rows and comes back in whatever order the DB chose —
silently maps entities onto the wrong keys. Building a `Map` and mapping over `ids` is what makes
that impossible.

### When not to reach for it

If one service method already knows every id it needs, batch-load explicitly. It is less machinery,
the query is visible at the call site, and there is no cache lifetime to get wrong.

## Cross-service N+1

Fixing this one is an API design problem, not a query problem.

```ts
// ❌ 50 round trips
for (const id of ids) profiles.push(await this.users.fetch(id));

// ✅ one round trip against a batch endpoint
const profiles = await this.users.fetchMany(ids);   // GET /v1/users?ids=a,b,c
```

If the upstream service has no batch endpoint, ask for one — it is the actual fix. Until it exists,
bound the concurrency (`p-limit`) and cache the results, and label it as mitigation so it does not
get mistaken for a solution. Unbounded `Promise.all` over a user-controlled list is its own
anti-pattern (A31 in [`30-code-review-anti-patterns.md`](./30-code-review-anti-patterns.md)) and
turns your N+1 into a thundering herd against a service someone else is on call for.

## Prevent the regression

A fixed N+1 comes back the first time someone adds a field to a mapper. A checklist item does not
survive that; a test does.

**Assert the slope, not the number.** An absolute query budget breaks every time someone
legitimately adds a query. What must never change is that the count is *independent of row count*:

```ts
it('loads an order page in a constant number of queries', async () => {
  await seedOrders(1);
  counter.reset();
  await request(app.getHttpServer()).get('/v1/orders?limit=20').expect(200);
  const withOneOrder = counter.count();

  await seedOrders(19);                                   // 20 orders now
  counter.reset();
  await request(app.getHttpServer()).get('/v1/orders?limit=20').expect(200);

  expect(counter.count()).toBe(withOneOrder);             // flat, not O(n)
});
```

This test fails loudly on the exact regression it is meant to catch and stays green through
honest refactors. For a handful of genuinely hot endpoints, add a hard budget
(`expect(counter.count()).toBeLessThanOrEqual(4)`) on top.

Seed **more than one child row per parent** in the fixtures for any endpoint that joins a
collection. One child per parent is the fixture shape that hides row explosion.

`no-await-in-loop` as a lint rule is a weak signal — sequential awaits over a queue or a cursor are
legitimate — so treat a hit as a prompt to look, not an error to silence.

## When N+1 is fine

Not every 1+N is a defect, and refactoring one that costs nothing spends review time for no return.
Leave it when **all** of these hold:

- N is small and **structurally bounded** — three known config ids, not "however many rows the
  client asked for".
- The code is off the hot path: a nightly job, an admin script, a one-off migration.
- The batched version would meaningfully complicate the query or the code.

The moment N is derived from user input or a table that grows, it is unbounded and the exemption is
gone. This is the "is it just ugly?" branch of
[`05-thinking-decision-trees.md`](./05-thinking-decision-trees.md) — note it and move on.

## Anti-patterns

- **Declaring an N+1 without counting queries.** Guessing produces both false alarms and missed ones.
- **`Promise.all` over the loop and calling it fixed.** Still N queries, now concurrent enough to
  exhaust the pool and starve every other request.
- **JOINing a paginated one-to-many with SQL-level `LIMIT`/`OFFSET`.** Returns the wrong page.
- **Fixture data with exactly one child per parent.** Guarantees row explosion goes undetected.
- **Eagerly loading every relation** (`eager: true`, or a kitchen-sink `relations` array) to avoid
  thinking about it — trades N+1 for over-fetch on every read path, including the ones that need none.
- **A singleton DataLoader.** Cross-request and cross-tenant cache bleed.
- **A batch function that returns the raw rows** instead of one entry per key in key order — misaligned
  results, silently wrong data.
- **Caching the N+1 instead of removing it.** The cold-cache path still stampedes the DB, now during
  an incident.
- **Reaching for `Scope.REQUEST` to hold loaders.** Cascades request scope through the whole
  dependency chain; use `AsyncLocalStorage`.
- **Fixing it with no test.** It returns on the next mapper change.

## Code review checklist

- [ ] Query count for the endpoint was **measured**, and is independent of the number of rows returned
- [ ] Mappers and DTO factories are pure over already-loaded data — no service or repository calls
- [ ] No lazy-relation access inside a `map`/`forEach` over a collection
- [ ] Paginated one-to-many uses entity-aware paging (`take`/`skip`) or a two-query batch-load — never SQL `LIMIT` over a joined collection
- [ ] Two or more sibling collections are loaded as separate queries, not one cartesian JOIN
- [ ] Batch finders de-duplicate ids, short-circuit on empty input, and callers handle missing keys
- [ ] DataLoader instances are per-request (CLS-backed, not `Scope.REQUEST`) and tenant-filtered in the batch function
- [ ] DataLoader batch functions return one entry per key, in key order
- [ ] Per-item authorization is pushed into the query, not run row by row
- [ ] Remote-call fan-out uses a batch endpoint; any concurrency fallback is bounded and labelled as mitigation
- [ ] A query-count test covers the endpoint, with fixtures holding more than one child per parent
- [ ] The chosen fix did not trade N+1 for over-fetch (`SELECT` only what is rendered)

## See also

- [`24-performance.md`](./24-performance.md) — where N+1 sits among performance priorities; indexes, pool sizing
- [`14-database-orm-patterns.md`](./14-database-orm-patterns.md) — repository layer, relation loading per ORM
- [`08-pagination-filters-sorting.md`](./08-pagination-filters-sorting.md) — page sizes, cursor vs offset
- [`13-database-design.md`](./13-database-design.md) — indexes on FK and join columns
- [`24a-caching-patterns.md`](./24a-caching-patterns.md) — multi-get, stampede protection on cold caches
- [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md) — tenant filtering in batch loaders
- [`38-decorators-scopes-dynamic-modules.md`](./38-decorators-scopes-dynamic-modules.md) — why `AsyncLocalStorage` over `Scope.REQUEST`
- [`22-observability.md`](./22-observability.md) — span counts and DB metrics in production
- [`23-testing.md`](./23-testing.md) — where the query-count test belongs
- [`30-code-review-anti-patterns.md`](./30-code-review-anti-patterns.md) — A26 (N+1), A27 (`SELECT *`), A31 (unbounded `Promise.all`)
- [`35-source-of-truth-freshness.md`](./35-source-of-truth-freshness.md) — verifying ORM relation-loading behavior against docs
