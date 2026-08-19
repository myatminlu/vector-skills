# Root cause analysis — fixing causes, not symptoms

**Contents**
1. The standard
2. Characterize the failure precisely
3. Reproduce or bound the problem
4. Trace backwards to the divergence point
5. The "why" chain, applied to code
6. Cause taxonomy and matching fix level
7. Sibling defect search
8. Choosing the fix level
9. When a temporary mitigation is acceptable
10. Proving the cause was actually the cause

---

## 1. The standard

You have found the root cause when you can complete this sentence with specific code, and the sentence fully explains every observed symptom:

> "The failure happens because `<file:line>` does `<X>` when `<condition>`, which is wrong because `<contract/invariant>` requires `<Y>`."

If your explanation contains "somehow", "probably", "maybe a race", or "it seems like", you are still hypothesizing. Keep going. A fix built on a hypothesis is a coin flip that also adds code.

The difference between a symptom and a cause is simple: suppress a symptom and the underlying wrongness is still there, waiting to appear somewhere else. Fix a cause and a whole class of failures disappears at once.

---

## 2. Characterize the failure precisely

Before any theory, pin down the facts:

- **Observed vs expected:** what actually happens and what should happen, stated concretely.
- **Exact trigger:** the specific input, user, record, timing, or sequence.
- **Scope:** always, or only sometimes? One environment or all? One record or all records? Since when?
- **Evidence:** the actual error message, stack trace, log line, failing assertion, or wrong value. Get the real text — paraphrased errors send investigations in the wrong direction.
- **Recent change:** did this coincide with a deploy, a config change, a data migration, a dependency upgrade, or a traffic change?

"Intermittent" is itself a strong clue: it points toward concurrency, ordering, caching, external dependencies, time/timezone handling, or data-dependent branches — not toward simple logic errors.

---

## 3. Reproduce or bound the problem

A reliable reproduction is the single highest-value asset in debugging: it makes the cause observable and proves the fix later.

- Try to reproduce with the smallest possible input and the fewest moving parts.
- If you cannot run the system, build the reproduction *on paper*: walk the exact code path with the exact input values and show where the value or state goes wrong.
- Write the reproduction as a failing test if the project supports it. That test becomes the regression test in Phase 6.
- If you genuinely cannot reproduce, narrow by elimination — which components can be ruled out by evidence? — and clearly state that the diagnosis is inference rather than observation.

---

## 4. Trace backwards to the divergence point

Work from the symptom toward the origin, not forward from the start:

1. Identify where the wrongness is **observed** (the exception, the wrong output, the missing record).
2. Determine what input or state made that line behave that way.
3. Find where that input or state came from.
4. Repeat until you reach the first point where a value or state was correct on the way in and wrong on the way out — or where a correct value was interpreted under a wrong assumption.

That first divergence point is the cause candidate. Everything downstream is a symptom.

Useful discriminators along the way:
- **Is the data wrong, or is the interpretation wrong?** A correct value handled under a wrong contract (units, timezone, encoding, currency, nullability, ordering) is very common and looks like corrupted data.
- **Is it wrong at the boundary?** Check what actually crosses each boundary — the serialized payload, the SQL that runs, the HTTP body — rather than what the code appears to send.
- **Is the state stale?** Caches, memoization, connection pools, module-level singletons, and client-side copies produce values that were correct once.

---

## 5. The "why" chain, applied to code

Keep asking "why" until the answer is a design decision or a violated contract, not another symptom.

**Example:**
- Users see an empty report. *Why?* → The API returns an empty list.
- *Why?* → The query filters on `status = 'active'` and the records have `status = 'ACTIVE'`.
- *Why the mismatch?* → The importer writes uppercase; the UI writes lowercase.
- *Why does that matter?* → Because status is a free-text column with no canonical form and no single writer.
- **Root cause:** the status value has no owner and no normalization at the write boundary; two writers established two conventions.

Symptom fix: lowercase the comparison in this one query. The bug returns tomorrow in the next query.
Cause fix: define the canonical representation (ideally an enum/constrained type), normalize at every write boundary, migrate existing data, and remove the ad-hoc comparisons.

Stop the chain when you reach something you cannot change (a third-party contract, a business rule) — then the fix is to handle that reality explicitly and once, at the boundary.

---

## 6. Cause taxonomy and matching fix level

| Cause | Typical evidence | Fix level |
|---|---|---|
| Logic error | Wrong operator, boundary, or branch | Local fix + test |
| Wrong contract assumption | Units, timezone, encoding, nullability, ordering, pagination | Fix at the boundary; document/type the contract |
| Missing or misplaced validation | Bad data reached deep code | Validate at entry; remove downstream defensive checks |
| Error swallowing | Failure appears far from origin, or silently | Let it propagate; handle where a decision is possible |
| State ownership confusion | Same fact stored/computed in several places, they drift | Establish one owner; others derive or read |
| Race / ordering | Intermittent, load- or timing-dependent | Fix ordering, locking, idempotency, or transaction boundary |
| Configuration / environment | Works here, fails there | Fix config handling; fail fast at startup on invalid config |
| Data quality | Bad records predate the code path | Fix the writer, then migrate the data |
| Resource lifecycle | Leaks, exhaustion, degradation over time | Fix acquisition/release; use scoped ownership |
| Design-level | The same class of bug recurs in different places | Restructure responsibility; migrate fully |

The last row is the important one for a codebase being cleaned up: **repeated similar bugs are a design defect, not a series of coding mistakes.** Report them as such even when the immediate fix is local.

---

## 7. Sibling defect search

A root cause almost never has exactly one manifestation. Before you finish:

- Search for the **same pattern** elsewhere: the same comparison, the same missing check, the same conversion, the same call without a timeout.
- Search for **other callers** of the faulty function — do they pass inputs that trigger the same path?
- Search for **copies** of the faulty block (it was probably copy-pasted; the copies may have drifted further).
- If the cause is a wrong assumption about a contract, find **everyone else** who consumes that contract.

Report every instance found. Fix the ones inside your mandate, list the rest with locations and severity. Fixing one instance while five identical ones survive is the definition of a band-aid.

This search happens twice: here, while the cause is fresh and you know exactly what shape to look for, and again as the mandatory pattern sweep in Phase 6 (`verification.md` §6a), where it is run on every change regardless of type. The second pass catches what the first missed, because by then you also know the shape of the *fix* — and other places lacking that fix are just as findable as other places containing the defect.

---

## 8. Choosing the fix level

Rank options from cheapest to deepest and pick the shallowest one that actually eliminates the cause:

1. **Local correction** — the logic at the divergence point was simply wrong. Fix it, test it.
2. **Contract correction** — the boundary is under-specified. Make the contract explicit (type, schema, validation, normalization) and fix all sides.
3. **Ownership/structural correction** — the responsibility or state sits in the wrong place, producing recurring defects. Move it, unify the duplicated paths, delete the losers.

Escalate only with justification. Record why the cheaper level was insufficient — that justification is what makes a larger change reviewable and trustworthy.

Never make a structural change opportunistically in the middle of a bug fix. Fix the bug, then propose the structural change as its own reviewable step.

---

## 9. When a temporary mitigation is acceptable

Sometimes stopping the bleeding first is correct — production is down, or the real fix needs a migration. A mitigation is acceptable only when **all** of these hold:

- It is explicitly labeled as a mitigation, in the code and in the report.
- The real root cause is documented next to it, with file:line evidence.
- The follow-up work is recorded as a concrete task, not a vague intention.
- It does not make the real fix harder later (no new callers depending on the mitigated behavior).

Never describe a mitigation as a fix. That single mislabel is how a codebase accumulates patches nobody dares remove, because nobody remembers what they were protecting against.

---

## 10. Proving the cause was actually the cause

Before reporting:

- **The reproduction now passes** — and it failed before your change. If you never had a failing reproduction, say so.
- **The explanation accounts for all observed symptoms**, including the odd ones (why only some records, why only that environment, why it started last Tuesday). An explanation that covers 80% of the evidence is usually the wrong explanation.
- **Reverting your change reproduces the failure** — conceptually or actually. If the failure would still occur, you fixed something adjacent.
- **A regression test exists** that fails without the fix and passes with it.
- **The related instances were checked**, and the ones left unfixed are listed.
