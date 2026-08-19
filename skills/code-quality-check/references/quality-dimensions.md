# Quality Dimensions — Review Checklists

Use these during Phase 2. Each dimension lists what to look for, how to look for it, and the
failure it is designed to catch. Work them in order: correctness first, cosmetics last.

A checklist item is not a finding. An item points you at code; the code either proves a problem
or it does not. Report only what the code proves.

## Contents

1. [Correctness & logic](#1-correctness--logic)
2. [Error handling & failure modes](#2-error-handling--failure-modes)
3. [Security & input trust](#3-security--input-trust)
4. [Data & state integrity](#4-data--state-integrity)
5. [Interfaces & contracts](#5-interfaces--contracts)
6. [Duplication & dead code](#6-duplication--dead-code)
7. [Structure & complexity](#7-structure--complexity)
8. [Naming & readability](#8-naming--readability)
9. [Tests](#9-tests)
10. [Performance & resources](#10-performance--resources)
11. [Dependencies & configuration](#11-dependencies--configuration)
12. [Observability & operability](#12-observability--operability)

---

## 1. Correctness & logic

You cannot judge correctness without knowing the intended behavior. Get it from the user, the
tests, or the caller — never from the comments.

**Check:**

- Boundary conditions: empty collection, single element, exactly-at-limit, one past the limit,
  zero, negative, maximum integer, empty string, whitespace-only string.
- Off-by-one in slicing, ranges, pagination, retries, and index math.
- Null / `None` / `undefined` / `nil` reachability: for each dereference, can the value be
  absent on any real path?
- Comparison and equality: reference vs value equality, floating-point equality, case and
  Unicode normalization, locale-dependent comparison, `==` vs `===`, mixed-type comparison.
- Type coercion and silent conversion, especially string↔number and truthiness of `0`, `""`,
  `[]`, `{}`.
- Every branch reachable? Any condition that is always true/false? Any `else` that silently
  does nothing when it should be impossible — is it actually impossible?
- Early returns that skip required cleanup, commits, or unlocks.
- Loop invariants: can the loop run zero times when it must run once, or fail to terminate?
- Time and dates: timezone assumptions, UTC vs local, DST, leap years, month arithmetic,
  clock-skew assumptions, monotonic vs wall clock for durations.
- Money and precision: floats used for currency, rounding mode, division order, unit ambiguity
  (cents vs dollars) crossing a boundary.
- Ordering assumptions: dict/map iteration order, unordered API results assumed sorted,
  concurrent completion assumed sequential.
- Copy semantics: mutation of a shared object, aliasing a caller's list, shallow vs deep copy,
  default mutable arguments.
- Regex correctness: anchoring, greedy matching, dot-matches-newline, unescaped metacharacters,
  catastrophic backtracking.
- Does the code do what the *test names* claim? Do the tests actually assert it? (See §9.)

**Method:** pick the three most complex conditionals in scope and hand-execute them with
adversarial inputs. Write the input, the expected result, and what the code actually produces.
If the code is right, you have spent five minutes; if it is wrong, you have found the finding
that justified the whole review.

---

## 2. Error handling & failure modes

Most reviews only walk happy paths. Most production incidents live here. Spend
disproportionate attention on this dimension.

**Check:**

- **Swallowed errors:** `catch {}`, `except: pass`, `except Exception: log.debug(...)`,
  `if err != nil { }`, `.catch(() => {})`, discarded `Result`/`error` returns. Each one hides a
  failure from the operator. Grep for these first.
- **Over-broad catches** that also capture programming errors (`AttributeError`, `TypeError`,
  `KeyError`, `NullPointerException`) and turn a crash into silent wrong behavior.
- **Errors used as control flow** for expected conditions, or exceptions thrown across
  architectural layers without translation.
- **Lost context:** re-raising without the cause, `raise new Error(e.message)`, stack trace
  dropped, error message that does not say which record/user/request failed.
- **Partial failure:** multi-step operations with no rollback — three writes where the second
  can fail leaves inconsistent state. Is it a transaction? Is it idempotent on retry?
- **Retries:** retrying non-idempotent operations, no backoff, no jitter, no cap, retrying
  4xx-class errors that will never succeed, retry loops that mask a real bug (also a band-aid,
  see the band-aid reference).
- **Timeouts:** any network, DB, subprocess, or lock call with no timeout is an outage waiting
  for a slow dependency. Check defaults — many client libraries default to infinite.
- **Resource cleanup on the error path:** files, sockets, cursors, locks, temp files, threads.
  Is cleanup in `finally` / `defer` / `with` / RAII, or only on the success path?
- **Error surfaces to the user:** internal detail leaking (stack traces, SQL, paths) versus a
  message so vague nobody can act on it. Both are findings.
- **Degradation:** when a non-critical dependency is down, does the whole request fail? Should
  it?
- **Fail-open vs fail-closed** in auth, feature gating, and validation. A validator that
  returns `true` on an internal exception is a security hole.

**Method:** for each external call in scope, name the failure and answer: what does the caller
see, what is the user's experience, what does the on-call engineer see, and is state consistent
afterward? Any of those you cannot answer is the finding.

---

## 3. Security & input trust

Assume every input crossing a trust boundary is hostile: HTTP params, headers, cookies, file
uploads, filenames, queue messages, webhook payloads, DB rows written by another service, env
vars, CLI args, and any AI/LLM output.

**Check:**

- **Injection:** SQL string concatenation or f-strings in queries; shell commands built from
  input (`shell=True`, `exec`, backticks); template injection; XPath/LDAP/NoSQL injection;
  unsafe deserialization (`pickle`, `yaml.load`, Java native, `eval`, `Function()`).
- **Output encoding:** XSS via `innerHTML`, `dangerouslySetInnerHTML`, unescaped template
  output, autoescape disabled, unsanitized markdown/HTML rendering.
- **Path traversal:** user-controlled path segments joined into filesystem paths without
  normalization + containment check; archive extraction without path validation.
- **SSRF:** user-supplied URLs fetched server-side without an allowlist; redirects followed
  into internal networks.
- **AuthN/AuthZ:** is authorization checked on *every* entry point, including the new one? Is
  it enforced at the data layer or only in the UI? Object-level checks (can user A load user
  B's record by ID?) — the most common real-world hole. Role checks that trust a client-sent
  role.
- **Secrets:** hardcoded keys, tokens, passwords, connection strings; secrets in logs, error
  messages, or committed config; secrets in URLs (they land in access logs).
- **Crypto:** homemade crypto, MD5/SHA1 for passwords or signatures, ECB mode, static IVs,
  `random` instead of a CSPRNG for tokens, non-constant-time comparison of secrets, disabled
  certificate verification (`verify=False`, `rejectUnauthorized: false`).
- **Session & cookies:** missing `HttpOnly`/`Secure`/`SameSite`, no rotation on privilege
  change, tokens with no expiry, JWT with `alg: none` or unverified signature.
- **Rate limiting & resource abuse:** unbounded uploads, unbounded pagination, expensive
  endpoints with no limits, zip bombs, regex DoS.
- **Mass assignment:** binding request bodies straight onto ORM models, letting a caller set
  `is_admin`.
- **Dependency and supply chain:** unpinned versions, install-time scripts, known-vulnerable
  versions, typosquat-looking package names.
- **Logging hygiene:** PII, tokens, card numbers, full request bodies written to logs.

Report security findings with the attacker's concrete path, not a category name. "SQL injection
in the search endpoint" is a category; "an unauthenticated caller can pass `q=' OR 1=1--` at
`api/search.py:88` and read every row of `users`" is a finding.

---

## 4. Data & state integrity

**Check:**

- **Transactions:** correct boundaries, isolation level appropriate to the invariant, no
  network calls inside a transaction, no lock held across an external request.
- **Race conditions:** check-then-act (`if not exists: create`), read-modify-write without
  optimistic locking or atomic operations, concurrent updates to the same row/key/file.
- **Idempotency:** can this be safely re-run after a partial failure or a duplicate webhook /
  retried message? Duplicate delivery is normal in queues, not exceptional.
- **Shared mutable state:** module-level caches and globals in multi-threaded/async contexts,
  request state stored on singletons, thread-unsafe clients shared across threads.
- **Async/await hazards:** un-awaited promises/coroutines, fire-and-forget tasks with no error
  handler, blocking calls inside an event loop, `Promise.all` where one rejection abandons the
  rest mid-flight.
- **Cache correctness:** invalidation on write, stampede on expiry, caching per-user data under
  a global key (a serious data-leak class), cached negative results, unbounded cache growth.
- **Migrations:** backwards compatibility during deploy (old code + new schema runs
  simultaneously), non-reversible destructive changes, long-locking DDL on large tables,
  backfills without batching.
- **Data validation at the boundary** versus deep inside, allowing invalid records to be
  persisted and to poison later reads.
- **Deletion semantics:** soft vs hard delete consistency, orphaned rows, cascade behavior,
  restore paths.

---

## 5. Interfaces & contracts

**Check:**

- **Backward compatibility** of any changed public API, event schema, DB schema, config key, or
  CLI flag. Who consumes it? Are they in this repo? Did the review scope include them?
- **Layering violations:** HTTP objects in the domain layer, SQL in a controller, UI concerns
  in a service, a low-level module importing a high-level one. Note the direction of the
  dependency arrow, not just its existence.
- **Coupling:** reaching into another module's internals, depending on private fields,
  duplicated knowledge of a data format in two places that must change together.
- **Cohesion:** does this module have one reason to change, or five?
- **Interface size:** parameters that are only used to be passed further down; boolean flags
  that select behavior (usually two functions wearing a trench coat); "manager"/"util"/"helper"
  modules that accumulate unrelated functions.
- **Nullable and optional in signatures:** does the type say what the code actually accepts and
  returns, including error cases?
- **Versioning and deprecation:** is there a path for consumers, or a silent break?

---

## 6. Duplication & dead code

Summary here; full method in `duplication-wiring-and-bandaids.md`.

**Check:**

- Copy-pasted blocks with small divergences (the divergence is usually where the bug is — one
  copy got the fix, the others did not).
- The same *business rule* expressed in several places (validation in the form, the API, and
  the DB constraint, with different rules).
- Two implementations of the same capability: `legacy_*` and new, `v1` and `v2`, both live.
- Utility functions reimplemented because nobody searched first.
- Constants and magic values repeated instead of shared.
- Dead code: unreferenced functions, unreachable branches, commented-out blocks, feature-flagged
  paths permanently off, config keys nothing reads.

Never call something dead without checking dynamic dispatch, reflection, string-based
registration, DI containers, serialization hooks, template references, build-time generation,
and consumers outside the repo.

---

## 7. Structure & complexity

Complexity is a cost paid by every future reader. Judge it by whether a competent engineer new
to the file could safely change it.

**Check:**

- Function length and single responsibility. A long function is not automatically a finding —
  a long function that mixes parsing, business rules, I/O, and formatting is.
- Nesting depth beyond ~3 levels; guard clauses and early returns usually flatten it.
- Cyclomatic complexity hotspots: many branches × many state variables = untestable.
- Boolean parameters, long parameter lists, primitive obsession (passing four strings where a
  typed value object belongs).
- God objects/modules; files that must be opened for every change.
- Speculative generality: abstractions, plugin points, config switches, and generic parameters
  with exactly one implementation and no current second caller. This is a real cost, report it.
- Premature abstraction versus missing abstraction — say which one this is and why.
- Hidden side effects: functions that look like getters but mutate, write files, or call the
  network.
- Global/module state used for control flow.
- Testability: can this logic be tested without a network, a clock, a filesystem, or a
  container? If not, that is a structural finding, not a testing finding.

---

## 8. Naming & readability

**Check:**

- Names that lie: `get_user()` that creates, `is_valid()` that mutates, `count` holding a list,
  `temp` holding the only result.
- Inconsistent vocabulary for one concept (`customer` / `client` / `account` / `user` for the
  same entity) — a real source of bugs, not merely aesthetics.
- Unexplained magic numbers and strings.
- Comments that explain *what* (redundant) versus *why* (valuable). Missing "why" on a
  non-obvious workaround is a finding; so is a comment contradicting the code.
- Dense one-liners, nested ternaries, clever bit-twiddling with no explanation.
- Public API documentation: does it state parameters, return, errors raised, and side effects?
- Formatting and style: if a formatter/linter can enforce it, do **not** file per-instance
  findings. File one finding: "formatter not enforced in CI."

---

## 9. Tests

Read the assertions. Coverage percentage tells you which lines executed, not whether anything
was verified.

**Check:**

- **Assertion quality:** tests that only assert "no exception was raised", assert on mocks
  rather than behavior, or assert a snapshot nobody has read.
- **Missing negative tests:** invalid input, permission denied, dependency failure, timeout,
  empty result, concurrent access.
- **Over-mocking:** everything mocked means the test verifies the mock configuration, not the
  system. Especially bad when the mock's behavior does not match the real dependency.
- **Coupling to implementation:** tests that break on any refactor because they assert internal
  call sequences.
- **Flakiness sources:** real sleeps, real network, real clock, unseeded randomness, ordering
  dependence, shared fixtures mutated across tests.
- **Are the new/changed behaviors tested at all?** For a bug fix: is there a test that fails
  without the fix? If not, the bug can return silently — always a finding.
- **Test data:** production data or real credentials in fixtures; PII in test files.
- **Speed and isolation:** does the suite give fast, deterministic feedback, or will people
  start ignoring it?

---

## 10. Performance & resources

Do not guess. State the input scale at which the problem bites, or label the finding
`SUSPECTED` and say what measurement would confirm it.

**Check:**

- Queries inside loops (N+1) — the single most common real performance defect. Look for ORM
  lazy loads in a loop or template.
- Missing indexes for the query's filter/sort columns; queries with no `LIMIT` over a growing
  table; `SELECT *` pulling large blobs.
- Loading unbounded result sets into memory; reading whole files that could be streamed.
- Accidentally quadratic work: nested loops over the same collection, repeated `list.index()`
  or `in` on a list where a set/dict belongs, string concatenation in a loop.
- Repeated expensive work that could be hoisted or memoized (recompilation of regexes, repeated
  config parsing, re-establishing connections).
- Leaks: unclosed connections/files/sockets, growing caches and dicts with no eviction,
  listeners/subscriptions never removed, thread/task accumulation.
- Blocking the event loop or holding the GIL/lock during I/O.
- Chatty external calls that could be batched; missing connection pooling.
- Frontend specifics: bundle bloat, re-render storms, unmemoized expensive computation in
  render, images and lists without virtualization.

---

## 11. Dependencies & configuration

**Check:**

- New dependencies: is it necessary, maintained, appropriately licensed, and reasonably sized
  for what it does? Could three lines of stdlib replace it?
- Version pinning and lockfiles; ranges that allow a silent major bump.
- Known-vulnerable versions; abandoned packages.
- Duplicate libraries doing the same job (two HTTP clients, two date libraries) — a consistency
  and size finding.
- Configuration: defaults safe for production? Required config validated at startup or
  discovered on first use at 3am? Environment-specific values hardcoded? Feature flags with no
  removal plan?
- Secrets handling: sourced from a secret manager or environment, never committed.
- Build reproducibility: does the same commit produce the same artifact?
- Container/infra files in scope: running as root, `latest` tags, secrets in image layers,
  ports exposed unnecessarily, missing resource limits.

---

## 12. Observability & operability

The test: can an engineer who has never seen this code diagnose a production failure from the
telemetry alone?

**Check:**

- Logs at the right level, with correlation/request IDs and the identifiers needed to find the
  affected record — and without PII or secrets.
- Log noise: per-iteration logging in hot loops, or nothing at all across a critical path.
- Metrics for the things operators need: error rate, latency, queue depth, saturation of the
  new resource.
- Health checks that actually check dependencies rather than returning 200 unconditionally.
- Alertability: would a silent failure here ever surface? Silent data corruption with no signal
  is a Blocker-class finding even when the code "works".
- Runbook-relevant behavior documented where operators will look, not only in code comments.
- Graceful shutdown: in-flight requests drained, consumers acked correctly, no data loss on
  SIGTERM.
