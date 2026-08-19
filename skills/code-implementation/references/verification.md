# Verification — proving the change works

**Contents**
1. The standard
2. Self-review of the diff
3. Wiring verification
4. Build, type, lint
5. Test verification
6. Failure-path and edge verification
6a. The mandatory pattern sweep
7. Contract and caller verification
8. Data and migration verification
9. Manual/runtime verification
10. Honest reporting of what was not verified
11. Final completion checklist

---

## 1. The standard

"It should work" is not verification. A change is verified when you have evidence — a command that ran, a test that passed, an output you observed. Anything else is a hypothesis and must be labeled as one.

The most common failure in agent-written code is not incorrect logic; it is **code that exists but is never actually reached**: a handler that is never registered, an import never added, a branch never taken, a service never wired. It looks complete in the diff and does nothing in the system. Section 3 exists specifically to catch this.

---

## 2. Self-review of the diff

Read your entire diff line by line, as a reviewer who assumes you made a mistake. Look for:

- **Leftovers:** debug prints, commented-out experiments, temporary values, hardcoded test data, TODOs you meant to resolve.
- **Half-finished edits:** a function renamed in one place, a parameter added but not passed everywhere, an import added but unused, an unused variable left behind.
- **Copy-paste damage:** the wrong variable in the second copy of a block — the classic bug that reviewers miss and tests rarely cover.
- **Inverted conditions and off-by-one errors** at boundaries (`<` vs `<=`, first/last element, empty collection).
- **Unhandled paths:** early returns that skip cleanup, branches with no case, exceptions that escape a context they should not.
- **Scope creep:** anything in the diff that is not required by the stated goal. Remove it or call it out explicitly.
- **Comments you invalidated:** the surrounding comments must still be true after your change.
- **Secrets or personal data** in code, logs, fixtures, or error messages.

If the diff is too large to review this way, it is too large to merge — split it.

---

## 3. Wiring verification

Confirm the new code is genuinely part of the running system, not merely present in the repository:

- **Imports/exports resolve** and the module is actually referenced from a reachable module.
- **Registration happened** where the framework requires it: route registered, handler subscribed, command added, job scheduled, provider bound in the DI container, migration added to the migration list, plugin listed in the manifest.
- **The entry point reaches it.** Re-trace the call chain from the true entry point through your change, as in the investigation phase, and confirm each hop exists in the modified code.
- **Configuration exists** in every environment that needs it, with a sane default or a fast failure when missing.
- **Feature is actually enabled** — no flag left off, no condition that is never true.
- **The old path is gone** if you replaced it, so requests cannot silently keep using it.

If you can run the system, exercise the real path once. If you cannot, state that the wiring was verified by reading, not by execution.

---

## 4. Build, type, lint

Use the project's own commands — the ones found in its manifest, Makefile, or CI configuration — rather than commands you assume exist.

- Build/compile succeeds.
- Type checker passes with no new errors.
- Linter/formatter passes; formatting matches the project's configuration rather than your own defaults.
- No new warnings introduced; if the project tolerates warnings, do not add to the pile.

---

## 5. Test verification

1. **Run the existing test suite** (or the relevant subset plus everything that touches your blast radius). Existing tests exist to prove you did not regress anything.
2. **Add tests for what you changed:**
   - A bug fix needs a test that fails without the fix.
   - New behavior needs tests for the main path and the meaningful edges.
   - A refactor needs the existing tests to pass unchanged; if you had to change them, explain precisely why, because that usually means behavior changed.
3. **Confirm the new tests actually test something** — temporarily break the code and see the test fail. A test that passes against broken code is worse than no test.
4. **Do not weaken or delete tests** to get green. A failing test is information; investigate it.
5. Report the actual result: how many ran, how many passed, which were skipped and why.

---

## 6. Failure-path and edge verification

Explicitly exercise, or explicitly reason through with evidence:

- Empty input, single item, large input, maximum size.
- Missing/null fields, unexpected types, malformed payloads.
- Dependency failure: timeout, error response, malformed response, slow response.
- Repeat execution: does running twice produce the same end state?
- Concurrent execution, if the path can run in parallel.
- Permission denied, unauthenticated, and unauthorized-object access.
- Rollback: does a mid-operation failure leave the system in a consistent state?

Where you could not test one of these, list it in the unverified section rather than assuming it is fine.

---

## 6a. The mandatory pattern sweep

Run this on **every** change — feature, fix, or refactor — after it works and before you report. It is not optional and it is not limited to defect work.

The reasoning: code arrives in a codebase by imitation. Whatever shape you just corrected or introduced, someone previously copied that shape elsewhere, or will now find two competing shapes to copy from. Verifying only the code in your diff verifies one instance of a pattern that probably has several — and the other instances are where the next incident comes from.

### What to search for

Search for each of these deliberately; do not stop at the first search that returns hits.

1. **The logic you corrected.** The same comparison, unit or timezone conversion, encoding assumption, boundary condition, ordering assumption, or normalization step.
2. **The thing that was missing.** Other call sites lacking the timeout, the retry cap, the transaction, the idempotency key, the resource cleanup, the authorization check, the validation at the boundary.
3. **The copied block.** Take a distinctive literal from the code you touched — an error string, a magic number, a regex, an unusual variable name, a specific call sequence — and search for it. Copy-paste is the usual origin of siblings, and copies drift, so the twin may look different while sharing the same defect.
4. **Other consumers of the same contract.** Everyone reading that field, calling that endpoint, parsing that format, or depending on that assumption — including indirect references through strings, config keys, serialized payloads, and event names, which symbol search will not find.
5. **For feature work:** places that should now call what you built instead of doing it themselves, and any pre-existing mechanism that now overlaps your new one. A new capability that leaves older half-implementations in place has increased duplication rather than reduced it.
6. **For refactors:** any remaining reference to the old path — imports, docs, tests, config, feature flags, dynamic lookups. Leftover references mean the migration is not finished.

### How to search well

- Use several vocabularies for the same concept — the codebase may call it `customer` in one module and `client` in another.
- Search literals and structural fragments, not only identifiers; identifiers get renamed, literals rarely do.
- Search across the whole repository, including tests, scripts, jobs, migrations, and infrastructure code — not just the module you were working in.
- Inspect each hit's actual context. A hit list is not a finding; reading the surrounding code is.

### What to do with each hit

| Situation | Action |
|---|---|
| Same defect, inside the mandate | Fix it in this change, with a test |
| Same defect, outside the mandate | List it in "Findings not fixed" with `file:line` and severity |
| Same defect but risky to touch now | Report it, state the risk, and record it as a concrete follow-up |
| Similar shape but actually correct | Note why it differs, so the next reader does not re-investigate it |
| Three or more instances | Escalate the diagnosis: this is a **design-level** cause. Recurring instances mean the structure invites the mistake, and the durable fix is structural (single owner, shared helper, enforced type, boundary that makes the wrong thing impossible) |

### Reporting the sweep

Never let the sweep be invisible — a silent sweep is indistinguishable from a skipped one.

```
Pattern sweep:
- Searched: <terms / literals / patterns used>
- Scope: <directories or whole repo>
- Hits inspected: N
- Same defect found: <file:line — fixed | reported>
- Ruled out: <file:line — why it differs>
```

"No other instances found" is a legitimate and useful result — but only when you name the terms you searched. An unnamed negative result is an assumption in disguise.

---

## 7. Contract and caller verification

For every caller enumerated during investigation:

- Signature still compatible (name, parameters, defaults, return type, error shape).
- Semantics still compatible — same meaning, units, ordering, and null behavior.
- Indirect consumers checked: serialized payloads, stored data shapes, API responses, event schemas, config keys, string-based lookups.
- If a contract had to change, confirm every consumer was updated in this change, or that a compatible transition is in place and the follow-up is recorded.

---

## 8. Data and migration verification

If the change touches persisted data:

- The migration runs cleanly on a realistic dataset, and is reversible or has a documented recovery path.
- The intermediate deployment state works (old code + new schema, and new code + old schema).
- Backfills are resumable, batched, and do not lock hot tables.
- Existing rows that predate the change still behave correctly — legacy data is the most common source of post-deploy surprises.
- No data loss path exists in the change, including on rollback.

---

## 9. Manual/runtime verification

When you can execute the system, verify at the level the user cares about:

- Run the actual command, request, or flow end to end and observe the real output.
- Check the side effects you claimed: the row written, the message published, the file created, the cache invalidated.
- Read the logs for silent errors — an operation that "succeeded" while logging a caught exception has not succeeded.
- Verify performance did not visibly regress on the changed path when that is plausible.

---

## 10. Honest reporting of what was not verified

Never imply verification you did not perform. Report unverified areas plainly and specifically:

```
Verified:
- Unit tests: <command> — N passed, M skipped (<reason>)
- Type check / lint: <command> — clean
- Manual: <what you ran and observed>

NOT verified:
- <what> — because <no environment / no credentials / no data / not reproducible here>
- Suggested check for you: <exact command or steps the user should run>
```

This section is what makes your work trustworthy. An accurate "I could not verify X" is worth far more to the user than an optimistic "done."

---

## 11. Final completion checklist

Before saying the work is complete:

- [ ] Every file I changed, I had read in full beforehand.
- [ ] The root cause is stated in one sentence with file:line evidence (for defect work).
- [ ] I searched for existing code before adding new code, and reused what I found.
- [ ] No duplicate path or second mechanism was created; anything replaced was deleted.
- [ ] The change is the smallest one that fully addresses the cause.
- [ ] Nothing speculative was added — no unused options, abstractions, or parameters.
- [ ] Build, types, and lint pass with the project's own commands.
- [ ] Existing tests pass; new tests cover the changed behavior and fail without the change.
- [ ] The wiring was verified — the code is reachable from the real entry point.
- [ ] All known callers and contracts still hold.
- [ ] Failure paths and edge cases were exercised or explicitly listed as unverified.
- [ ] The diff contains no leftovers, no scope creep, no secrets.
- [ ] The mandatory pattern sweep was run — search terms named, hits inspected, siblings fixed or reported.
- [ ] Three-or-more instances, if found, were escalated as a design-level cause rather than repeated coding mistakes.
- [ ] The report states what was verified, what was not, remaining risks, and findings I did not fix.
