# 01 — Restructure Workflow

## TL;DR

- Restructuring is a **migration**, not an edit: preconditions → inventory → target design → mapping table → **approval gate** → staged execution → boundary guards.
- The deliverable that gets approved is a plan: target tree + old→new mapping + stages + risks. **No file moves before approval.**
- Every stage ends green (build + typecheck + tests) and committed. Red stage → revert the stage, don't patch forward.
- Every file in the repo appears in the mapping table — "unmapped" is a decision to make, not a leftover to discover.
- Old paths with external consumers get **shims with a removal stage**, not silent breakage.

## Why it matters

A restructure touches more files than any feature ever will, with zero behavior change to
show for it — the worst possible ratio of blast radius to visible value. Done as one heroic
big-bang branch it rots for weeks, conflicts with every open PR, and lands as an
unreviewable 400-file diff. Done as a staged migration with an approved map, each step is
small, green, shippable, and boring. Boring is the goal.

## Phase 0 — Preconditions

Do not start without all three:

1. **A verify command that passes.** Identify how this repo proves itself — build, typecheck,
   test, lint — run it, record the exact commands and that they're green. This is the
   baseline every stage will be measured against. No verify signal → stop; adding one is the
   prerequisite work (and say so to the user).
2. **A clean slate.** Clean working tree, dedicated branch, current with the default branch.
3. **A quiet window.** List open PRs touching the area. A restructure conflicts with all of
   them; either land/coordinate them first or scope the restructure away from hot paths.
   Silently detonating five colleagues' branches is how migrations get reverted.

## Phase 1 — Inventory

Understand what exists before deciding where it goes. Collect, with commands not memory:

- **The tree as it is** — depth-limited listing, separating source from generated/vendored
  (`.gitignore` tells you which; never plan moves for generated files, fix their generator's
  output path instead).
- **Entry points** — binaries, servers, CLIs, scheduled jobs, exported package roots. These
  anchor the target design.
- **Hot files** — `git log --format= --name-only | sort | uniq -c | sort -rn | head -30`.
  High-churn files are where structure pain concentrates and where moves hurt open work most.
- **Junk-drawer census** — the `utils/`/`common/`/`helpers/` files; each needs a real home
  in the mapping (a named `lib/` module or a feature).
- **External consumers** — is anything outside this repo coupled to paths? Published package
  entry points, other repos' imports, deploy scripts, cron entries, docs links. These are
  the shim candidates.
- **Path-bearing config census** — the full list from
  [`02-safe-moves-mechanics.md`](./02-safe-moves-mechanics.md) (Dockerfiles, CI `paths:`
  filters, CODEOWNERS, bundler/test configs, dotted-path strings…). Build it now; you grep
  against it at every stage.

The `codebase-audit` skill's report, if one exists, slots in here — it already names the
duplicates, dead code, and wiring problems the mapping must decide about.

## Phase 2 — Target design

- Start from the stack's reference layout (`10`–`13`), shaped by
  [`00-structure-principles.md`](./00-structure-principles.md); rename the placeholders to
  this domain's real features.
- Write the target as a tree with a one-line purpose per top-level folder. If a folder's
  purpose needs a paragraph, the folder is wrong.
- Design for the code that exists, plus the direction the team confirmed — not for a
  hypothetical future ("we might go microservices") that earns folders no one fills.
- Framework-owned directories (Next.js `app/`, Django apps, Go `internal/`) are fixed
  points; verify their conventions against the docs for the version in the repo, then design
  around them.

## Phase 3 — The mapping table

The heart of the plan. Every source file or folder, old → new:

```
| Current | Target | Stage | Notes |
|---|---|---|---|
| src/helpers/date.ts        | src/lib/dates.ts                  | 2 | rename: content-named |
| src/components/InvoiceRow/ | src/features/invoicing/components/ | 3 | |
| src/api/payments.ts        | src/features/payments/api.ts      | 3 | update CI paths filter |
| src/legacy/v1-sync.ts      | (unmapped — decision needed)      | — | dead? → codebase-audit |
```

Rules that make the table trustworthy:

- **Total coverage.** Everything appears, even as "stays put". A file you didn't map is a
  file you'll improvise about mid-migration.
- **Unmapped is a finding.** Can't place a file? That's a real signal — dead code (hand to
  `codebase-audit` / ask the user), a missing concept in the target, or a file doing two
  jobs. Resolve it in the plan, not during execution. Deleting is never a restructure
  side-effect; it's its own decision with its own approval.
- **Moves only.** A row that implies rewriting content is out of scope by definition
  (Non-Negotiable 4); note it as follow-up work for `code-implementation`.
- **Notes carry the traps** — which config needs editing, which move needs a shim, which
  folder is hot in open PRs.

## Phase 4 — Stage design

Slice the mapping into stages where each is:

- **Independently green and shippable** — mergeable on its own, valuable even if the
  migration pauses here forever.
- **Reviewable** — roughly ≤ 50 moved files or one coherent area; "stage 3: invoicing moves
  into features/" reviews itself, "stage 3: assorted moves" doesn't.
- **Ordered by dependency and risk.** Usually: scaffolding first (create target folders,
  aliases, boundary lint in warn mode) → low-fan-in leaves → junk-drawer dissolution →
  high-fan-in shared code last (most imports to fix, most conflict risk) → shim removal as
  the final stage(s).

Number the stages; execution reports progress against them.

## Phase 5 — The approval gate

Present the plan: target tree, mapping table, stages, risks (hot files, open PRs, external
consumers, shims and their removal schedule), and the verify commands that define green.
Then **stop and wait for explicit approval**.

This gate is load-bearing, not ceremony: the user knows consumers, team plans, and taboos
the repo doesn't show. Approval also converts the mapping from your idea into the agreed
contract that execution and review are measured against. If the user amends the mapping,
update the plan — don't carry verbal deltas in your head.

(When the user has *already* specified the exact target and said to proceed, the gate is
satisfied — restate the mapping in one message so the contract is on record, and go.)

## Phase 6 — Execute, stage by stage

For each stage:

1. `git mv` the stage's files (see [`02`](./02-safe-moves-mechanics.md) for history rules).
2. Fix what the moves broke, mechanically: import paths, alias/config paths, the
   path-bearing census entries this stage touches. Tool-driven where possible.
3. Run the recorded verify commands. **Grep the census for the old paths.**
4. Green → commit with a message that names the stage
   (`restructure(3/6): invoicing into features/invoicing`). Red → fix only if the cause is
   an obvious missed mechanical path; anything deeper → revert the stage and take the
   finding back to the plan.
5. Report progress against the stage list; flag any discovered-but-unplanned work as a plan
   amendment instead of quietly absorbing it.

Never batch stages into one commit "to save time" — the per-stage commits are the rollback
points and the reviewable units. Never reorder past a red stage.

## Phase 7 — Shims and their retirement

When old paths have consumers you don't control this migration (other repos, published
entry points, pending PRs you agreed to spare):

- Leave a **shim** at the old path — a re-export/forwarding module with a deprecation note
  pointing at the new home (per-ecosystem mechanics in [`02`](./02-safe-moves-mechanics.md)).
- Every shim is **born with a removal stage** in the plan. A shim without a scheduled death
  is a second parallel structure — the exact disease being cured.
- Internal-only consumers don't get shims; fix the imports in the same stage instead.

## Phase 8 — Lock it in

The migration isn't done when the files stop moving:

- **Boundary guards on** (were warn-mode in stage 1): import-boundary lint, `import-linter`,
  workspace constraints — violations now fail the build. See `00`.
- **Write the map down**: a short structure section in the README/CONTRIBUTING — top-level
  folders, one line each, and the "where does a new X go?" answers. This is what keeps stage
  N+∞ (every future PR) honest.
- **Docs and onboarding paths updated**; census grep run one final time repo-wide.
- **Retire the plan doc** with a final state note (stages landed, shims outstanding and
  their deadlines).

## Anti-patterns

- The big-bang branch: everything moves in one heroic PR that rots for two weeks.
- Moving before approval "to show progress" — progress in the wrong direction is negative.
- Improvising placements mid-execution for files the mapping missed.
- Patching forward on a red stage instead of reverting.
- Mixing behavior changes, renames, or "cleanup" into move commits (Non-Negotiable 4).
- Deleting "obviously dead" files as a move side-effect.
- Shims without removal stages; or breaking external consumers without shims.
- Declaring done with the boundary lint still in warn mode and the README still describing
  the old tree.

## Review checklist

- [ ] Verify commands recorded and green **before** the first move
- [ ] Inventory includes entry points, hot files, external consumers, and the path-bearing census
- [ ] Mapping table is total; every unmapped file resolved as an explicit decision
- [ ] Stages independently green, shippable, reviewable, dependency-ordered
- [ ] Explicit approval on record before execution (or user-specified target restated)
- [ ] Each stage: moves + mechanical fixes only, verify green, census grepped, committed with stage-named message
- [ ] Shims only for external consumers; each with a removal stage
- [ ] Boundary guards enforcing (not warn) at the end; structure documented for contributors

## See also

- [`00-structure-principles.md`](./00-structure-principles.md) — what the target should look like and when to leave things alone
- [`02-safe-moves-mechanics.md`](./02-safe-moves-mechanics.md) — git mv, import fixing, shims, silent breakers
- [`10`](./10-javascript-typescript.md)–[`13`](./13-monorepo.md) — reference targets per stack
