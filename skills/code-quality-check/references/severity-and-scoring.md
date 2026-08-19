# Severity, Confidence, Scoring, and Verdict

Phase 4. The purpose of ranking is to tell the author what to do first. A report where
everything is important is a report where nothing is.

---

## Severity rubric

Rank by **consequence × likelihood**, adjusted for the stakes established in Phase 0. The same
code is a Blocker in a payments service and a Minor in a prototype — say which context you
applied.

### Blocker — must be fixed before this ships

- Data loss, corruption, or silent wrong results that reach users or storage.
- Security holes with a realistic exploit path: injection, authz bypass, exposed secrets,
  unauthenticated access to private data.
- Crash, hang, or outage on a normal or easily-reached input path.
- Money, billing, or legally-consequential computations that are wrong.
- Irreversible operations without safeguards (destructive migration, mass delete).
- A build that fails, a test suite that is red, or a change that breaks a live consumer
  contract.
- Failures that are *silent*: the system produces wrong output with no error and no signal.
  Silence upgrades severity, because nobody will ever notice.

### Major — fix before or immediately after merge; must not be forgotten

- Bugs on realistic but less common paths (specific inputs, error paths, concurrency).
- Missing error handling or timeouts on external calls in a production path.
- Performance problems that will bite at plausible near-term scale.
- Duplicated business logic that has already diverged.
- A feature that is not fully wired end to end.
- A bug fix with no regression test.
- Structural problems that make the next change dangerous: god object on the critical path,
  logic untestable without a live dependency.
- Observability gaps that would make a real incident undiagnosable.

### Minor — should fix, schedule it

- Contained bugs on unlikely paths with limited blast radius.
- Readability and naming problems that materially slow comprehension.
- Duplication that has not diverged yet.
- Missing tests for secondary behavior.
- Dead code, stale comments that contradict the code, speculative generality.
- Inefficiencies with no current impact at real data sizes.

### Nit — optional, author's discretion

- Preference-level phrasing, ordering, or micro-optimizations.
- Anything a formatter or linter should own — consolidate all of these into **one** tooling
  finding rather than listing instances.

Cap nits at roughly five, and put them last. If you have more, the review needs prioritization,
not more nits.

---

## Confidence tags

Attach one to every finding. Reviewers who overstate confidence get ignored after the first
false alarm.

- **CONFIRMED** — you traced the code path end to end, or you executed it and observed the
  behavior. Cite the trace or the command and its output.
- **LIKELY** — strong static evidence with a single reasonable inference (e.g., a null
  dereference where the producer's type is nullable, but you did not enumerate every caller).
- **SUSPECTED** — plausible from the code, but a real check is missing. State exactly what
  would confirm it: "run with `X`", "check whether `Y` can return null", "ask whether this
  topic has a subscriber."

`SUSPECTED` findings are welcome — hiding uncertainty is the problem, not having it. What is
not acceptable is presenting a `SUSPECTED` finding as `CONFIRMED`.

---

## Effort estimate

Give each finding a rough size so the team can plan: **S** (under an hour, local change), **M**
(half a day, touches a few files or needs a test), **L** (multi-day, structural or
cross-service). Effort is not severity — a Blocker can be S, and a Minor can be L. Both facts
matter for sequencing.

---

## Scorecard

Score each reviewed dimension 1–5. Only score dimensions you actually examined; mark the rest
`n/a — not reviewed` rather than guessing, and never award a score to a dimension you skipped.

| Score | Meaning |
|---|---|
| 5 | Exemplary. Other code in the repo should copy this. |
| 4 | Solid. Minor improvements only. |
| 3 | Acceptable. Works, with real gaps that should be scheduled. |
| 2 | Weak. Contains Major issues; changes here are risky. |
| 1 | Failing. Contains Blockers, or the dimension was clearly never considered. |

```markdown
| Dimension | Score | Basis |
|---|---|---|
| Correctness & logic | 3 | Happy path solid; two boundary bugs (F-02, F-05) |
| Error handling | 1 | Four external calls with no timeout; two swallowed exceptions |
| Security | 4 | Parameterized queries throughout; one authz gap (F-01) |
| Data & state | 3 | ... |
| Interfaces & contracts | 4 | ... |
| Duplication & dead code | 2 | Tax logic in three places, already diverged (F-03) |
| Structure & complexity | 3 | ... |
| Naming & readability | 4 | ... |
| Tests | 2 | 71% coverage but assertions mostly check mocks |
| Performance | 3 | ... |
| Dependencies & config | 4 | ... |
| Observability | 2 | No request correlation; failures log at debug |
```

Never average the scores into a single grade. A 1 in security is not offset by a 5 in naming,
and an average invites the team to feel fine about a fatal weakness.

---

## Verdict

Pick exactly one and name what would change it.

- **Ship** — no Blockers, no Majors. Minors and nits noted for later.
- **Ship with follow-ups** — no Blockers; Majors exist but are safely deferrable, and you list
  which ones must be ticketed before merge.
- **Changes required** — one or more Majors that must be handled first, or a Blocker with a
  small, contained fix.
- **Do not merge** — Blockers with real exploit/loss potential, a broken build, or the design
  needs rework before line-level fixes are meaningful.

Write it as one sentence with the trigger condition:

> **Changes required** — F-01 (unauthenticated access to other users' invoices) and F-04
> (payment retry is not idempotent) must be fixed; the remaining findings can be ticketed.
> Fixing those two moves this to *Ship with follow-ups*.

---

## Remediation sequencing

Order the fix list by dependency and risk, not by severity alone:

1. **Stop the bleeding** — Blockers with contained fixes; anything actively losing or exposing
   data.
2. **Make failures visible** — add the missing logging/metrics/alerting before deep refactors,
   so you can tell whether later changes help or hurt.
3. **Add characterization tests** around the code you are about to change, so refactors are
   verifiable.
4. **Fix root causes**, then remove the band-aids that were compensating for them — in that
   order, never the reverse.
5. **Consolidate duplication**, one merge at a time, each individually reversible and verified
   green.
6. **Delete dead code** last, after the removal-safety verification each finding specifies.

Flag any two items that conflict (fixing A makes B harder) so the team sequences deliberately
rather than discovering it mid-refactor.
