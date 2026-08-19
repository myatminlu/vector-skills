# Code quality — standards while writing

**Contents**
1. The economics behind these rules
2. Writing less code
3. Naming
4. Functions and modules
5. Control flow and readability
6. Error handling
7. Validation and boundaries
8. Types and data modeling
9. Dependencies
10. Comments and documentation
11. Testing
12. Security basics
13. Performance basics
14. Deleting code

---

## 1. The economics behind these rules

Code is read far more often than it is written, and every line is a permanent liability: it must be understood, tested, migrated, and eventually deleted by someone. So the goal is not elegance for its own sake — it is minimizing the total cost of the system over time. Every rule below follows from that.

Two consequences worth internalizing:
- **The best change is often a deletion or a unification**, not an addition.
- **Consistency beats personal preference.** A codebase with one mediocre pattern is easier to work in than one with five excellent competing patterns.

---

## 2. Writing less code

Before adding anything, ask in order:
1. Does this already exist here? (search first — see `investigation.md` §6)
2. Can an existing function be extended with a small, honest parameter?
3. Is this requirement real and current, or imagined for the future?
4. Can it be solved by deleting or simplifying something instead?

Do not add: options nobody sets, abstractions with one implementation, wrappers that only forward, defensive code for conditions that cannot occur, error handling for errors that cannot be raised, or "flexibility" for requirements that do not exist. Each of these looks harmless and costs forever.

Also avoid the opposite failure — copy-pasting a block and tweaking it. Two nearly identical blocks will drift, and the drift is a future bug. Extract the shared behavior and express the difference as a parameter that has a meaningful name.

---

## 3. Naming

Names are the primary documentation and the cheapest correctness tool available.

- Name for **domain meaning**, not implementation: `overdueInvoices`, not `filteredList2`.
- **Say the unit and the frame:** `timeoutMs`, `priceInCents`, `createdAtUtc`. Unit ambiguity is a leading cause of cross-boundary bugs.
- **Booleans read as assertions:** `isActive`, `hasPermission`, `shouldRetry`. Avoid negated names (`notDisabled`) — double negatives in conditions are where inverted-logic bugs hide.
- **Functions are verbs; values are nouns.** A function named like a noun usually hides a side effect, and a function with a name that hides side effects is a trap.
- **Be consistent across the codebase.** One concept, one word. If the codebase says `customer`, do not introduce `client` for the same thing.
- **Length should match scope.** A loop index can be short; a module-level export cannot.
- Rename when a name has become a lie — but do it as its own step, not mixed into a behavior change.

---

## 4. Functions and modules

- **One job per function.** If you need "and" to describe it, split it.
- **Separate decisions from effects.** Pure logic that computes is easy to test; the side effects should live in a thin layer around it. This one habit does more for testability than any framework.
- **Keep parameter lists short.** Many parameters usually means a missing concept — group them into a meaningful object. Boolean flag parameters usually mean two functions in a trench coat.
- **Return meaningful values, not sentinels** that callers must remember to check. Prefer explicit result types, exceptions, or option types according to the language's convention.
- **Avoid hidden side effects:** a function that appears to read should not write, mutate its arguments, or touch global state.
- **Module size follows cohesion, not line count.** A module should have a single reason to change; when you can describe it only with a list, split it.

---

## 5. Control flow and readability

- **Guard clauses first.** Handle invalid and edge cases early and return, so the main path stays at the lowest indentation level.
- **Keep nesting shallow.** More than two or three levels usually indicates a missing function or an unmodeled state.
- **Make exhaustiveness explicit** over enums and unions — every case handled, and a compile-time error (or a loud runtime error) when a new case appears.
- **No magic values.** Named constants explain intent and prevent one of two occurrences from being updated.
- **Do not be clever.** Dense one-liners, exotic operator tricks, and implicit conversions cost more in reading time than they save in typing time.
- **Prefer immutability** where the language makes it practical; reassignment across a long function is a common source of "how did this value change?" bugs.

---

## 6. Error handling

- **Handle an error only where you can make a decision about it.** Everywhere else, let it propagate. Premature catching destroys context.
- **Never swallow.** `catch { log; continue }` turns a loud failure into silent wrong behavior — this is the single most damaging pattern in production code.
- **Preserve the cause** when wrapping, and add context that the caller lacks (which record, which endpoint, which operation).
- **Distinguish expected outcomes from exceptional failures.** "Not found" for a lookup is usually a normal result to model in the return type; a database connection failure is exceptional.
- **Error messages should help the person debugging:** what was attempted, with which identifiers, and what constraint failed. Never include secrets or personal data.
- **Clean up reliably** — release connections, files, locks, and temp resources with the language's scoped mechanism (`with`, `defer`, `try/finally`, RAII) rather than by hand on each path.
- **Fail fast on programmer errors** (invalid state, broken invariants) instead of limping forward with corrupt state.

---

## 7. Validation and boundaries

- **Validate once, at the entry boundary**, then trust internally. Scattering the same checks through every layer means no layer owns correctness — and it hides where the bad data actually entered.
- Validate **shape, type, range, and business rules**, and reject with a clear message naming the offending field.
- **Normalize at the boundary** — trimming, case folding, timezone conversion, unit conversion, encoding. Do it once, in one place, so internal code deals with a single canonical form.
- Internal defensive checks (assertions on invariants) are for catching programmer error loudly, not for routing around bad data quietly.

---

## 8. Types and data modeling

- **Make invalid states unrepresentable.** A constrained type, enum, or constructor that rejects bad input removes a whole class of checks and bugs.
- **Model the domain, not the transport.** Do not let raw API/database shapes leak through the whole system; translate at the boundary.
- **Be explicit about optionality.** "Can this be null, and what does null mean here?" should be answerable from the type, not from tribal knowledge.
- **Avoid primitive obsession** for concepts that carry rules (money, identifiers, email addresses). A wrapper type prevents mixing up two strings that mean different things.
- **Do not use one flexible bag** (untyped map/dict/JSON blob) where a defined structure exists — it moves errors from compile time to production.

---

## 9. Dependencies

- **Prefer the standard library and what the project already uses.** A new dependency brings security, licensing, upgrade, and supply-chain costs forever.
- Before adding one, ask: how much code does it actually save? Is it maintained? What is its transitive footprint? Could a small internal function do it?
- **Isolate third-party APIs behind a thin internal interface** when they are used widely, so a future replacement touches one file.
- **Pin versions** per the project's convention and never silently upgrade unrelated dependencies inside a feature change.

---

## 10. Comments and documentation

- **Comment the "why", never the "what".** The code already states what it does; a restating comment will rot and then mislead.
- Good subjects for comments: non-obvious constraints, the reason for a surprising choice, links to the incident/ticket behind an odd line, invariants a reader must preserve, and known limitations.
- **Update or delete comments you invalidate.** A stale comment is worse than none because it will be believed.
- **Document public interfaces** with contract-level information: parameters, units, error behavior, side effects, thread-safety.
- **TODO comments need an owner and a reason**, or they are noise. Prefer a tracked task.

---

## 11. Testing

- **Every bug fix gets a regression test** that fails without the fix. Without it, nothing prevents the bug's return.
- **Test behavior, not implementation.** Tests coupled to internals break on legitimate refactors and train people to ignore failures.
- **Cover the edges:** empty, single, many, maximum; null/missing; boundary values; duplicates; wrong types; unicode; timezone changes; concurrent access where relevant.
- **Test failure paths deliberately** — timeouts, rejections, partial writes. Untested error handling is usually wrong error handling.
- **Keep tests deterministic:** no real clock, no real network, no shared mutable fixtures, no ordering dependence between tests. Inject time and randomness.
- **Make failure messages informative** so a red test explains itself without a debugger.
- **Never weaken a test to make it pass.** If a test is genuinely wrong, fix it as an explicit, explained change.
- Match the project's existing test framework, structure, and naming rather than introducing a second style.

---

## 12. Security basics

- Parameterized queries; never build SQL/commands/paths by string concatenation from input.
- Escape output according to its sink (HTML, shell, SQL, log, filename).
- Authenticate and authorize at the layer owning the resource; check ownership on every object access, not only on the list endpoint.
- Secrets come from configuration, never from source; never logged, never in error messages, never in test fixtures committed to the repository.
- Do not roll your own cryptography, token handling, or password hashing — use the platform's vetted implementation.
- Treat file paths, redirect targets, and deserialized payloads from users as hostile.

---

## 13. Performance basics

- Measure first; optimize the measured hot path, not the imagined one.
- Watch for the classic structural costs: N+1 queries, unbounded fetches, repeated work in loops, missing indexes on filtered/sorted columns, serial calls that could be batched or parallel.
- Bound everything: pages, batches, buffers, concurrency, retries.
- Beware accidental quadratic behavior (nested scans over growing collections) — it is invisible in tests with ten records.
- Do not sacrifice clarity for micro-optimizations that no measurement demanded.

---

## 14. Deleting code

Deletion is part of implementation, not cleanup for later:

- When you replace a path, **remove the old one** and its tests, flags, config keys, and documentation.
- When a flag has been fully rolled out, delete the flag and the dead branch.
- When you find code with no callers, verify it truly has none (including dynamic/string-based references and external consumers), then remove it and say so in the report.
- Keeping "just in case" copies is how a codebase ends up with two of everything. Version control is the safety net — that is its job.
