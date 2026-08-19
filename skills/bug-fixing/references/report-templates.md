# Report Templates

The report is not paperwork — it is the proof that the fix addresses a cause rather than a symptom, and it is what lets a reviewer disagree with your reasoning instead of just your diff.

---

## 1. Full root-cause report

Use for any non-trivial fix.

```markdown
# Fix: <one line naming the CAUSE, not the symptom>

## Symptom
What was observed, by whom, how often, and the impact.
Error text / stack trace / wrong value, verbatim.

## Reproduction
Exact steps or the test that reproduces it.
Environments where it reproduces and where it does not.

## Investigation
The evidence trail, briefly: what was checked, what was eliminated, and how.
Include the observations that changed the direction of the investigation.

## Root cause
The causal chain, ending outside the codebase's control or at a design decision:

  <symptom>
  ← <mechanism> (`file.ext:line`)
  ← <mechanism> (`file.ext:line`)
  ← ROOT: <the thing that made all of this possible>

Why it did not fail before (regression window / triggering condition).

## Options considered
| Option | Layer | Risk | Effort | Verdict |
|---|---|---|---|---|
| A. <symptom-level patch> | view | hides bad data downstream | low | rejected |
| B. <fix at the boundary> | ingestion | medium blast radius | medium | chosen |
| C. <structural redesign> | domain model | high | high | recommended follow-up |

## The fix
What changed and why this layer is the correct place.
- `path/file.ext` — <one-line rationale>
- `path/other.ext` — <one-line rationale>
Lines added / removed. Anything deleted as newly dead.

## Verification
- Reproduction test `<name>`: fails before (paste the failure), passes after.
- Additional cases covered: <boundaries, nulls, concurrency, error paths>.
- Suite run: <scope> — result.
- Measurements (for perf/memory/concurrency fixes): before → after.

## Blast radius & compatibility
Callers / subclasses / serialized forms / stored data / external consumers affected.
Backward compatible? Migration or backfill needed? Rollback plan.

## Already-corrupted data
Yes/No. If yes: how to identify affected records, proposed remediation, approval needed.

## Observability improvement
The log / metric / assertion added (if any) that would have made this bug obvious.

## Related findings (not fixed)
Clones of this defect, band-aid patches, duplicated features/services, dead code,
comments contradicted by the code — each with location, severity, and a suggestion.

## Assumptions & open questions
Anything decided without confirmation, and anything a human should decide.
```

---

## 2. Short report

For a small, contained fix — keep the causal chain, drop the ceremony.

```markdown
**Symptom:** <what was seen>
**Root cause:** <mechanism> at `file.ext:line` — <why it happened>
**Fix:** <what changed and why there> (`file.ext`)
**Verified:** `<test name>` fails before / passes after; <suite> green.
**Notes:** <clones found, risks, follow-ups>
```

---

## 3. Commit message

State the cause and the fix. A message that only names the symptom is useless to the person who bisects to it in two years.

```
fix(<scope>): <what is now correct, in the imperative>

<Symptom in one sentence.>

Root cause: <mechanism, with file references>. <Why it wasn't caught before.>

Fix: <what changed and why at this layer>. <What was deliberately not changed.>

Verified: <test that now covers it>.

Refs: <issue/ticket>
```

**Example**

```
fix(import): parse prices at the ingestion boundary using an explicit locale

CSV imports from EU tenants produced NaN totals on the revenue report.

Root cause: `csv_parser.py:31` converted price strings with `float()`, which
silently fails on comma decimal separators; the invalid value entered the domain
model unchecked and only surfaced at aggregation. The report layer masked earlier
occurrences with `|| 0`, so corrupt rows were stored without any error.

Fix: parse with an explicit locale and reject unparseable rows at ingestion, so an
invalid price can no longer reach the domain model. Removed the `|| 0` mask in the
report so future bad data fails loudly. Did not change the aggregation logic.

Verified: test_import_rejects_ambiguous_decimal fails before / passes after;
import + reporting suites green.

Refs: BUG-2418
```

---

## 4. Pull request description

```markdown
## What this fixes
<Symptom> — reported in <ticket>.

## Root cause
<Causal chain, 2–5 lines, with file:line references.>

## Why not the obvious fix
<The symptom-level patch considered and why it was rejected — usually the most
useful paragraph in the PR for a reviewer.>

## Approach
<Where the fix lives and why that layer owns this invariant.>

## Risk & blast radius
<Affected callers/data/APIs. Backward compatibility. Rollback plan.>

## How to verify
<Test names; manual steps if applicable; what to watch after deploy.>

## Follow-ups (not in this PR)
<Clones, structural recommendations, band-aids found elsewhere.>
```

---

## 5. Temporary mitigation notice

Only when a production incident forces a stopgap. Put it in the code and the report.

```js
// TEMPORARY MITIGATION (BUG-2418, 2026-08-17)
// Root cause: unvalidated locale-ambiguous price parsing at the ingestion
// boundary (import/csv_parser.py:31). This clamp prevents the report from
// showing NaN while the parser fix is being prepared.
// It does NOT prevent corrupt rows from being stored.
// Remove together with the parser fix. Owner: <name>. Follow-up: BUG-2419.
```

A mitigation without an owner, a linked follow-up, and a stated root cause is just a band-aid.

---

## 6. "Cannot reproduce / cannot fix yet" report

Never substitute a speculative patch for this.

```markdown
## Status: not reproduced

**Attempted:** <environments, inputs, configurations tried>
**Evidence gathered:** <logs, traces, metrics, code paths read>
**Eliminated:** <hypotheses ruled out, and how>
**Leading hypotheses:** <ranked, each with the evidence that would confirm it>
**Needed to proceed:** <access, data, a production trace, a specific log line, a
  reproduction from the reporter>
**Proposed next step:** <instrumentation to add — minimal, safe, reversible>
```
