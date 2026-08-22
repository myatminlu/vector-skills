---
name: project-structure-refactoring
description: 'Cross-language project structure and structural refactoring standards: design clean folder/module layouts and safely restructure existing codebases. Use when restructuring or reorganizing a codebase, choosing or fixing a repo''s folder structure, deciding where a file or module belongs, package-by-feature vs by-layer, reorganizing/moving files or directories, planning a migration to a new layout, fixing messy/flat/deep folder trees, splitting or adopting a monorepo (apps/packages, workspaces, Turborepo/Nx), Python src layout, Go cmd/internal layout, React/Next.js/Expo feature folders, barrel files, import path aliases, or updating Dockerfiles/CI/configs after file moves. Covers plan-approve-execute staged migrations with green builds, git mv history preservation, and boundary enforcement. Structural only: hand code-level refactoring (extract/rename/dedupe) to code-implementation or codebase-audit, NestJS layout specifics to nestjs-dev-guidelines. Principles apply to any language beyond the stacks documented.'
---

# Project Structure Refactoring

Standards for two jobs: **designing** a clean folder/module layout for a project (new or
existing, in any language), and **restructuring** an existing codebase to reach that layout
without breaking anything. Think like a senior engineer who has lived through bad migrations:
structure is a product for readers, moves are riskier than they look, and a plan someone
approved beats a clever surprise.

## How to use this skill

1. Read the **Non-Negotiables** below before proposing or moving anything.
2. Designing a layout (new project, or a target for a migration)? Open
   `references/00-structure-principles.md`, then the stack file (`10`–`13`) for the ecosystem.
3. Restructuring an existing project? Follow `references/01-restructure-workflow.md`
   end to end — inventory → target → mapping table → **approval gate** → staged execution.
   Keep `references/02-safe-moves-mechanics.md` open while executing.
4. Answering "where does this file go?" — use the decision trees below; deep detail in `00`
   and the stack file.

## Scope and hand-offs

This skill owns **structure**: folders, module boundaries, file placement, and the mechanics
of moving code safely. It deliberately does not own everything nearby:

1. **Code-level refactoring is not this skill.** Extract function/class, rename symbols,
   de-duplicate logic, redesign APIs → use the `code-implementation` workflow (and
   `codebase-audit` to find what deserves it). During a restructure, such changes are
   explicitly forbidden inside move commits — see Non-Negotiable 4.
2. **Finding the mess is not this skill.** Duplicated services, dead code, band-aid fixes,
   wiring verification across a whole repo → `codebase-audit`. Its report is excellent input
   for a restructure plan; this skill takes over at "what should the layout be and how do we
   get there".
3. **NestJS layout specifics** → `nestjs-dev-guidelines` (`01-folder-structure`,
   `03-module-design`) defines the target layout for NestJS repos. This skill still supplies
   the migration workflow and move mechanics.
4. **Repo conventions win when equivalent.** If the codebase has an established, healthy
   layout that differs from these defaults, extend it consistently instead of migrating to
   taste. Restructure only when the current layout causes real, nameable pain.
5. **Framework file conventions are load-bearing.** Router-owned directories (Next.js `app/`,
   expo-router, Django apps, pytest discovery) are constraints, not suggestions. Verify the
   convention against the docs for the version in the repo before designing around it.

## Non-negotiables (protect these outcomes)

Each rule has a **Why** so you can reason about edge cases instead of applying it blindly.

1. **No moves without a green verify command.** Before touching anything, identify the
   build/typecheck/test commands, run them, and record that they pass.
   *Why:* without a passing baseline you cannot distinguish "I broke it" from "it was broken".
   A restructure with no verify signal is blind surgery. See `01`.
2. **Plan → mapping table → approval → then move.** Restructuring an existing project always
   produces a written plan (target tree + old→new mapping + stages) and waits for explicit
   approval before the first move.
   *Why:* a plan is cheap to review and change; a half-executed migration is expensive to
   review and worse to undo. The mapping table is where surprises surface early. See `01`.
3. **Every stage ends green and committed.** Each stage is a coherent slice that builds,
   typechecks, and passes tests before the next begins. Never proceed on red; revert the
   stage instead of patching forward.
   *Why:* stages are the rollback points. One red stage patched forward becomes an
   unrevertable tangle that blocks everyone until it's fully fixed.
4. **Move commits move; they never change behavior.** A move commit contains file moves plus
   only the mechanical path fixes needed to stay green (import paths, config paths). No
   renames of symbols, no cleanup-while-here, no logic edits.
   *Why:* git detects renames by content similarity — mixing edits into moves destroys
   history (`git log --follow`, blame) and makes the diff unreviewable. Behavior changes
   hide perfectly inside 300-file move diffs. See `02`.
5. **Structure screams the domain.** Top-level folders say what the system does (payments,
   ingestion, checkout), not what the framework is (controllers, helpers, classes).
   Default to package-by-feature; layers live inside features.
   *Why:* readers navigate by task ("the invoicing bug") not by kind ("all the services").
   Feature folders keep one change in one place; layer folders smear it across the tree. See `00`.
6. **One home per kind of code — written down.** Every kind of file has exactly one correct
   location, and the decision is recorded (structure doc or README), not re-derived per PR.
   *Why:* "two plausible homes" is how parallel structures and duplicate helpers are born.
7. **Dependencies point one way.** Shared/core code never imports feature code; features
   reach each other only through public APIs (a module's index/exports, a package boundary),
   never through deep paths into internals.
   *Why:* one inverted import quietly makes "shared" depend on everything, and every future
   move a breaking change.
8. **No junk drawers.** No `utils/`, `common/`, `helpers/`, `misc/` dumping grounds. Name
   modules by their content (`dates.ts`, `money.py`, `retry.go`).
   *Why:* a folder named by what it isn't grows monotonically and is unsearchable; naming by
   content forces the "what is this really?" decision that keeps structure honest. See `00`.
9. **Path-bearing files are part of every move.** Dockerfiles, CI workflows (including
   `paths:` filters), CODEOWNERS, bundler/test configs, scripts, docs, and string-based
   dotted paths get grepped for old paths at every stage.
   *Why:* the type checker catches broken imports; nothing catches a CI path filter that
   silently stops running your tests, or a Dockerfile COPY of a folder that no longer
   exists. These fail in prod, not in review. See `02`.
10. **Boundaries get a mechanical guard.** After a restructure, encode the rules — lint
    boundary rules, `import-linter`, Go `internal/`, workspace dependency constraints — so
    the structure survives contact with the next hundred PRs.
    *Why:* structure enforced only by convention decays at the speed of deadlines.

## Decision trees

**Should we restructure at all?**
- No working build/test command? → Stop. Add a verify signal first; structure work is blind without it.
- Mid-feature, or many open PRs touching the area? → Schedule it; a restructure is a merge-conflict bomb for every open branch.
- Pain is real and nameable (onboarding takes days, every PR asks "where does this go?",
  one change fans out across the tree, merge conflicts cluster in dump folders)? → Yes, plan it.
- It's just "ugly" but stable and rarely touched? → No. Note it and move on.

**Feature folders or layer folders?**
- App/service code → package by feature; layers (`api/`, `service/`, `model/`) live *inside* a feature if needed.
- Genuinely cross-cutting kind (design-system UI, config, framework wiring) → a shared layer folder is correct.
- Tiny project (< ~15 source files) → flat is fine; structure at pain, not at birth.

**Where does this file go?** (generic; stack files refine it)
- Used by one feature → inside that feature's folder.
- Used by 2+ features, domain-flavored → shared domain module/package with a real name.
- Generic and pure (dates, retry, ids) → `lib/` (or the stack's equivalent), named by content.
- App wiring (entrypoint, DI, router, providers) → `app/` / `cmd/` / the framework's designated spot.
- Doesn't fit anywhere → that's a design smell to raise, not a reason to create `misc/`.

**Monorepo?**
- Multiple deployables share code that must change atomically (or drift is already hurting via copy-paste)? → Yes: `apps/` + `packages/`, see `13`.
- Independent teams, independent release cadences, no shared code? → Separate repos; a monorepo without shared code is just a long clone.

## Rule index

| # | File | Rule in one line |
|---|---|---|
| 00 | `00-structure-principles.md` | Language-agnostic principles: screaming architecture, feature-first, colocation, dependency direction, junk-drawer ban, when NOT to restructure |
| 01 | `01-restructure-workflow.md` | The migration workflow: preconditions → inventory → target → mapping table → approval gate → staged green execution → boundary guards |
| 02 | `02-safe-moves-mechanics.md` | Mechanics: git mv and history, per-ecosystem import fixing, shims, and the silent-breaker census (Docker, CI path filters, CODEOWNERS, dotted-path strings) |
| 10 | `10-javascript-typescript.md` | Node services, React/Next.js/Expo feature folders, router-owned dirs, barrels only at module boundaries, path aliases |
| 11 | `11-python.md` | src layout, packaging, FastAPI feature packages, Django app conventions, dotted-path string census, absolute imports |
| 12 | `12-go.md` | cmd/ + internal/ layout, package-by-feature, package names as API, pkg/ skepticism, flat-until-it-hurts |
| 13 | `13-monorepo.md` | apps/ + packages/ split, boundary rules (apps→packages, no cycles), workspace tooling, migrating from copy-paste repos with history |

## When to deep-read

| You are doing... | Open... |
|---|---|
| Any restructure of an existing project | 01, 02, 00, + stack file |
| Laying out a brand-new project | 00, + stack file |
| Answering "where does this file/module go?" | 00, + stack file |
| Executing approved moves / fixing imports | 02, 01 |
| Node/React/Next/Expo layout | 10, 00 |
| Python layout or src-layout migration | 11, 02 |
| Go service or library layout | 12, 00 |
| Consolidating repos / splitting apps and packages | 13, 01, 02 |
| Post-move breakage (CI, Docker, prod) | 02 |
| NestJS repo | nestjs-dev-guidelines `01`/`03` for the target; here: 01, 02 for the migration |

## Meta

- **Reversibility first.** Staged, green, committed — every point in the migration is a safe
  place to stop, ship, or roll back.
- **Boring beats novel.** The ecosystem's well-worn layout, verified against current docs,
  beats an invented one — future readers already know it.
- **Structure is a product.** Its users are the next hundred readers and the next thousand
  PRs. Optimize their navigation, not the diagram's elegance.
