# Investigation — reading the codebase before changing it

**Contents**
1. Why this phase pays for itself
2. Orienting in an unfamiliar repository
3. Finding the real entry point
4. Tracing the call chain
5. Mapping dependencies and callers
6. Hunting duplication
7. Reading tests as specification
8. Reading history
9. Detecting band-aid code
10. What to record

---

## 1. Why this phase pays for itself

Most bad changes are not caused by bad coding. They are caused by a correct-looking change made against a wrong mental model of the system. Investigation replaces assumption with evidence. The output is not code — it is a map with file:line evidence you can cite.

The rule that governs everything here: **the code is the truth.** Comments, docstrings, README files, ticket descriptions, function names, type names, and log messages are all claims made by a human at some past moment. Treat each as a hypothesis to verify, never as a fact. When a comment contradicts the code, you have found a defect worth reporting — and possibly the very bug you were sent to fix.

---

## 2. Orienting in an unfamiliar repository

Spend a few minutes building a top-level picture before diving in:

- **Structure:** list the top two levels of directories. Identify what is source, what is tests, what is generated, what is vendored, what is dead.
- **Build and run:** read the package/build manifest and the scripts it defines (`package.json`, `pyproject.toml`, `go.mod`, `Makefile`, `Dockerfile`, CI config). These reveal how the project actually builds, tests, and lints — use these commands later rather than inventing your own.
- **Configuration surface:** find where config and environment variables are read. This shows what varies between environments and where hidden behavior switches live.
- **Boundaries:** find where the system talks to the outside world — HTTP routes, message consumers, cron jobs, CLI commands, database access layers, third-party clients. These are the seams where most bugs and most contracts live.
- **Conventions:** look at two or three recently modified files to learn the house style: layering, error handling, logging, naming, test structure.

Note when generated code, vendored code, or lockfiles are present — never hand-edit them; change the source they are generated from.

---

## 3. Finding the real entry point

Never start reading from the file you were pointed at. Start from the point where the behavior actually begins:

- User-facing bug → the route handler, UI event handler, or CLI command.
- Background failure → the job scheduler, queue consumer, or event subscriber.
- Data wrong in storage → every writer of that field, not just the one you know about.
- Startup/config problem → the bootstrapping sequence and dependency wiring.

Effective search moves, in rough order of reliability:
1. Search for a **literal string** the user saw (error message, label, log line). Literals are unambiguous.
2. Search for the **route path, event name, queue name, table or collection name, or config key**.
3. Search for the **symbol** (function, class, constant) and inspect each hit's context.
4. Fall back to fuzzy keyword search only when the above fail — and treat results as leads, not answers.

If a search returns dozens of hits, narrow by directory or file type rather than skimming; skimming is how the wrong call site gets read.

---

## 4. Tracing the call chain

Follow the path hop by hop, opening each file:

```
POST /orders            → api/routes/orders.py:42
  → OrderService.create → services/order_service.py:88
    → validate_items    → services/validation.py:15
    → PricingClient.get → clients/pricing.py:120   [network call, 3s timeout, no retry]
    → repo.save         → repositories/order_repo.py:56  [transaction opens here]
```

At each hop, record concretely:
- What it receives and what it returns, including the shape of errors.
- What state it reads and what state it mutates.
- Whether it crosses a boundary — process, network, transaction, thread, or trust boundary. Boundary crossings are where failure modes live.
- Any branch that could take a different path (feature flags, environment checks, early returns, silent fallbacks).

Watch specifically for **indirection that hides the real implementation**: dependency injection containers, dynamic dispatch, decorators/middleware, inheritance overrides, monkey-patching, reflection, plugin registries, and generated clients. When indirection appears, find the concrete implementation that is actually bound at runtime — the abstract definition tells you nothing about behavior.

---

## 5. Mapping dependencies and callers

For every symbol you intend to modify, answer both directions:

- **Downstream (what it depends on):** which modules, services, tables, and external systems it touches. This bounds what your change can break beneath it.
- **Upstream (who depends on it):** every caller. Search for the symbol name, and also for indirect uses — string-based dispatch, serialized names, API routes, event payloads, database column names, and config keys. These do not show up in symbol searches and are where silent breakage happens.

Then classify each dependency as **internal** (you may change it) or **contract** (you may not change it unilaterally): public APIs, persisted data shapes, event/message schemas, file formats, CLI flags, and anything consumed by another team, another deployment, or a stored client.

If you cannot enumerate the callers, you cannot assess the blast radius — say so rather than proceeding blind.

---

## 6. Hunting duplication

Do this *before* writing anything new. Duplication is not only copy-pasted lines; look for all four kinds:

1. **Code duplication** — the same logic written twice, often with small drift between the copies. The drift is usually a bug.
2. **Feature duplication** — two different code paths that deliver the same user-visible capability (two exporters, two auth flows, two notification senders).
3. **Service/module duplication** — two components that own the same responsibility or the same data, often introduced by a migration that was never finished.
4. **Knowledge duplication** — the same rule, threshold, format, or mapping restated in several places. When it changes, someone will update three of the four.

Search techniques that find duplication that name-based search misses:
- Search for distinctive **string literals**, magic numbers, regexes, and error messages.
- Search for the **domain noun** ("invoice", "refund") across directories, not just the current module.
- Search for the **same external call** (endpoint URL, table name, SDK method) — two callers of the same external resource often means two implementations of the same capability.
- Look for suspicious sibling names: `utils.py` and `helpers.py`, `formatV2` next to `format`, `NewClient` next to `Client`, `service/` next to `services/`.

For each near-duplicate found, record: location, how much of the job it does, why it was probably created, and whether the right move is *reuse*, *extend*, or *unify and delete*. Two mechanisms coexisting is always a finding, even if you do not fix it now.

---

## 7. Reading tests as specification

Tests describe behavior that someone actually cared about, with real inputs and real expectations. Read them before deciding what "correct" means:

- Find the test file for each module you will change and read the cases.
- Note edge cases the tests encode — they often reveal requirements no document mentions.
- Note what is *not* tested: untested branches are where regressions land, and missing tests are a finding in their own right.
- Beware tests that assert implementation details (mock call counts, internal ordering) rather than behavior — they will break on a correct refactor, and that breakage is not evidence you were wrong.
- A test that is skipped, commented out, or marked as expected-failure is a signal about a known unresolved problem. Investigate it.

---

## 8. Reading history

When available, version history answers "why is it like this?" faster than reading more code:

- Look at recent commits touching the file to learn who changed what and why.
- For a suspicious line, find the commit that introduced it and read its message and diff. A line that looks arbitrary is often a deliberate fix for a real incident — deleting it will resurrect that incident.
- Repeated fixes clustered in one area indicate an unresolved root cause, not bad luck. That cluster is exactly what a refactor should target.

---

## 9. Detecting band-aid code

While reading, actively flag symptom-level patches. Common signatures:

- Broad `try/catch` (or bare `except`) that swallows errors, logs, and continues.
- Null/undefined checks defending against a value the producer should never have produced.
- `sleep`, retry loops, or arbitrary timeouts that exist to dodge an ordering or race problem.
- Special cases keyed to one customer, one ID, one file name, or one environment.
- Values recomputed or re-fetched "to be safe" because ownership of the state is unclear.
- Comments like "temporary", "hack", "workaround", "do not remove", "fix later", TODO/FIXME.
- Flags that were added to disable something once and never removed.
- Duplicated validation at several layers because no layer is trusted.

Record each with location, what symptom it suppresses, and your hypothesis about the real cause. This list is a large part of the value you deliver on a cleanup effort — even for items you are not fixing now.

---

## 10. What to record

Keep the investigation output compact and evidence-based:

```
Entry point:      <file:line>
Call chain:       <file:line → file:line → …>
Files read:       <list>
Contracts:        <public interfaces / schemas / events that must not break>
Callers affected: <list with file:line>
Existing code that already does this: <list, with % overlap>
Band-aids / smells observed: <list with file:line>
Comment-vs-code contradictions: <list with file:line>
Unknowns:         <what you could not determine and why>
```

Every claim carries a `file:line`. A claim without evidence is a guess, and guesses must be labeled as such.
