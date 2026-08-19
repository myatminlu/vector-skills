# PHASE 4 reference — Comment-independent bug hunt

Read the code the way the runtime does. **Ignore comments and docstrings entirely during this
pass** — they describe intent, and the gap between intent and behaviour is exactly what you are
looking for. Compare against comments only afterwards, then file every mismatch under
`COMMENT_LIE` with both texts side by side.

For each non-trivial function, mentally execute it and check the following.

## Boundaries
Empty input, single element, off-by-one, inclusive vs exclusive ranges, first and last page, zero,
negative, max int, and the four distinct states of "no value": empty string, null, undefined,
missing key.

## Null / undefined flow
Can any dereferenced value be absent on a real path? Prove it by naming the caller that can supply
it — a hypothetical null is not a finding.

## Error paths
For each external call: what happens on failure or timeout? Is state left half-written? Is a
transaction left open? Does the user see a success message for work that didn't happen?

## Async & concurrency
Unawaited promises, floating async inside loops, `forEach` with an async callback, parallel writes
to shared state, missing locks, non-atomic read-modify-write, check-then-act races, double
submission, and whether retried operations are idempotent.

## Transactions & consistency
Multi-step writes without a transaction; commit ordered wrongly relative to external side effects
(payment, email); partial rollback; missing compensation on failure.

## Resources
Unclosed connections, files, streams; listeners never removed; timers never cleared; unbounded
caches or arrays; connection-pool exhaustion under concurrency.

## Data correctness
Floats for money; timezone and DST handling; UTC vs local; string-vs-number comparison; implicit
coercion; locale-dependent sorting and casing; encoding; integer division; rounding direction;
mutation of shared or default arguments.

## Query layer
N+1 queries; missing indexes for the query shapes that actually run; unbounded `SELECT *` with no
limit; a missing tenant/owner predicate in a multi-tenant system; wrong join type; pagination that
skips or repeats rows when data changes between pages.

## Security
Injection (SQL, NoSQL, command, template); authorization checked at the wrong layer or not at all;
IDOR — an object fetched by id with no ownership check; secrets in code or logs; PII logged;
unvalidated input crossing a trust boundary; unsafe deserialization; path traversal; SSRF; missing
rate limiting on expensive or auth endpoints; absent token expiry checks; wildcard CORS; XSS via
`dangerouslySetInnerHTML`, `innerHTML`, or `v-html`.

## API contract
Response shape differing between success and error, or between branches of the same handler;
status codes that misreport what happened; nullable fields the client never handles; breaking
changes shipped without a version.

## Logic
Inverted conditions; `&&` vs `||`; De Morgan mistakes; unreachable branches; switch fallthrough;
missing `default`/`else`; early return that skips required cleanup; and copy-paste errors — the
second of two similar blocks still using the first block's variable. Look for these especially
inside the PHASE 2 duplication clusters, where near-identical code makes them nearly invisible.

## Defect-class sweep (do this for every confirmed bug)

A bug found in one place is rarely alone. The same mistake propagates through copy-paste, through
a shared idiom the team learned once, or through a helper that everyone calls the same wrong way.
Fixing only the instance you happened to read is itself a band-aid, and it leaves the user
believing the class is closed.

So after each `CONFIRMED` or `LIKELY` bug, before moving on:

1. Name the **defect class** in one line — not the symptom. "Unawaited async call inside a loop",
   "ownership check missing on a fetch-by-id", "money handled as float", "error swallowed and
   success returned".
2. Sweep the repo for that class: search the syntactic signature, then the *conceptual* siblings
   the search misses (same operation done through a different helper, same rule enforced in
   another layer). Include the parallel copies from PHASE 2 clusters and any generated code.
3. Report the class as **one finding with every location**, each marked affected / not affected /
   needs verification, with the reason. Do not file twelve near-identical bug reports; that buries
   the pattern and makes the count meaningless.
4. If a class has many instances, say what makes it recur — a missing lint rule, a helper with a
   footgun signature, an absent abstraction. That cause, not the instances, is the PHASE 7 item.

Carry the class list into PHASE 7: consolidation steps that eliminate a whole class outrank
individual fixes. And in PHASE 8, fix every instance of a class in the same step, or state
explicitly which instances are deferred and why.

## Output format

| Field | Content |
|---|---|
| ID | `BUG-01` |
| Defect class | one-line name of the pattern |
| All instances | every `file:line` in the class, with affected / not affected / unverified |
| Severity | P0 crash / data loss / security → P3 cosmetic |
| Location | `file:line-range` |
| Trigger | the exact conditions under which it fires |
| Explanation | the traced failure, step by step |
| Impact | what the user or the data actually experiences |
| Suggested fix | minimal correct change |
| Confidence | CONFIRMED / LIKELY / SUSPECTED |

Then a separate `COMMENT_LIE` section:

| Location | What the comment/name claims | What the code does | Consequence |
|---|---|---|---|

Severity is about consequences, not about how bad the code looks. A tidy function that silently
drops a payment record outranks a chaotic one that only affects a debug page.
