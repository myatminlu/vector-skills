# 24 — Performance

## TL;DR

- Correctness first. Measure before optimizing. Never premature-optimize without a profile.
- The top three wins, in order: **fix N+1 queries**, **right-size DB pool + indexes**, **don't block the event loop**.
- Cache only hot reads with clear invalidation. Never cache money, auth, or unique writes.
- Stream large payloads (CSV export, file download). Don't buffer GB into memory.
- Set timeouts on every outbound call. Never a default infinite fetch/axios.
- Profile p95 / p99, not averages. Pathological tail is what wakes you at night.

## Why it matters

Most prod "slow" issues are 2–3 specific bottlenecks, not "the language is slow." Knowing
where to look turns a two-week rewrite into a one-hour fix.

## N+1 queries (the #1 offender)

### Symptom
Loading a list of 50 orders, then triggering 50 separate queries to fetch each order's items.

### Fix
Batch-load relations in a single query (JOIN or IN) or use the ORM's eager/include:

```ts
// ❌ N+1
const orders = await this.orders.findAll();
for (const o of orders) o.items = await this.items.findByOrder(o.id);  // 50 queries

// ✅ one query
const orders = await this.orders.findAllWithItems();
// or ORM-specific:
// prisma: include: { items: true }
// typeorm: relations: ['items']
// drizzle: leftJoin(items, eq(orders.id, items.order_id))
```

Or dataloader-style batching if you're in a GraphQL/multi-call context.

## Indexes

Every list endpoint is only as fast as its indexes.

- Every FK column → index.
- Every `WHERE` column in a hot query → indexed or part of a composite.
- `ORDER BY` + `LIMIT` pattern → composite `(filter_col, sort_col)`.
- Partial indexes for soft-delete / status filters.

Measure with `EXPLAIN (ANALYZE, BUFFERS)` on realistic data. Look for Sequential Scans on
big tables or high `shared_read` blocks.

See `13-database-design.md`.

## DB connection pool

- Too few: connection starvation under load; requests queue at the pool.
- Too many: Postgres process thrash; actually slows down.
- Rule of thumb: start with `connections_per_instance = 20`; adjust based on `active / idle / waiting` metrics.
- Max total connections (sum of all app instances + worker + migration tool) must be <
  Postgres `max_connections`. Use PgBouncer / RDS Proxy for pooling if you have many instances.

## Response size

- Don't `SELECT *`. Name the columns you need.
- Don't serialize internal fields (`passwordHash`, soft-delete timestamps). Use a mapper.
- Paginate everything (see `08`).
- Compress responses (`compression()` middleware; gzip or brotli).

## Streaming large payloads

For responses > 10MB, stream instead of buffer:

```ts
@Get('export.csv')
async export(@Res() res: Response) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="export.csv"');

  const cursor = this.pool.query(new Cursor('SELECT ... FROM payments WHERE ...'));
  res.write('id,amount,status\n');
  try {
    while (true) {
      const rows = await cursor.read(1000);
      if (rows.length === 0) break;
      for (const r of rows) res.write(`${r.id},${r.amount_cents},${r.status}\n`);
    }
  } finally {
    cursor.close();
    res.end();
  }
}
```

Same pattern for S3 downloads, SSE, large JSON arrays.

## Event loop hygiene

- Don't do CPU-heavy work (hashing, large JSON parse, image processing) on the request path. Queue it (`19`).
- Don't `await` synchronously inside tight loops — parallelize with `Promise.all` if independent.
- `JSON.parse` on > 1 MB strings is slow; consider stream parser for big bodies.
- Avoid regex catastrophic backtracking on user-supplied strings. Validate length first.

## Caching

**Cache:**
- Immutable / rarely-changing data: feature flags, config, country list, pricing tiers.
- Expensive aggregates that can be slightly stale: dashboard counts, user stats.
- Read-heavy endpoints with clear TTL: trending, most-popular.

**Don't cache:**
- Auth decisions (always live).
- Money balances.
- User-unique data where stale = bug.
- Anything without a clear invalidation strategy.

### Patterns

```ts
// Simple TTL
const key = `user:${id}`;
const cached = await this.cache.get<User>(key);
if (cached) return cached;
const user = await this.repo.findById(id);
await this.cache.set(key, user, { ttl: 60 });
return user;

// Write-through invalidation
async update(id: string, patch: UpdateUserDto) {
  const user = await this.repo.update(id, patch);
  await this.cache.del(`user:${id}`);
  return user;
}
```

### Cache stampede

When a popular key expires, 1000 requests race to recompute. Mitigations:
- Single-flight (locks): one request recomputes, others wait.
- Stale-while-revalidate: return stale value + async refresh.

Use Redis for shared cache; in-memory cache per instance is fine for small static data.

## Outbound calls

Always:
- Set a **timeout** (≤ 5s for interactive; ≤ 30s for LLM; never infinite).
- Set **retries** with backoff (idempotent only).
- Set a **circuit breaker** for flaky upstreams (opens after N consecutive failures).

```ts
const res = await fetch(url, {
  signal: AbortSignal.timeout(5000),
  headers: { ... },
});
if (!res.ok) throw new UpstreamError(res.status);
```

## HTTP keep-alive + agent

- Use a shared `http.Agent` / `https.Agent` with `keepAlive: true`. Prevents TCP handshake on every call.
- Node's `fetch` / `undici` has this built-in; tune `undici.setGlobalDispatcher` for custom pools.

## Compression

```ts
import compression from 'compression';
app.use(compression({ threshold: 1024 }));
```

Compresses > 1KB responses. Saves bandwidth on JSON-heavy APIs.

## Serialization

- Avoid `class-transformer` on hot paths if possible — reflection is slow.
- Prefer plain object mapping: `PaymentResponseDto.from(row)`.
- Don't `JSON.stringify` the same object twice per response (happens with poorly-placed interceptors).

## Concurrency within a request

Parallelize independent work:

```ts
const [user, org, preferences] = await Promise.all([
  this.users.findById(id),
  this.orgs.findByUser(id),
  this.prefs.find(id),
]);
```

**Don't** serialize what can be parallel. **Do** serialize what must be sequential (auth
check → data access).

## Rate limiting

In-app rate limit saves the DB from accidental hot-loop clients; see `11`. A saturated DB
takes everyone down, not just the abuser.

## Profiling tools

- **Node built-in**: `--prof` → `node --prof-process`.
- **Clinic** (`npx clinic doctor`) — event-loop hygiene.
- **0x** — flamegraphs.
- **pg_stat_statements** in Postgres — top queries by time.
- APM: Datadog / New Relic / Grafana Tempo — production traces.

Set up monitoring of p95/p99 latency per endpoint. Alert on regressions.

## Load testing

- `k6` or `artillery` for synthetic load.
- Test **realistic** traffic: auth'd users, varied endpoints, pagination.
- Run before traffic spikes (launch, marketing event).
- Measure: latency p95/p99, throughput, DB CPU, pool utilization, error rate.

## Memory

- Node default is ~1.5 GB on 64-bit. Set `--max-old-space-size=1536` or higher on larger instances.
- Watch RSS in prod metrics. A slow leak shows as climbing RSS over hours.
- Avoid `Buffer.concat` in a loop for streaming — write to the stream directly.

## Startup time

- Lazy-load modules that aren't needed for the first request.
- Warm up caches / JIT on boot (fetch a few rows, hit a popular endpoint in a healthcheck).
- Health check should be cheap — not a full DB query; a simple `SELECT 1`.

## Anti-patterns

- Preemptive optimization before measuring.
- Caching everything "because cache is fast" — stale data bugs multiply.
- `SELECT * FROM big_table` then filtering in JS.
- Buffering a 500 MB download before streaming.
- CPU work inline with requests.
- Unbounded concurrency (`Promise.all(allOfIt)` on millions of items).
- `console.log` in hot paths — slow, unstructured.
- No timeouts on outbound calls.
- Ignoring DB pool saturation (`waiting_count > 0`).

## Code review checklist

- [ ] No N+1 — relations loaded in batch or explicit JOIN
- [ ] Every list query has matching indexes
- [ ] DB pool size set appropriately; connections released
- [ ] Responses not huge or unbounded; paginate / stream
- [ ] No `SELECT *`; only needed columns
- [ ] Timeouts on all outbound calls
- [ ] CPU-heavy work queued, not inline
- [ ] `Promise.all` for independent async, sequential for dependent
- [ ] Compression middleware enabled
- [ ] Caches have TTL + invalidation; not caching auth/money
- [ ] Profile / load-test results attached for major endpoints

## See also

- [`13-database-design.md`](./13-database-design.md) — indexes
- [`14-database-orm-patterns.md`](./14-database-orm-patterns.md) — N+1
- [`08-pagination-filters-sorting.md`](./08-pagination-filters-sorting.md) — list endpoints
- [`19-background-jobs.md`](./19-background-jobs.md) — offload heavy work
- [`22-observability.md`](./22-observability.md) — measuring performance
