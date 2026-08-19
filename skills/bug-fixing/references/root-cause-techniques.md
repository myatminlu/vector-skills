# Root Cause Techniques

Read this when the cause is not obvious after Phase 2, or when the defect falls into one of the classes below.

## Contents

1. General technique (hypothesis loop, bisection, instrumentation, differential analysis, minimization)
2. Logic & data-transformation bugs
3. State & lifecycle bugs
4. Concurrency & race conditions
5. Flaky tests & heisenbugs
6. Memory, resources & leaks
7. Performance & latency
8. Distributed systems & integrations
9. Data corruption
10. Configuration & environment ("works on my machine")
11. Build, dependency & version skew
12. Knowing when to stop

---

## 1. General technique

### The hypothesis loop

Do not "try things". Run experiments that eliminate possibilities:

1. **Observe** the concrete evidence (trace, value, timing, log).
2. **Hypothesize** a specific mechanism, stated in terms of code paths, not vibes.
3. **Predict** something that must also be true if the hypothesis holds — ideally something you have not yet looked at.
4. **Test** the prediction cheaply.
5. **Narrow** the search space based on the result, and repeat.

A hypothesis that cannot be falsified by any experiment is not a hypothesis. Keep a written list of candidate causes with their current status (open / eliminated / confirmed) so you never re-explore ground you already cleared.

### Bisection

Bisection is the highest-leverage debugging tool because it halves the search space regardless of understanding.

- **Over history**: `git bisect start <bad> <good>`, ideally with an automated test (`git bisect run <cmd>`). Beware: the first bad commit is where the behavior *appeared*, which may not be where the cause lives — a latent bug can be exposed by an unrelated change. Read the commit; do not assume it is guilty.
- **Over input**: halve the dataset/request/document until the minimal failing input remains. The minimal input usually names the cause.
- **Over configuration**: start from the working config and move settings one at a time toward the failing one.
- **Over the call chain**: assert the invariant at the midpoint of the pipeline. Correct at the midpoint → cause is downstream. Wrong at the midpoint → cause is upstream.
- **Over the environment**: same code, two machines/containers — diff versions, env vars, locale, timezone, filesystem, permissions, clock.

### Instrumentation over inspection

Reading code tells you what should happen; instrumentation tells you what does.

- Log or assert the **actual values at boundaries**, including type, length, encoding, and null-ness — not just the value's printed form (`"1"` vs `1`, `"12,50"` vs `12.50`, trailing whitespace, `NaN`, `-0`, timezone-naive datetimes).
- Prefer assertions and temporary hard failures to prints: they fail at the first violation instead of drowning you in output.
- Use the debugger for state inspection, conditional breakpoints for rare cases, and watchpoints for "who mutated this".
- Remove all temporary instrumentation before finishing — except the one durable log/metric that would have made this bug obvious, which you may keep and should mention in the report.

### Differential analysis

Compare a working case against a failing one and minimize the difference until only the cause remains. Axes to compare: input, user/tenant, timing, ordering, environment, version, data volume, permissions, locale, hardware. The narrower the surviving difference, the closer it is to the cause.

### Minimization

Reduce the reproduction until every remaining element is necessary. Each element you remove that keeps the failure alive is a whole area of the system eliminated from suspicion. A one-line reproduction is a diagnosis in disguise.

---

## 2. Logic & data-transformation bugs

Check specifically:

- Boundaries: `<` vs `<=`, first/last element, empty collection, single-element collection.
- Inverted or short-circuited conditions; operator precedence; De Morgan mistakes in refactored conditionals.
- Integer division, truncation, rounding mode, floating-point comparison, currency stored as float, accumulated rounding.
- Units and scale: seconds vs milliseconds, bytes vs KB, percent vs fraction, cents vs dollars.
- Text: encoding, normalization, case-folding, locale-dependent parsing (decimal separators!), trimming, byte vs character length.
- Time: timezone-naive vs aware, DST transitions, month arithmetic, epoch units, "today" computed on the server vs the client.
- Mutation of a shared/default argument or of a collection while iterating.
- Copy/paste errors: the wrong variable used in one branch — extremely common and invisible on a skim.

Where a transformation is wrong, look for **the same transformation implemented elsewhere**. Two implementations of one rule is a root cause in itself.

## 3. State & lifecycle bugs

Symptoms: works the first time only, works only after a refresh, wrong after a retry, wrong for the second user.

Investigate: initialization order, use-before-ready, use-after-dispose/close, singleton or module-level mutable state leaking across requests/tests, cached values with no invalidation, objects captured in closures outliving their scope, event listeners registered repeatedly, state duplicated in two places and drifting.

The root fix is usually **ownership**: exactly one component owns the state and its lifecycle; everyone else derives it. Fixing by "resetting harder" is a band-aid.

## 4. Concurrency & race conditions

Symptoms: intermittent, load-dependent, disappears under a debugger or with logging added, worse on more cores.

Look for: shared mutable state without synchronization; check-then-act (`if (!exists) create()`); non-atomic read-modify-write; assumptions about ordering of callbacks/promises/events; lock ordering (deadlock) and lock scope too small (torn state) or too large (contention); unbounded queues; connection/thread pool exhaustion; reentrancy; async work that outlives its request context; database-level lost updates and missing transaction isolation or row locking.

Reproduce by amplifying: run the operation N times in parallel, add artificial delays at the suspected interleaving point, reduce pool sizes, run with a race detector or thread sanitizer where available.

Root fixes, in order of preference: **remove sharing** (immutability, per-request instances, message passing) > **make the operation atomic** (single SQL statement, compare-and-swap, unique constraint + upsert) > **synchronize explicitly** (lock with a documented ordering, or a queue). `sleep()` and retries are not fixes.

## 5. Flaky tests & heisenbugs

A flaky test is a real defect until proven otherwise — usually in the code, sometimes in the test.

Common causes: test order dependence and shared fixtures; leaked global state; real time/clock use; timezone or locale dependence; unseeded randomness; reliance on hash/map iteration order; network or filesystem dependence; parallel tests sharing a database; waiting on a fixed sleep instead of a condition; unawaited async work.

Diagnose by: running the test alone vs in suite, running the suite in random order, repeating N times, freezing time, fixing seeds, isolating the database per worker.

If the bug vanishes when observed (a heisenbug), the observation is changing timing or optimization — suspect concurrency, uninitialized memory, or compiler/JIT behavior, and switch to techniques that don't perturb timing (post-hoc tracing, sampling, ring buffers).

## 6. Memory, resources & leaks

Symptoms: growth over time, OOM after hours, degradation that a restart fixes, file-descriptor or connection exhaustion.

Technique: take heap snapshots at intervals under steady load and diff them; identify the retaining path, not just the biggest object. For descriptors and connections, count them over time and correlate with request types.

Common causes: caches without bounds or eviction; listeners/subscriptions never removed; closures capturing large graphs; static/global registries; connections, files, cursors, or streams not closed on the error path; retained request-scoped objects in a long-lived structure; unbounded queues or batching buffers.

Root fix is deterministic ownership and release — scoped resources (`with` / `defer` / `try-with-resources` / RAII), bounded caches with an explicit policy, and unsubscription paired with subscription at the same lifecycle level.

## 7. Performance & latency

Measure first — profile, trace, and identify where time is actually spent. Never optimize by intuition.

Check: algorithmic complexity on realistic data sizes; N+1 queries; missing indexes; unnecessary serialization/deserialization; chatty network calls in a loop; unbounded result sets; lock contention; synchronous work in a hot path; cold caches; retry amplification; payload size.

Distinguish **latency** (one operation slow) from **throughput** (system saturated) from **tail latency** (p99 only — usually GC, contention, retries, or a slow dependency). Fix the dominant term; a 5% improvement to a 3% cost is noise. State the before/after numbers in the report.

## 8. Distributed systems & integrations

Assume every remote call can be slow, fail, partially succeed, arrive twice, or arrive out of order.

Investigate: timeout values (and whether they compound across layers), retry policy (and whether the operation is idempotent), error mapping (a 4xx treated as retryable, a 5xx swallowed), pagination, clock skew, at-least-once delivery causing duplicates, ordering assumptions on queues, partial writes across two systems with no compensation, contract drift after a provider upgrade, serialization differences (nulls, unknown fields, enum values).

Capture the actual request and response bytes — not the client library's interpretation of them. Most integration bugs die the moment you look at the raw payload.

Root fixes live in the **adapter layer** that owns the external system: correct timeouts, bounded retries with backoff and jitter, idempotency keys, explicit error taxonomy, and a translation to domain errors so the rest of the system never sees provider details.

## 9. Data corruption

Treat as high severity and report immediately.

1. **Contain**: determine whether corruption is ongoing; stopping the writer may take priority over the elegant fix.
2. **Characterize**: which records, from when, by what code path. Find a query that identifies affected rows precisely.
3. **Cause**: usually missing validation at ingestion, a broken migration, concurrent writes, a partial transaction, or two writers with different assumptions.
4. **Remediate**: a code fix does not repair existing bad data. Plan the backfill/repair separately, make it idempotent and reversible, verify on a copy first, and get explicit approval before running it.
5. **Prevent**: add the constraint at the level that cannot be bypassed — a database constraint beats application validation, which beats a code review convention.

## 10. Configuration & environment

"Works on my machine" is a differential problem: enumerate every difference between the two environments and bisect over them — env vars, secrets, feature flags, versions, locale, timezone, filesystem case-sensitivity, path separators, permissions, network egress, resource limits, container base image, build flags.

Root fix: make configuration **fail fast and loudly at startup** (validate required settings, types, and ranges), keep one source of truth per setting, and remove silent defaults that mask a missing value. A silent default is a bug generator.

## 11. Build, dependency & version skew

Check lockfiles, transitive version resolution, duplicate copies of a library in the tree, stale build artifacts and caches, generated code out of sync with its source, mismatched client/server schema versions, and a dependency's breaking change hidden behind a permissive version range.

Verify by reproducing with a clean checkout and a cold build/cache. If the bug disappears, the cause is in the environment/build, not the source.

## 12. Knowing when to stop

Stop diagnosing and start fixing when you can state:

- the exact mechanism, in terms of specific code and data;
- why it produces the observed symptom in every reported case;
- why it did not fail before (or why it fails only sometimes);
- what the correct behavior is, and which component owns that correctness.

If you cannot state all four, keep investigating — or escalate with what you have. Do not paper over a gap in understanding with a defensive check.
