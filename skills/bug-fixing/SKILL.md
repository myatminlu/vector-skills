---
name: bug-fixing
description: A disciplined, architect-level workflow for diagnosing and fixing bugs in an existing codebase — reproduce, read the real code before touching anything, find the true root cause, design the minimal correct fix at the right layer, verify it, and hunt for clones of the same defect. Use this skill for ANY defect work — crashes, exceptions, wrong output, failing or flaky tests, regressions, race conditions, memory leaks, performance degradation, data corruption, integration failures, works-locally-but-not-in-prod problems, or any request phrased as fix, debug, broken, not working, error, or why does X happen. Use it even when the bug looks trivial or the user has already proposed a fix — especially then, because the proposed fix is usually a symptom-level patch. Do NOT use for greenfield feature work with no defect involved.
---

# Bug Fixing

A bug is evidence. It tells you that the system's real behavior and your model of the system disagree. The job is not to make the symptom disappear — it is to find *why* the disagreement exists, fix the cause at the correct layer, and leave the system more coherent than you found it.

Speed comes from understanding, not from typing. A patch shipped in ten minutes that hides a cause costs weeks later.

---

## Non-negotiable principles

1. **Read before you write.** Never edit a file you have not read in full (or, for very large files, read the complete region plus every caller and callee involved). Never guess an API, a field name, or a call signature — open it and look.
2. **Never trust comments, docstrings, variable names, README files, commit messages, or tickets as fact.** They describe intent, often stale intent. Only the executing code and observed behavior are evidence. When a comment contradicts the code, that contradiction is itself a finding worth reporting.
3. **Reproduce before you diagnose. Diagnose before you fix.** A fix without reproduction is a guess. A fix without a stated causal chain is a coincidence.
4. **Fix root causes, not symptoms.** If you cannot write one sentence of the form "The defect occurs because X, therefore the correct place to fix it is Y", you have not finished diagnosing.
5. **Think like an architect, act like a surgeon.** Reason about the whole system: layers, boundaries, contracts, invariants, data flow, failure modes, blast radius. Then make the smallest correct incision that addresses the cause.
6. **Write no unnecessary code.** No speculative abstraction, no new helper that duplicates an existing one, no defensive scaffolding "just in case", no reformatting or drive-by refactoring mixed into a fix. Less code is fewer future bugs.
7. **Verify by evidence.** A fix is unproven until a test that failed before now passes, and the previously passing behavior still passes.
8. **One bug is rarely alone.** The same defect pattern usually exists in sibling code. Search for clones and report them.
9. **Stop and ask when the correct fix would change a contract, delete data, alter security behavior, or exceed the scope you were given.** Escalating is cheaper than an unwanted change.

---

## The workflow

Follow the phases in order. Do not jump to Phase 4 because the fix "looks obvious" — the obvious fix is the symptom fix in most cases. State which phase you are in as you work, so the reasoning is auditable.

### Phase 0 — Frame the problem

Establish, in writing, before anything else:

- **Observed behavior**: exactly what happens (error text, stack trace, wrong value, latency, corrupted row).
- **Expected behavior**: what should happen, and *what is the source of that expectation* — a spec, a test, a contract, a caller's assumption, or just someone's opinion. If the expectation is only an opinion, the "bug" may be a requirements question; surface that.
- **Scope and blast radius**: who is affected, how often, is data being corrupted, is it security-relevant.
- **Environment and version**: where it reproduces and where it does not. Differences between those two are your first and best clue.
- **Recent changes**: what changed near the failure — commits, config, dependency upgrades, data shape, traffic.

If key facts are missing and cannot be discovered from the code or logs, ask. Do not invent them.

### Phase 1 — Reproduce deterministically

A bug you cannot reproduce is a bug you cannot prove you fixed.

- Find the smallest reliable reproduction: a failing unit test is best, then an integration test, then a script, then manual steps.
- Prefer to encode the reproduction as an **automated failing test** immediately. That test becomes the definition of done.
- For intermittent bugs, quantify: how often, under what concurrency, load, ordering, timezone, locale, data size. Intermittency is information — it usually points to shared mutable state, ordering assumptions, time, randomness, network, or resource exhaustion.
- If you cannot reproduce it, say so explicitly and switch to evidence-gathering (logs, traces, metrics, core dumps, a targeted instrumentation patch). Never ship a speculative fix while claiming it is verified.

### Phase 2 — Read the code and map the territory

Before forming a theory, build an accurate model of the relevant subsystem.

- Start from the failure point (stack frame, log line, failing assertion) and walk **outward in both directions**: who calls this, and what does it call.
- Trace the **data flow** of the offending value: where is it created, transformed, validated, stored, serialized, cached, defaulted. Bugs usually live at a transformation or a boundary, not where they surface.
- Identify the **layer boundaries** it crosses: UI → API → service → domain → persistence → external system. Note the contract at each boundary (types, nullability, units, encoding, ordering, idempotency, error semantics).
- Note the **invariants** the code assumes but does not enforce ("this list is never empty", "this ID always exists", "this runs single-threaded"). Broken invariants are root causes.
- Check **git history** for the region: `git log -p`, `git blame`. When was the behavior introduced, and what was the intent of that change? `git bisect` when the regression window is unclear.
- Inventory **existing utilities** you might reuse — validators, mappers, error types, retry helpers. Knowing what exists is how you avoid writing redundant code in Phase 5.

Read the actual implementation of any dependency behavior you rely on. If the fix depends on how a library handles an edge case, verify it rather than assuming.

### Phase 3 — Find the true root cause

Work as a hypothesis loop, not a guessing loop: **observe → hypothesize → predict → test → narrow**. Each experiment should eliminate possibilities, not merely confirm the hope you started with.

Apply the **Five Whys**, stopping only when the next "why" leaves the codebase:

> The page shows a blank total.
> → Why? `total` is `NaN`.
> → Why? A price arrived as the string `"12,50"`.
> → Why? The import parser splits CSV without honoring the locale decimal separator.
> → Why? The parser was written for one locale and no validation exists at the ingestion boundary.
> → **Root cause**: the ingestion boundary accepts unvalidated, locale-ambiguous input into the domain model.

Notice that fixing `NaN` in the view (`total || 0`) would have "fixed" the report and silently corrupted every downstream number. That is the difference this phase exists to catch.

Useful techniques — see `references/root-cause-techniques.md` for details and per-class playbooks (concurrency, memory, performance, distributed systems, data corruption, flaky tests, heisenbugs):

- **Differential analysis**: compare a working case against a failing case and minimize the difference.
- **Bisection**: over commits, over input, over configuration, over the call chain.
- **Instrument, don't stare**: add temporary logging/assertions at boundaries to observe the actual value, then remove them.
- **Reverse the trace**: from the corrupted value backwards to its last correct state.
- **Question the platform last**: assume your code before the framework, the framework before the OS — but be willing to reach the end of that ladder when evidence points there.

**Classify the cause** — the class determines the correct fix location:

| Class | Typical true cause | Fix normally belongs at |
|---|---|---|
| Input/validation | Unvalidated data crossing a boundary | The boundary (parser, DTO, API edge) |
| Contract mismatch | Caller and callee disagree on types, units, nullability, errors | The contract + both sides aligned |
| State/lifecycle | Object used before init, after dispose, stale cache | State ownership / lifecycle management |
| Concurrency | Unsynchronized shared mutable state, ordering assumption | Design: isolation, immutability, or explicit synchronization |
| Logic | Off-by-one, wrong operator, inverted condition, missed case | The algorithm, plus a test for the missed case |
| Configuration/env | Divergent config, missing var, version skew | Config management + fail-fast validation at startup |
| Resource | Leak, exhaustion, unbounded growth | Ownership/cleanup discipline (scoped, deterministic release) |
| Integration | Retry/timeout/idempotency/error-mapping assumptions | The adapter layer that owns that external system |
| Design | The architecture makes the bug expressible at all | A structural change — propose it, scope it, ask before doing it |

Write the causal chain down. It goes in the final report.

### Phase 4 — Design the fix like an architect

Before writing code, answer these:

1. **Where does this fix belong?** The correct layer is where the invariant is owned — usually the deepest layer that can enforce it, not the shallowest layer where the symptom appeared. Fixing upward from the cause is patching; fixing at the cause is engineering.
2. **What is the minimal change that removes the cause?** Prefer, in order: delete the wrong thing > correct the existing logic > extend the existing abstraction > introduce a new one. A new abstraction requires justification in the report.
3. **Can the class of bug be made impossible instead of merely absent?** Making an illegal state unrepresentable (stronger types, non-nullable, enum instead of string, single source of truth, immutability, parse-don't-validate) is worth slightly more code — but only when the cause genuinely warrants it. State the trade-off; don't smuggle a redesign into a bug fix.
4. **What is the blast radius?** List every caller, subclass, serialized form, stored record, cached value, and external consumer affected. Check for backward-compatibility and migration needs. If persisted data is already corrupted by this bug, a code fix alone is incomplete — a data remediation plan is part of the fix.
5. **What could this fix break?** Name the risks and how the verification plan covers them.
6. **Does the fix create or remove duplication?** If the same logic exists in three places, fixing one is a future regression. Either fix all clones or consolidate — and say which you did and why.
7. **Is there a simpler alternative you rejected?** Note it. Considering two designs and choosing one is engineering; producing one and defending it is not.

If more than one reasonable option exists and they differ materially in risk or scope, present the options with trade-offs before implementing.

### Phase 5 — Implement

- Change only what the diagnosis requires. **No unrelated refactors, renames, formatting sweeps, dependency bumps, or "while I'm here" improvements.** They obscure review and mix risk profiles. Note them separately as follow-up suggestions.
- Match the surrounding conventions — naming, error handling, layering, logging, testing style. A fix that reads as foreign is a maintenance cost even when correct.
- Handle errors meaningfully: fail fast and loudly at boundaries you own; never swallow an exception to make a symptom vanish; never log-and-continue where the state is now invalid.
- Keep the change **atomic and reviewable**: one logical fix per commit, with a message stating the cause and the fix, not just the symptom.
- Delete code the fix makes dead — dead code is a future bug's hiding place.
- Comment only *why*, never *what*. If the code needs a comment to explain what it does, restructure it instead.
- Never weaken or delete a test to make it pass. If a test is wrong, prove it is wrong and fix it deliberately, saying so.
- Never disable a security control, validation, or type check as a means of fixing a bug.

### Phase 6 — Verify

- The reproduction test from Phase 1 must **fail before** the change and **pass after**. Demonstrate both, don't assert both.
- Add tests for the **cause class**, not just the reported input: boundary values, empty/null, unicode, large input, wrong ordering, concurrent access, error paths — whichever apply to the class you identified.
- Run the full relevant test suite; check you have not traded one failure for another.
- Re-examine the blast-radius list from Phase 4 and confirm each item behaves correctly.
- For concurrency/performance/memory fixes, verify with the appropriate measurement (stress iterations, profiler, memory snapshot), not by inspection.
- **Hunt clones**: grep/search for the same pattern elsewhere in the codebase. Report every instance found, fixed or not.
- Confirm the symptom is gone *for the original reason you predicted*. If it disappeared for a reason you cannot explain, you have not finished.

### Phase 7 — Report

Always end with a structured report. Full templates (RCA report, commit message, PR description) are in `references/report-templates.md`. Minimum content:

```
## Symptom
What was observed, and how it was reproduced.

## Root cause
The causal chain, ending at the true cause. File:line references.

## Why the obvious fix was wrong
(If applicable) the symptom-level fix considered and why it was rejected.

## The fix
What changed, at which layer, and why that layer is correct.
Files touched, with a one-line rationale each.

## Verification
Test that failed before / passes now. Other tests run. Risks checked.

## Blast radius & compatibility
Callers, data, APIs affected. Migration needed? Yes/no.

## Related findings (not fixed)
Clones of this defect elsewhere, band-aid patches, dead code,
contradicted comments, duplicated services encountered.
Each with location and suggested action — reported, not silently fixed.
```

---

## Symptom patch vs. root fix

The most common failure mode of an AI agent is producing a plausible patch that suppresses the evidence. Learn these by shape — full catalogue with code examples in `references/anti-patterns.md`.

| Band-aid (do not do) | What it hides | Root fix direction |
|---|---|---|
| `try { … } catch { /* ignore */ }` | A real failure path | Handle or propagate; fix why it throws |
| `value ?? 0`, `value \|\| ""` at the point of use | Bad data entering earlier | Validate/convert at the boundary that produced it |
| Null check added where the crash happened | Why null got there | Fix the producer; make nullability explicit in the type |
| `sleep(100)` / retry to fix flakiness | A race or missing synchronization | Explicit ordering, awaiting the real condition |
| Tweaking a constant until the test passes | Wrong algorithm or wrong test | Derive the correct value; fix the logic |
| `if (id === 12345)` special case | A general rule modeled incorrectly | Model the general rule |
| Catching and re-fetching to dodge stale cache | Broken invalidation | Fix cache ownership/invalidation |
| Skipping/deleting the failing test | The defect itself | Fix the defect |
| Adding a feature flag to route around it | Unresolved cause on the old path | Fix the path; flags are for rollout, not for hiding bugs |
| Wrapping in a new layer that corrects the output | Wrongness upstream | Correct it upstream and delete the wrapper |

**When a quick mitigation is legitimate**: an active production incident, where stopping the bleeding beats being right. In that case do all of the following, explicitly: (1) label it as a temporary mitigation in the report and in the code, (2) keep it as small and reversible as possible, (3) file/state the follow-up for the real fix with the causal chain already documented, (4) do not close the investigation. A mitigation without a documented follow-up is just a band-aid with better manners.

---

## Systems thinking checklist

Ask these while diagnosing — they separate architect-level work from local patching:

- What **invariant** was violated, and **who owns** it? Is it enforced anywhere, or merely assumed everywhere?
- Is this a **local defect** or a **structural weakness** — could a reasonable engineer make this mistake again tomorrow? If yes, the fix should reduce that possibility, or the report should recommend how.
- Are **responsibilities in the right place**? Bugs cluster where a module does someone else's job (validation in the view, business rules in the ORM layer, retry logic in the domain).
- What are the **feedback loops**? Does the failure amplify (retry storms, unbounded queues, cache stampedes) or dampen?
- What are the **failure modes at the boundary**: timeouts, partial writes, duplicate delivery, out-of-order events, clock skew, encoding, precision, timezone, locale?
- Where is the **single source of truth** for this data? A bug caused by two sources of truth is fixed by removing one, not by syncing them harder.
- What does this bug tell you about **missing observability**? If diagnosis was hard, recommend the log/metric/assert that would have made it easy.
- Is this defect a **symptom of duplication** — the same feature implemented twice, drifting apart? Flag duplicated code, features, and services encountered along the way.

---

## Writing no unnecessary code

- Search before you create. If a validator, mapper, error type, or utility already exists, use it; if it exists twice, that duplication is a finding.
- Do not add configuration options, hooks, generic parameters, or abstraction layers "for future needs". Fix today's cause.
- Do not add defensive checks that cannot trigger once the cause is fixed — they mislead the next reader into thinking the state is possible.
- Do not add logging noise; add the one log/metric that would have shortened this investigation.
- Prefer deleting code over adding code. A fix that removes lines and removes the bug is the best possible outcome.
- Every line you add must be traceable to the causal chain. If you cannot say which link it addresses, delete it.

---

## Stop and ask when

- The correct fix changes a public API, a database schema, a message contract, or persisted data.
- The correct fix is a structural change larger than the task you were handed.
- The "expected behavior" is contested or undocumented — you would be deciding product requirements.
- The bug indicates possible data corruption already in production, or a security/privacy exposure (in which case: report immediately, do not quietly patch and move on).
- You cannot reproduce the bug and would otherwise be shipping a guess.
- Two credible root causes remain and distinguishing them needs information you don't have.

Present the options and trade-offs concisely; do not stall waiting when a safe, reversible investigative step is available.

---

## Reference files

- `references/root-cause-techniques.md` — debugging playbooks by defect class: concurrency, memory/resources, performance, distributed/integration, data corruption, flaky tests, heisenbugs, plus bisection and instrumentation technique.
- `references/anti-patterns.md` — annotated catalogue of band-aid fixes with code examples and the root-fix alternative for each.
- `references/report-templates.md` — RCA report, commit message, PR description, and the "related findings" format.
