---
name: codebase-audit
description: Forensic whole-codebase audit and staged refactor. Use this skill whenever the user wants a codebase reviewed, audited, cleaned up, refactored, or "made systematic" — and also whenever they mention duplicated code, duplicated features or services, copy-pasted modules, band-aid or quick-fix or hacky code, technical debt, legacy vs new implementations living side by side, dead code, code smells, or wants to verify that features, functions and services are actually wired together and working end to end. Trigger it for requests like "review my codebase", "find duplicate logic", "why is this code such a mess", "check if everything is connected properly", or "plan a refactor", even when the user does not say the word "audit". Do NOT use it for a single-file review, a single bug fix, or writing new features.
---

# Codebase Audit & Refactor

Investigate first, architect second, edit last. This skill turns a vague "clean up my
codebase" request into an evidence-backed audit and a sequenced, reversible refactor plan.

## Prime directives

These are what make the audit trustworthy. Follow them even when they slow you down.

1. **The code is the only source of truth.** Comments, docstrings, TODOs, commit messages,
   READMEs, and even function and file names are *claims*, not facts. Verify each against the
   logic that actually executes. When a comment and the code disagree, that mismatch is itself
   a finding (`COMMENT_LIE`) — stale comments are how bugs survive review for years.
2. **Evidence or it didn't happen.** Every finding cites `path/file.ext:line-range` plus the
   minimal excerpt that proves it. Never rely on "this framework usually…" — a codebase that
   needs an audit is precisely one that deviates from what's usual.
3. **Trace, don't assume.** To claim something works, follow the real path: entry point →
   dispatch → handler → service → data layer → external calls → response, error paths included.
   Code that is defined but unreachable is dead no matter how clean it looks.
4. **Audit and refactor are separate.** Change no production code during PHASE 0–6. The urge to
   "just fix this one thing" while reading is how audits turn into unreviewable diffs.
5. **State confidence honestly.** Tag each finding `CONFIRMED` (traced/proven), `LIKELY` (strong
   static evidence, one inference), or `SUSPECTED` (needs verification). An inflated
   `CONFIRMED` poisons every decision built on top of it.
6. **Never remove what you cannot prove is unused.** Dynamic dispatch, DI containers, reflection,
   string-registered routes, cron and queue workers, feature flags, and external callers all make
   code reachable in ways grep misses.
7. **No mass rewrites.** Consolidation happens in small, individually reversible steps, each
   verified green before the next.

## Before starting

Confirm with the user (ask only for what you cannot determine yourself by looking):

- repo path, language/framework, how to build, run, and test it;
- constraints (public APIs that must not break, versions that must be kept);
- scope — whole repo, or specific modules;
- whether they want all phases in one session, or phased across sessions.

For anything above ~50k lines, run PHASE 0–2 in one session, 3–5 in another, 6–8 last, feeding
the previous phase's report files forward. Trying to hold a large repo in one context produces
confident summaries instead of findings.

State the phase plan and the module-by-module review order before beginning, then keep a running
checklist marking every file `reviewed` or `skipped (reason)`. Nothing may be silently skipped —
skipping is how the one broken module gets missed.

## Phases

Write each phase to its own file under `reports/`. Read the referenced file at the start of the
phase that needs it.

**PHASE 0 — Reconnaissance** → `reports/00-map.md`
Directory map with a one-line purpose per area derived from *reading code*. Every entry point
(HTTP routes, GraphQL resolvers, CLI commands, cron jobs, queue consumers, webhooks, websocket
handlers, DB triggers, bootstrap files). Every exit (DBs, caches, brokers, third-party SDKs,
storage, payment/email providers). Config surface: every env var read anywhere vs. every one
defined in `.env.example`, CI, and deploy manifests — flag read-but-undefined,
defined-but-unread, and the same concept under two names. Data model inventory. Size metrics
(largest files, most-imported modules) to locate hot spots.

**PHASE 1 — Reachability & wiring truth** → `reports/01-wiring.md`
Build the call graph from each entry point. Then produce two lists: **orphans** (exports never
imported, controllers never registered, DI providers never injected, events subscribed that
nobody publishes, tables no code touches, flags nothing checks, unused dependencies) and
**broken wiring** (route path mismatches between client and server, guards applied to 6 of 9
endpoints — name the 3, migrations diverging from models, async work fired without await so
failures vanish). Also list layering violations and every import cycle explicitly.

**PHASE 2 — Duplication audit** → `reports/02-duplication.md`
Read `references/duplication.md`. Group findings into clusters, never a flat list. The valuable
output is not "these are similar" but **how the copies diverge**, because divergence is where the
bugs live.

**PHASE 3 — Band-aid & unsystematic-code audit** → `reports/03-bandaids.md`
Read `references/bandaids.md`. For each patch, trace back to the actual root cause. A null check
is only a band-aid if the value can *only* be null because of an upstream bug — say which.

**PHASE 4 — Comment-independent bug hunt** → `reports/04-bugs.md`
Read `references/bug-hunt.md`. Read the code as an execution engine would, with comments
ignored. Compare against comments only afterwards, and file every mismatch under `COMMENT_LIE`.
For every confirmed bug, run the **defect-class sweep**: name the class, find every other
instance of it in the repo, and report the class once with all locations. A bug found in one
place is rarely alone, and fixing only the instance you happened to read is itself a band-aid.

**PHASE 5 — Feature integration verification** → `reports/05-features.md`
This is what "100% working" means in this audit. Build the feature inventory from entry points,
not docs. For each feature write the full traced path with `file:line` at every hop:
`client → route → middleware/guards → controller → service(s) → repository → DB/external →
response mapping → client consumption`. Mark each hop `CONNECTED` / `MISSING` / `DIVERGENT`
(two paths that should agree but don't) / `UNVERIFIABLE` (name the command that would settle it).
Per feature, verify: happy path, at least two error paths, and the empty-result path; authorization
on *every* entry to the feature; validation at the trust boundary matching DB constraints; the
frontend calling an endpoint that exists with the shape the server expects and reading the shape
it actually returns; state changes observable on the next read. Output a health table:
`Feature | Entry points | Status | Broken hops | Blocking bugs`.

**PHASE 6 — Test & safety-net reality check** → `reports/06-tests.md`
Coverage of critical paths, not global percentages. Tests asserting nothing meaningful
(`expect(true)`, snapshot-only, assertions on mocks rather than behaviour). Tests that mock the
thing under test. Skipped/`.only`/quarantined tests and what they used to guard. Then the key
deliverable: **the minimum characterization tests that must exist before refactoring starts**,
written concretely as input → expected output. These are the safety net for PHASE 7.

**PHASE 7 — Refactor plan (plan only)** → `reports/07-refactor-plan.md`
Target architecture with one canonical home per concept and allowed dependency directions;
before → after module map. Per duplication cluster: chosen canonical implementation, why, and
what behaviour from the losing copies must be preserved. Then sequenced steps, each small and
independently shippable:
`Step N | Goal | Files touched | Preconditions (tests that must exist first) | Exact change | How to verify | Rollback | Risk | Depends on`
Order to minimize risk: characterization tests → dead code removal → mechanical deduplication →
interface extraction → behavioural consolidation → root-cause fixes replacing band-aids →
structural moves. Prefer steps that eliminate a whole defect class (a missing lint rule, a helper
with a footgun signature, an absent abstraction) over steps that patch single instances. Include a **do-not-touch list** (ugly but load-bearing code, and why) and a
separate list of **intentional behaviour changes** — including bug fixes users may depend on —
flagged for human sign-off.

**Stop here. Present the plan and wait for approval before editing anything.**

**PHASE 8 — Execution (only after approval)**
One step per commit/PR with the step ID in the message. Characterization tests written and
passing first. Never mix a move or rename with a behaviour change in the same commit. When a step
fixes a defect class, fix every instance in that step or state explicitly which are deferred and
why — a half-fixed class reads as fixed and stops getting attention. After each
step: full test suite, smoke path, re-trace the affected PHASE 5 features, report the diff summary
and verification result. If a step reveals the plan was wrong, stop and re-plan rather than
improvising a larger change. Keep `CHANGELOG-refactor.md` and update `reports/` as findings close.

## Report structure

Use `references/report-templates.md` for the per-finding table schemas.

Maintain `reports/SUMMARY.md` throughout:

```markdown
# Audit summary
## Top 10 findings          (by impact × confidence, one line each, with location)
## Counts                   (duplication clusters, band-aids, P0–P3 bugs, orphans, broken hops)
## Module health            (Solid / Fragile / Broken, one sentence of evidence each)
## Open questions           (everything unverifiable statically + the command or answer needed)
```

Be terse in prose and exhaustive in coverage. Tables over paragraphs. Every line must be about
*this* codebase and anchored to a file — generic best-practice advice adds length and no value,
and it dilutes the findings that matter.

## Failure modes to avoid

- Summarizing a file by its comments, README, or name instead of its logic.
- Concluding something works because it "follows the standard pattern".
- Quietly narrowing scope when the repo turns out to be large — go module by module instead.
- Reporting one issue several times under different names; merge into a single finding.
- Proposing a from-scratch rewrite.
- Inventing paths, symbols, or line numbers. When unsure, open the file.
- Hedging everything into uselessness — give a verdict, with its confidence attached.

## Definition of done

Every file marked reviewed or explicitly skipped with a reason; every entry point traced
end to end with a status; every duplication cluster given a named consolidation target; every
band-aid traced to a root cause; every bug given trigger conditions and evidence; every
unverifiable claim sitting in `OPEN_QUESTIONS` rather than presented as fact.
