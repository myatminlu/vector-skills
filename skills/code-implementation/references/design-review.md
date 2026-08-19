# Design review — thinking like an architect

**Contents**
1. What architectural thinking means in practice
2. Responsibility placement
3. Boundaries and contracts
4. State and data ownership
5. Coupling and cohesion
6. Failure modes and resilience
7. Concurrency, ordering, and idempotency
8. Data lifecycle and migrations
9. Performance as a design property
10. Observability and operability
11. Security by design
12. Evaluating alternatives and recording the decision
13. Refactoring without breaking the system
14. Design smells to flag

---

## 1. What architectural thinking means in practice

Architectural thinking is not about drawing boxes. It is the habit of asking, before writing code:

- **Where does this belong?** — placement of responsibility.
- **What else does this touch?** — second- and third-order effects.
- **What happens when it fails, repeats, or scales?** — behavior outside the happy path.
- **What will this cost the next person?** — the maintenance and comprehension bill.

A local optimum that damages the system is a bad change even when it works today. Conversely, an ambitious redesign nobody asked for is also a bad change. The target is the simplest structure that makes correct behavior easy and incorrect behavior hard.

Systems thinking specifically means: a change is not finished at the edge of your diff. It propagates into latency, load, failure modes, deployment, data, and the people who operate the system. Trace those before you commit to a design.

---

## 2. Responsibility placement

For each piece of behavior you are adding, ask which component genuinely owns it:

- Which component owns the **data** this behavior depends on? Behavior tends to belong with its data.
- Which component owns the **decision**? Policy decisions belong at the layer that has the business context; mechanism belongs below.
- Would placing it here force this layer to know something it should not — a UI concern in the data layer, a persistence concern in the domain layer, a business rule in a controller?
- If two components could host it, the one with fewer inbound dependencies is usually the better host.

**The convenience trap:** placing logic where it is easiest to reach (a controller, a shared `utils` module, a "manager" class) is the single most common origin of architectural rot. Cost of resisting it: minutes. Cost of accepting it: years.

Signals of misplacement: a function that needs many unrelated imports; a module that changes for many unrelated reasons; business rules duplicated across handlers because no domain layer owns them.

---

## 3. Boundaries and contracts

Identify every boundary your change crosses — module, process, network, transaction, trust — and treat each as a contract:

- **Make it explicit.** Types, schemas, enums, and validation at the boundary beat conventions in prose.
- **Specify the failure shape,** not just the success shape. What errors can cross? What does the caller do with each?
- **Specify units, precision, timezone, encoding, nullability, ordering, and pagination.** Most cross-boundary bugs live in exactly these six.
- **Compatibility:** additive changes are usually safe; removals, renames, type changes, and semantic changes are not. For anything with external consumers, plan expand → migrate → contract rather than a hard switch.
- **Trust boundaries:** everything arriving from outside is untrusted and must be validated once, at entry. Internal code should not re-validate; that scattering hides responsibility.

Before changing a shared contract, enumerate the consumers. If you cannot enumerate them, treat the contract as frozen and ask.

---

## 4. State and data ownership

- Every fact should have **exactly one owner** — one place that decides it and one place that stores it. Everything else derives or reads.
- **Prefer deriving over storing.** Stored derived values require invalidation, and invalidation is where staleness bugs come from. Store derived data only for a measured reason, and then define exactly when it is recomputed.
- **Caches are a design decision, not an optimization detail.** Specify what invalidates each cached value, its TTL, and what a stale read does to correctness.
- **Minimize mutable shared state.** Prefer passing values explicitly over module-level globals, singletons, and ambient context — these are invisible dependencies that break tests and concurrency.
- **Watch for split-brain:** the same fact held in two systems (database + cache, service A + service B, backend + client) that can disagree. Decide which one wins and how they reconcile.

---

## 5. Coupling and cohesion

- **High cohesion:** a module should do one thing, and its parts should change together for the same reason. A module that changes for unrelated reasons should be split.
- **Low coupling:** depend on the narrowest interface that does the job. Depend on behavior, not on internals.
- **Direction matters:** dependencies should point from volatile toward stable, and from outer layers toward the domain core — never from the core outward. A cycle between modules is a design defect; break it by extracting the shared concept or inverting the dependency.
- **Beware hidden coupling:** shared database tables between services, shared mutable globals, shared file paths, implicit ordering requirements ("call init first"), and shared serialized formats. These bind components together without any visible import.

**Do not add abstraction preemptively.** An interface with one implementation, a base class with one subclass, or a config option with one value adds indirection without buying flexibility. Wait until there are two real cases; the second case teaches you where the seam actually goes.

---

## 6. Failure modes and resilience

For each external interaction (network, disk, database, queue, third party), decide explicitly:

- **Timeout:** every remote call needs one. No timeout means unbounded hangs and thread exhaustion under stress.
- **Retry:** only for transient failures, only when the operation is idempotent, with backoff and a cap. Retrying a non-idempotent write duplicates data.
- **Fallback:** degrade to a reduced result, a cached value, or a clear error — chosen deliberately, not by accident of exception handling.
- **Partial failure:** what state remains if the process dies mid-sequence? Prefer operations that are safe to resume. Where a transaction cannot span the work, define the compensating action.
- **Blast containment:** a failure in a non-critical dependency should not take down the critical path.

Ask "what if this returns slowly, returns wrong data, or returns nothing at all?" for every dependency you add. An added dependency is added failure surface — that is part of the cost of the design.

---

## 7. Concurrency, ordering, and idempotency

- Assume any handler can run **twice, concurrently, and out of order**. Message deliveries duplicate; users double-click; retries fire.
- **Idempotency:** for anything that writes, define the key that makes a repeat harmless (natural key, request ID, unique constraint). "It probably won't happen twice" is not a design.
- **Check-then-act is a race.** Prefer atomic operations, conditional updates, unique constraints, or explicit locks over read-then-write sequences.
- **Transaction scope:** keep transactions short and never hold one across a network call. Know what happens to your changes if the transaction rolls back after an external side effect has already occurred.
- **Ordering assumptions must be explicit** — if step B requires step A's result, that requirement should be structural, not implied by scheduling luck.

---

## 8. Data lifecycle and migrations

- **Schema changes are one-way doors in practice.** Plan them as expand → backfill → switch reads → stop writes → contract, so each step is independently deployable and reversible.
- **Deployment order matters:** code and schema deploy at different moments. The intermediate state — new code with old schema, or old code with new schema — must work.
- **Backfills must be resumable and rate-limited**, and must not lock hot tables.
- **Define retention and deletion.** Data that accumulates without a lifecycle becomes a cost and a liability.
- **Never leave a migration half-done.** A permanently half-migrated system is exactly the duplicated-service problem that this whole discipline exists to prevent: two shapes, two code paths, forever.

---

## 9. Performance as a design property

- **Measure before optimizing.** Without a measurement, optimization is guessing that adds complexity.
- Look for the structural problems first, since they dominate micro-optimizations: N+1 queries, unbounded result sets, work inside loops that could be batched, synchronous calls that could be parallel, repeated recomputation, and missing indexes on filtered columns.
- **Know the growth curve.** Behavior that is fine at 100 records may be fatal at 10 million. Ask what the realistic upper bound is.
- **Bound everything:** page sizes, batch sizes, queue depths, memory buffers, concurrency limits. Unbounded is a failure waiting for a busy day.
- Optimize for the common case, but ensure the rare case degrades gracefully rather than catastrophically.

---

## 10. Observability and operability

A change is not complete if nobody can tell whether it is working:

- **Log at decision points and failures,** with enough context (identifiers, not just messages) to diagnose without a debugger. Never log secrets or personal data.
- **Errors should carry cause and context** when wrapped, so the stack tells a story rather than a location.
- **Expose the health of what you added** if it is long-running: counts, durations, failure rates.
- **Fail fast and loudly at startup** for invalid configuration, rather than failing subtly at request time.
- Consider the operator's questions: how do they know it broke, how do they find out why, and how do they turn it off or roll it back?

---

## 11. Security by design

- **Validate and sanitize untrusted input at the boundary**; use parameterized queries and safe serializers rather than string construction.
- **Enforce authorization at the layer that owns the resource**, not only in the UI or the route.
- **Never hardcode secrets**; use the project's existing configuration/secret mechanism, and never log them.
- **Apply least privilege** to credentials, tokens, database roles, and file permissions.
- **Do not weaken existing security controls** to make something work. If a control blocks a legitimate need, raise it explicitly rather than routing around it.

---

## 12. Evaluating alternatives and recording the decision

Always consider at least two viable approaches. For each:

- What it costs to build, and what it costs to maintain.
- What it makes easy later, and what it makes hard later.
- How it fails, and how it is rolled back.
- Whether it fits the codebase's existing patterns, or introduces a second pattern.

Record the decision compactly:

```
Decision: <what you chose>
Context:  <constraint that drove it>
Alternatives considered: <option B> — rejected because <reason>
Consequences: <what this makes easier / harder later>
Reversibility: <easy | costly | one-way door>
```

Weight caution by reversibility: for easily reversible choices, choose and move; for one-way doors (schemas, public APIs, data deletion, vendor lock-in), slow down and confirm with the user.

---

## 13. Refactoring without breaking the system

- **Separate the steps.** Refactor with behavior unchanged, verify, then change behavior. Never in one commit.
- **Lean on tests as the safety net.** If the area has no tests, add characterization tests capturing current behavior *before* restructuring.
- **Move in small, complete steps** that each leave the system building and passing.
- **Finish the migration.** Update every caller, remove the old path, delete the dead code. An unfinished refactor leaves two ways to do one thing — worse than not starting.
- **Preserve intentional behavior you do not understand.** Odd-looking code is often an incident fix. Understand it before removing it; if you remove it, say so explicitly in the report.

---

## 14. Design smells to flag

Report these when you see them, even outside your mandate:

- Two modules or services that own the same responsibility or the same data.
- A module that everything imports and that imports everything (a "god" module or `utils` dumping ground).
- Business rules restated in several layers, drifting apart.
- Layer violations: SQL in the UI layer, HTTP concerns in the domain, rendering in the repository.
- Cyclic dependencies between modules.
- Long parameter lists and boolean flags that switch behavior — usually two functions wearing one name.
- Deep nesting and functions that need scrolling to understand.
- Abstractions with exactly one implementation, or configuration with exactly one value.
- Catch-all error handling at the top that hides everything beneath.
- Manual steps required to make the system correct ("remember to also run X").

For each smell, note the location, the concrete risk it creates, and the smallest change that would resolve it. That list turns a vague "the codebase is messy" into an actionable plan.
