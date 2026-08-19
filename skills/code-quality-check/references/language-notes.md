# Language-Specific Traps

Consult the sections matching the code under review. These are the defects that reviewers most
often miss because they are idiomatic-looking. Verify against the version and configuration in
*this* repo — language and framework behavior changes between versions.

---

## Python

- Mutable default arguments (`def f(x, acc=[])`) shared across calls.
- Late binding in closures inside loops; comprehension variable capture.
- `except Exception` swallowing `KeyError`/`AttributeError` that indicate real bugs; bare
  `except:` also catching `KeyboardInterrupt`/`SystemExit`.
- `is` vs `==` for values; identity comparisons on small ints/strings that work by accident.
- Floats for money; `round()` half-even surprises; `Decimal` mixed with `float`.
- `datetime.now()` naive vs `datetime.now(timezone.utc)`; naive/aware comparison errors.
- Shared module-level state under threads or ASGI workers; `requests.Session` reused unsafely.
- `asyncio`: blocking calls (DB drivers, `time.sleep`, `requests`) inside coroutines;
  un-awaited coroutines; `asyncio.create_task` results dropped with exceptions never observed.
- `subprocess` with `shell=True` and interpolated input; missing `timeout=`.
- `pickle`/`yaml.load` on untrusted data.
- Broad `__init__.py` re-exports hiding circular imports and import-time side effects.
- Type hints that lie because nothing type-checks them in CI.
- Generators consumed twice (silently empty on the second pass).

## JavaScript / TypeScript

- Floating promises: `async` calls without `await` or `.catch`; unhandled rejections.
- `Promise.all` where a single rejection abandons in-flight work; `allSettled` misuse.
- `==` coercion, `NaN` comparisons, `0`/`""` falsiness swallowing valid values.
- `Array.sort()` default lexicographic sort on numbers.
- Mutation of props/state/objects passed by reference; shallow spread assumed deep.
- `useEffect` dependency arrays: missing deps (stale closures) or object deps causing loops;
  cleanup missing for subscriptions and timers.
- `any`, `as` casts, and non-null `!` assertions hiding real nullability; `strict` disabled in
  `tsconfig`.
- Types lie at runtime: API responses cast to an interface with no validation.
- `innerHTML`/`dangerouslySetInnerHTML` with untrusted content.
- `JSON.parse` without try/catch on external input.
- Node: unhandled `error` events on streams; missing `try/finally` for handles; `process.env`
  read with no validation; CommonJS/ESM interop surprises.
- Timezone/locale-dependent `Date` parsing; `new Date("2026-01-01")` UTC vs local.

## Java / Kotlin

- `NullPointerException` paths; `Optional` unwrapped with `get()`.
- Checked exceptions caught and logged, then execution continues on invalid state.
- `equals`/`hashCode` inconsistency; mutable keys in maps.
- Non-thread-safe classes (`SimpleDateFormat`, `HashMap`) shared across threads; `static`
  mutable state.
- Resource leaks without try-with-resources; streams not closed.
- JPA/Hibernate: N+1 lazy loading, `@Transactional` on private/self-invoked methods (no proxy),
  transactions spanning external calls, `LazyInitializationException`.
- Kotlin: `!!`, platform types from Java interop, `runBlocking` inside coroutines, `GlobalScope`
  leaks.

## Go

- Ignored `error` returns (`_ =`) and errors logged but not returned.
- `defer` inside a loop accumulating until function exit; `defer` after the error check that
  returns early.
- Loop-variable capture in goroutines (pre-1.22 semantics — check the Go version).
- Goroutine leaks: no context cancellation, unbuffered channel with no reader.
- Nil map writes; nil interface vs nil pointer comparison surprises.
- Slice aliasing after `append`; unintended shared backing arrays.
- Missing `context` propagation and timeouts on outbound calls.
- `sync.Mutex` copied by value; data races that only `-race` reveals.

## Rust

- `unwrap()`/`expect()` on paths that can realistically fail.
- `panic!` in library code where a `Result` belongs.
- Blocking calls inside async executors; `.await` held across a `Mutex` guard.
- `unsafe` blocks without a documented invariant argument.
- Integer overflow behavior differing between debug and release builds.
- Excessive `clone()` masking a lifetime design problem (a design finding, not a perf nit).

## C#

- `async void` outside event handlers; `.Result`/`.Wait()` deadlocks.
- Missing `ConfigureAwait(false)` in libraries with a synchronization context.
- `IDisposable` not disposed; `HttpClient` created per request (socket exhaustion).
- EF Core: lazy loading N+1, tracking queries in read paths, `SaveChanges` in a loop.
- Nullable reference types disabled or overridden with `!`.

## PHP / Ruby

- PHP: loose `==` comparisons, unserialize on untrusted input, `extract()`, SQL built by
  concatenation, `@` error suppression.
- Ruby: monkey-patching core classes, `rescue => e` swallowing `StandardError`, N+1 in
  ActiveRecord views, mass assignment without strong parameters, `send` with user input.

## SQL & data layer

- String-built queries anywhere near user input.
- Missing index for the filter/join/sort columns actually used; index on a low-cardinality
  column assumed helpful.
- `SELECT *` in application code (breaks on schema change, pulls blobs).
- Implicit type conversion in a join defeating an index.
- Transactions held open across network calls; wrong isolation for the invariant.
- `DELETE`/`UPDATE` without `WHERE` in scripts; destructive migration with no down path.
- Migrations that lock large tables; backfills without batching or throttling.
- `NULL` semantics in `NOT IN`, aggregates, and unique constraints.
- Timezone storage inconsistency (`timestamp` vs `timestamptz`).

## Shell scripts

- Missing `set -euo pipefail`; unquoted variable expansions; `rm -rf "$DIR"/` where `DIR` may be
  empty.
- Parsing `ls`; word splitting on filenames with spaces.
- Secrets passed as command-line arguments (visible in process lists).
- No idempotency in scripts intended to be re-run.

## Infrastructure as code / containers

- Containers running as root; `latest` image tags; secrets baked into layers or `ENV`.
- Missing resource limits, health checks, and graceful-shutdown handling (`SIGTERM`).
- Security groups / firewall rules open to `0.0.0.0/0`.
- Terraform: state and secrets committed, `force_destroy` on data stores, no plan review in CI.
- CI: credentials exposed to fork-triggered workflows, unpinned third-party actions.
