# PHASE 3 reference — Band-aid, hack & unsystematic-code audit

Goal: find code that treats a **symptom** instead of a **cause**, and code that only works by
accident. For each one, the deliverable is the traced root cause — a list of ugly lines without
causes is just a style complaint and the user cannot act on it.

## What to hunt

**Special-casing.** `if (id === 42)`, `if (user.email === '…')`, `if (env === 'prod')` inside
business logic; hardcoded tenant/customer/country carve-outs; magic strings that bypass rules.
Each one is a rule the domain model failed to express, so it will be duplicated the next time.

**Silent failure.** Empty `catch {}`, `except: pass`, swallowed promise rejections,
`.catch(() => null)`, errors logged while execution continues with invalid state. These convert
crashes into silent data corruption, which is strictly worse.

**Defensive noise that hides bugs.** `?? {}`, `|| []`, long `?.` chains, null checks added to stop
a crash whose cause was never found. Trace each: if the value can legitimately be absent, that is
design; if it can only be absent because of an upstream bug, it is a band-aid. Say which — this
distinction is the whole value of the finding.

**Timing hacks.** `sleep`/`setTimeout` used to "fix" a race, arbitrary delays before a read,
polling where an event or await exists, retry loops masking non-idempotent operations. These fail
under load, i.e. in production and not in testing.

**State patches.** Manually re-syncing a cache or derived field after the fact instead of fixing
the write path; double invalidation; re-fetching to paper over a stale write.

**Duplicated fix, un-fixed cause.** The same guard applied at N call sites instead of once inside
the function that actually misbehaves. Cross-reference these with PHASE 2 clusters.

**Type escapes.** `any`, `as unknown as X`, `@ts-ignore`, `# type: ignore`, `interface{}`, casts
that lie, reflection used to dodge a type problem. Each marks a place where the model of the data
is wrong.

**Config as escape hatch.** Env vars whose only purpose is to disable broken behaviour; feature
flags permanently on or off that now only add branches.

**Dead-but-defended code.** Fallbacks for conditions that can no longer occur, shims for versions
no longer supported, commented-out blocks kept "just in case".

**Action at a distance.** Monkeypatching, prototype mutation, global mutable state, singletons
mutated from several modules.

**Suppressions.** `eslint-disable`, `noqa`, `# pragma`, skipped or `.only` tests, ignored CI
checks. For each: which rule, and does the underlying issue still exist?

**God objects & shotgun surgery.** Files over ~500 lines doing unrelated things; a change that
would require edits in 5+ places; functions with many parameters, deep nesting, or three
responsibilities.

**Leaky abstractions.** A wrapper that must be bypassed for certain cases, so both paths exist
and only one gets maintained.

## Output format

| Field | Content |
|---|---|
| ID | `BAND-01` |
| Location | `file:line-range` |
| What it patches | the observable symptom it was written to stop |
| Root cause | traced, with the `file:line` where the real problem lives |
| Why it's fragile | the conditions under which the patch stops working |
| Blast radius | what breaks, and how visibly, when it does |
| Proper fix | the change that removes the need for the patch |
| Confidence | CONFIRMED / LIKELY / SUSPECTED |

## Judgement note

Not every guard is a band-aid, and calling defensive-but-correct code a hack destroys trust in the
rest of the report. Where the evidence is genuinely ambiguous — the value could be null by design
or by bug and the callers don't settle it — say so and put the question in `OPEN_QUESTIONS`
instead of picking the more dramatic reading.
