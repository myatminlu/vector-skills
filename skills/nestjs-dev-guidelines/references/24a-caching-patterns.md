# 24a — Caching Patterns

## TL;DR

- Cache deliberately. A cache trades freshness and operational complexity for latency or cost.
- Cache reads that are frequent, expensive, and tolerate some staleness with a clear invalidation path.
- Never make a cache the sole authority for money, auth, or quota decisions.
- Keys are stable, namespaced, **versioned**, and tenant/user-scoped where the data is scoped.
- TTL + jitter + explicit invalidation + stampede protection + hit/miss/error metrics are the five non-optional knobs.
- On cache failure, **fail open** for non-authoritative reads, **fail closed** for security-relevant ones. Always with a timeout.

## Why it matters

An untuned cache turns latency wins into correctness bugs: stale authorization passes, stale
balances overcharge, stale quota lets a paying customer over-spend. Caching is cheap to add and
expensive to debug once it's in the hot path, so the decision to cache deserves more scrutiny
than the implementation.

## Decision: should I cache this?

Cache only if all of these are true:

- The value is read often relative to writes (read-heavy).
- The source is expensive (slow query, paid API, expensive compute).
- Slight staleness is acceptable, and you can state the staleness budget out loud.
- A clear owner can invalidate the entry on writes or domain events.
- You can measure hit rate and impact afterwards.

Avoid caching:

- **Authorization decisions** unless explicitly designed (short TTL, event-driven invalidation, fail closed). A cached "user can read X" survives role removal until the TTL expires — the cache becomes the authority. See [`11-security.md`](./11-security.md).
- **Quota, billing, or money** as the sole source of truth. Read the cache for the hot-path hint; verify in the durable store before granting.
- **User-specific sensitive data** without a privacy review (key separation, encryption-at-rest, eviction-on-logout).
- **Highly volatile values** where staleness breaks correctness (real-time pricing, live counters).
- **Data whose invalidation owner is unclear.** If you cannot name who deletes the key on write, do not add the cache.

## Key shape and namespacing

Keys are namespaced, versioned, and scoped to the data they cache. The version segment is your deploy-time invalidation lever — bump it when the value shape, encoding, or interpretation changes.

Pattern: `<app>:<entity>:v<n>:<scope>:<id>[:<sub>]`

```ts
// ✅ stable, namespaced, versioned, tenant-scoped
const key = `app:user-profile:v3:tenant:${tenantId}:user:${userId}`;
const listKey = `app:orders:v1:tenant:${tenantId}:status:${status}:cursor:${cursor}`;

// ❌ no namespace, no version
const key = `user_${id}`;

// ❌ tenant id missing — risks cross-tenant reads
const key = `app:user-profile:v1:user:${userId}`;
```

Rules:

- Always include tenant/org id in the key when the data is tenant-scoped (see [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md)).
- Bump the version segment (`v1` → `v2`) when the value shape changes — old entries expire on their own; consumers do not need to coordinate.
- Do not put untrusted user input directly into the key without normalization (length cap, charset, lowercase).
- Do not embed PII (email, phone, name) in keys; cache servers and slow-log files often retain key text.

## TTL and jitter

Every cache entry has a TTL. Use jitter on hot keys to avoid synchronized expiry causing a stampede.

```ts
// ✅ TTL with jitter
const baseTtl = 300; // 5 min
const jitter = Math.floor(Math.random() * 60); // 0–60s spread
await redis.set(key, value, 'EX', baseTtl + jitter);

// ❌ identical TTL on every key — synchronized expiry → stampede
await redis.set(key, value, 'EX', 300);
```

Rules of thumb:

- **Short TTL (≤ 60s)** for data that changes often or where staleness matters.
- **Medium TTL (1–10 min)** for moderately stable reads with event-driven invalidation as the primary freshness mechanism.
- **Long TTL (hours)** only for near-static data (country lists, feature config) with explicit version bumps.
- Add ±10–20% jitter on any TTL ≥ 60s when many keys share a write/expiry cohort.

## Stampede protection

A "stampede" is what happens when a hot key expires and N concurrent requests all miss the cache and hit the source at once. Two patterns to prevent it:

### Single-flight (lock-based)

One requester rebuilds the value; others wait briefly and read the freshly populated key. Best when stale data is unacceptable.

```ts
async function getWithSingleFlight<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = `${key}:lock`;
  const gotLock = await redis.set(lockKey, '1', 'EX', 10, 'NX');

  if (!gotLock) {
    // someone else is rebuilding — short backoff, then read again
    await sleep(50);
    const retry = await redis.get(key);
    if (retry) return JSON.parse(retry);
    // fall through and rebuild ourselves if still missing
  }

  try {
    const value = await load();
    const jitter = Math.floor(Math.random() * (ttl * 0.1));
    await redis.set(key, JSON.stringify(value), 'EX', ttl + jitter);
    return value;
  } finally {
    if (gotLock) await redis.del(lockKey);
  }
}
```

### Stale-while-revalidate

Serve the existing value past its soft TTL while one requester refreshes in the background. Best when latency matters more than freshness and a slight delay is acceptable on the very first miss.

```ts
type Entry<T> = { value: T; softExpiresAt: number };

async function getSWR<T>(
  key: string,
  softTtl: number,
  hardTtl: number,
  load: () => Promise<T>,
): Promise<T> {
  const raw = await redis.get(key);
  if (raw) {
    const entry: Entry<T> = JSON.parse(raw);
    if (entry.softExpiresAt < Date.now()) {
      // serve stale, refresh in background — single-flight on the lock
      void refreshInBackground(key, softTtl, hardTtl, load);
    }
    return entry.value;
  }
  return rebuildAndSet(key, softTtl, hardTtl, load);
}
```

Pick **single-flight** when stale data is unacceptable; **stale-while-revalidate** when a stale read is preferable to a latency spike.

## Invalidation strategies

The hard part of caching. Pick one and document it in the module that owns the data:

- **Write-through.** The write path updates the source then writes the cache. Best when one writer owns the entry and the key shape is predictable.
- **Write-around with event-driven invalidation.** The write path emits a domain event; a listener deletes affected keys. Best when entries are derived from multiple tables or written by multiple modules. See [`18-events.md`](./18-events.md).
- **Time-based only (TTL).** Acceptable only when the staleness budget genuinely tolerates the full TTL. Document it.
- **Versioned keys.** Bump the version segment to invalidate everything in the namespace at once — useful for shape changes, schema migrations, or "blow it all away" recovery.

Rules:

- Invalidation belongs in the module that owns the source data; cross-module raw `redis.del` recreates the coupling that modules exist to prevent (see [`03-module-design.md`](./03-module-design.md)).
- Centralize invalidation in a small `CacheInvalidator` service; do not scatter `redis.del` calls across the codebase.
- Invalidate **after** the durable write commits, not before. A pre-commit invalidation followed by a transaction rollback leaves a stale read populated by a concurrent miss.
- Delete the key, do not "set to null." A deleted key triggers a clean miss; a null sentinel needs separate handling everywhere it is read.

```ts
// ✅ invalidate after commit, in the owning module
await this.db.transaction(async (tx) => {
  await tx.users.update(userId, patch);
});
await this.cacheInvalidator.userProfile(tenantId, userId);

// ❌ invalidate inside the transaction — rollback leaves stale data live
await this.db.transaction(async (tx) => {
  await tx.users.update(userId, patch);
  await this.redis.del(`app:user-profile:v3:tenant:${tenantId}:user:${userId}`);
});
```

## Cache failure behavior

Decide and document what happens when the cache backend is degraded or down:

- **Fail open** (skip cache, hit source) for non-authoritative reads. The site stays up; the source takes more load. Acceptable when the source can absorb the miss-rate spike.
- **Fail closed** (refuse the request, return 503) for security-relevant lookups (revocation lists, deny lists, rate-limit counters where over-allowance is unsafe). Better to refuse than to silently grant.
- Always wrap cache calls with a short timeout (≤ 50ms typical for Redis on the local network) and circuit-break on repeated failures.
- Record `cache.errors` separately from `cache.misses`. They are different signals and require different alerts.

```ts
// ✅ fail open with timeout
import { metrics } from '@opentelemetry/api';
const meter = metrics.getMeter('cache');
const cacheErrors = meter.createCounter('cache.errors');

async function readCachedOpen<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const cached = await withTimeout(redis.get(key), 50);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    cacheErrors.add(1, { key_class: classOf(key), cache: 'redis' });
    log.warn({ err, key }, 'cache read failed, falling back to source');
  }
  return load();
}
```

## Negative caching

Caching "not found" results prevents a flood of identical lookups for a non-existent row.

- Use a short TTL (5–30s) — much shorter than positive entries.
- Use a distinct sentinel value (e.g. `{ __miss: true }`) so reads can distinguish "cached absent" from "cache miss."
- Be careful with negative caching for tenant-scoped lookups: a transient miss cached during a write race can shadow a real row briefly. Either skip negative caching on the write path's affected keys, or invalidate negatives on the corresponding create event.

## Layering

Pick the cache layer to match the data:

- **In-memory (per-instance LRU).** Good for tiny, stable, non-tenant-specific data (parsed config, country lists, compiled regex). Inconsistent across instances; do not use for anything that must agree fleet-wide.
- **Redis (shared).** The default for anything that benefits from cross-instance hits or needs explicit invalidation. Set a memory limit and an eviction policy (`allkeys-lru` or `volatile-lru`); otherwise a runaway producer evicts unrelated keys.
- **CDN / HTTP cache.** Good for public, cacheable GET responses. Use `Cache-Control` and `Vary` correctly; never cache responses that depend on `Authorization` without `Vary: Authorization` or a `private` cache directive.

Combine layers when warranted: small, very hot, near-static reads in process memory; everything else in Redis.

## Metrics to record

Without metrics, you cannot tell whether the cache is helping or hurting. Record at minimum (OTel meter API as in [`22-observability.md`](./22-observability.md)):

- `cache.hits` counter, labels `{ cache, key_class }` — successful hits.
- `cache.misses` counter, labels `{ cache, key_class }` — clean misses.
- `cache.errors` counter, labels `{ cache, key_class }` — backend failure (timeout, connection refused).
- `cache.miss.duration_ms` histogram — latency of the source-of-truth fallback path. A slow miss path is the real risk.
- Hit ratio per `key_class` derived in the dashboard. A class with < 50% hit rate is probably not worth caching.

Tag by **key class** (e.g. `user-profile`, `orders-list`), **not** raw key, or you will explode metric cardinality (see [`22-observability.md`](./22-observability.md) → Cardinality discipline).

## Anti-patterns

- **Caching everything because cache is fast.** Stale-data bugs multiply with surface area.
- **Cache as authority for auth, quota, or billing.** A revoked role survives the TTL; a paid customer over-spends; a denied user gets in.
- **No tenant scope in keys.** One bad key build leaks data across tenants — and is invisible until somebody notices.
- **No invalidation plan.** "We'll add invalidation later" becomes a year of stale reads with no clear owner.
- **No version segment.** Shape changes leave consumers reading old encodings until the TTL drains; cannot be force-invalidated.
- **Identical TTL on every entry.** Synchronized expiry → stampede on every multiple of the TTL.
- **No timeout on cache calls.** A degraded Redis becomes a request-path latency spike.
- **Catch-and-ignore on cache errors with no metric.** The cache has been down for a week and nobody noticed.
- **`get` then `set` without single-flight on a hot key.** First miss after deploy or eviction crushes the source.
- **Invalidation inside a transaction.** Rollback leaves the deletion applied and the source unchanged → stale-read race.
- **Embedding email, phone, or other PII in keys.** Cache logs and slow-query traces leak identifiers.

## Code review checklist

- [ ] Cache has a measured or clearly stated benefit, with a stated staleness budget.
- [ ] Key shape includes namespace, version, and tenant/user scope where needed.
- [ ] No PII or untrusted raw input in keys.
- [ ] TTL is set; jitter applied if the key is hot or shares a write cohort.
- [ ] Invalidation strategy (write-through, event-driven, version bump, TTL-only) is named, not implied, and lives in the owning module.
- [ ] Stampede protection (single-flight or stale-while-revalidate) on hot keys.
- [ ] Cache call has a timeout; failure mode (open/closed) is explicit.
- [ ] Hit / miss / error metrics recorded, tagged by key class (not raw key).
- [ ] Cache is not the sole authority for auth, quota, billing, or money.
- [ ] Invalidation runs **after** the durable write commits, not inside the transaction.

## See also

- [`24-performance.md`](./24-performance.md) — performance trade-offs and measurement
- [`11-security.md`](./11-security.md) — authorization caching caveats
- [`18-events.md`](./18-events.md) — event-driven invalidation
- [`22-observability.md`](./22-observability.md) — cache metrics and traces
- [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md) — tenant-scoped key shapes
- [`30-code-review-anti-patterns.md`](./30-code-review-anti-patterns.md) — anti-patterns in context
- [`31-rules-rationale-examples.md`](./31-rules-rationale-examples.md) — R42: cache invalidation defined before the cache is added
