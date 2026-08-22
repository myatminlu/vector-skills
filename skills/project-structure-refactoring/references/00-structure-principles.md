# 00 — Structure Principles

## TL;DR

- Structure is a product whose users are readers. Optimize two questions: **"where do I look?"** and **"where does this go?"** — each must have exactly one answer.
- Top level screams the **domain** (payments, ingestion), not the framework (controllers, helpers).
- Default to **package-by-feature**; layers live inside features. Global layer folders are for genuinely cross-cutting kinds only.
- **Colocate what changes together.** A component and its test, styles, and hook belong side by side.
- Dependencies point one way: shared → never imports features; features → each other only via public APIs.
- No junk drawers (`utils/`, `common/`, `misc/`). Name modules by content.
- Flat until it hurts. Restructure at real, nameable pain — never for aesthetics.
- A boundary that isn't mechanically enforced (lint, compiler, workspace constraint) is a suggestion with a half-life.

## Why it matters

Nobody reads a codebase top to bottom; they navigate it under pressure — a bug to fix, a
feature to add, an unfamiliar area to learn. Structure is the index they navigate with. A good
layout makes the next change local (one folder to touch, one obvious home for the new file); a
bad one makes every change a scavenger hunt and every PR a placement debate. And structure
compounds: each misplaced file makes the next misplacement look normal.

## Screaming architecture

The top level of a repo should tell a newcomer what the system *does* before it tells them
what it's *built with*.

```
# ❌ framework screams, domain hides
src/controllers/  src/services/  src/models/  src/helpers/  src/validators/

# ✅ domain screams
src/payments/  src/invoicing/  src/onboarding/  src/catalog/  src/app/  src/lib/
```

The first tree answers "what kind of files exist" — useless. The second answers "what does
this product do and where does the invoicing bug live" — the question people actually have.

## Package by feature, layers inside

**Feature-first** means one business capability = one folder, holding all its kinds of code.
Layers don't disappear — they move inside:

```
src/payments/
  api.ts          # or routes/, handlers/ — the boundary in
  service.ts      # the logic
  store.ts        # persistence
  types.ts
  payments.test.ts
  index.ts        # the public API of the feature
```

Why feature-first wins for app code:

- **A change is local.** "Add refunds" touches `payments/`, not five sibling trees.
- **Fan-in is visible.** Everything importing `payments/` is importing the feature —
  greppable, lintable, deletable as a unit.
- **Deletion is honest.** Kill the feature, delete the folder. Layer-smeared features leave
  orphans in every layer.

When a *layer* folder is correct: the kind is genuinely cross-cutting and domain-free — a
design-system `ui/`, `config/`, framework wiring in `app/`. The test: if deleting any one
feature wouldn't shrink this folder, it's a real layer.

## Colocation

Things that change together live together. Tests next to the code they test (unit level),
styles next to their component, a hook used by one component inside that component's folder.
Distance is friction: a test three directories away is a test that doesn't get updated.

The inverse rule also holds: things that *don't* change together shouldn't be forced
together. A 2000-line folder of unrelated "shared" code couples the change cadence of
everything in it.

## Dependency direction

Draw the layers once and make imports respect them:

```
app / entrypoints  →  features  →  shared domain  →  lib (pure, generic)
```

- `lib/` imports nothing above it. If `lib/dates.ts` imports from `features/billing`, it was
  never generic — move it into billing.
- Features import each other only through the target's **public API** (its `index` /
  exported package surface), never `features/billing/internal/tax-tables`.
- One inverted import is not a nit: it silently converts "shared" into "depends on
  everything", and makes every future move of the feature a breaking change to "shared".

Enforce it mechanically — see the guard section below.

## The junk drawer

`utils/`, `common/`, `helpers/`, `misc/`, `shared/` (as a name, not a concept) grow
monotonically: nothing is ever obviously wrong there, so everything lands there. Two rules:

- **Name by content, never by exclusion.** `lib/dates.ts`, `lib/money.ts`, `lib/retry.ts` —
  each answers "what is this?" at a glance and stays searchable.
- **A file that can't be named by content doesn't belong in `lib/`** — it's feature code in
  disguise (move it into the feature) or two unrelated things (split it).

Same rule one level up: a `shared/` folder is fine as a *location* for named modules; it is a
junk drawer the moment `shared/utils.ts` appears in it.

## Depth, size, and naming

- **Shallow beats deep.** Nesting past 3–4 levels usually encodes a taxonomy ("backend >
  services > payment > stripe > api") rather than how anyone navigates. Every level must earn
  its slash by grouping things a reader actually wants grouped.
- **Split at pain, not at birth.** A folder is too big when scanning it fails (rule of thumb:
  a screenful, ~15–25 entries) or when subgroups are obvious. A folder of one file is
  ceremony unless the boundary itself matters (a feature's public root, a Go package).
- **One casing convention per ecosystem, applied totally.** Files: `kebab-case.ts`,
  `snake_case.py`, `lowercase.go` (Go package dirs: single lowercase word). Mixed casing
  breaks alphabetical grouping and, worse, bites on case-insensitive filesystems where
  `Button.tsx` → `button.tsx` is a rename git half-sees.
- **The folder name is part of every reference.** `payments/service.ts` reads better than
  `payments/payments-service.ts`; don't repeat the parent in the child (exception: when the
  ecosystem's imports drop the path, as in Go, where the *package name* is the prefix — see `12`).

## Boundaries need a mechanical guard

A structure enforced only by review comments decays at the speed of deadlines. After (or
while) establishing a layout, encode its rules in something that fails a build:

- **JS/TS:** import-boundary lint rules (e.g. ESLint import restrictions / boundary plugins)
  banning `features/* → features/*/internal` and `lib → features`.
- **Python:** `import-linter` contracts (layers, independence).
- **Go:** `internal/` — the compiler is the guard.
- **Monorepo:** workspace dependency constraints (see `13`).

Pick whatever the repo already runs; the point is that a boundary violation is a red build,
not a review nit someone may miss.

## When NOT to restructure

Restructuring taxes everyone: open branches conflict, muscle memory breaks, blame gets
riskier. It has to pay rent. Leave the structure alone when:

- **There's no verify signal.** No build/tests that pass → you cannot know what a move broke.
  Fix that first; it's the higher-leverage work anyway.
- **The pain is aesthetic.** "I'd have done it differently" is not a migration justification.
  Real pain is nameable: onboarding measured in days, "where does this go?" on every PR,
  one-line changes fanning out across the tree, merge conflicts clustering in dump files.
- **The area is hot.** Many open PRs touch it → schedule the restructure for a quiet window;
  it will conflict with every one of them.
- **It's stable and rarely touched.** Ugly-but-frozen code charges no rent. Note it; move on.
- **The team didn't agree.** A layout one person loves and five people can't predict is worse
  than a mediocre layout everyone shares. The approval gate in `01` exists for this.

## Anti-patterns

- Top-level layer folders for app code (`controllers/`, `services/`, `models/` at root).
- `utils/`/`common/`/`helpers/`/`misc/` dumping grounds; `shared/utils.ts`.
- Deep imports into another feature's internals.
- `lib/` or `shared/` importing feature code (inverted dependency).
- Taxonomy nesting: five levels deep with one folder per level.
- Parallel structures: the same kind of code living in two homes because nobody decided
  (e.g. both `src/components/` and `src/features/*/components/` holding shared UI).
- Mirroring the org chart or the framework tutorial instead of the domain.
- Restructuring for aesthetics, mid-feature, or without a passing verify command.
- A "convention" that exists only in one senior engineer's head.

## Review checklist

- [ ] Top level names the domain; a newcomer can guess what the product does from `ls`
- [ ] App code is feature-first; global layer folders are genuinely cross-cutting kinds only
- [ ] Tests/styles/local hooks colocated with what they test/style/serve
- [ ] Import direction: lib → shared → features → app; no inversions, no deep cross-feature imports
- [ ] No junk drawers; every `lib/` module named by content
- [ ] Depth ≤ ~3–4 meaningful levels; no single-file ceremony folders without a boundary reason
- [ ] One file-casing convention, applied everywhere
- [ ] Boundaries mechanically enforced (lint / compiler / workspace constraints)
- [ ] Placement rules written down where the next contributor will find them

## See also

- [`01-restructure-workflow.md`](./01-restructure-workflow.md) — getting an existing repo to this shape safely
- [`03-splitting-large-files.md`](./03-splitting-large-files.md) — when the junk drawer is one giant file: seams, facades, extraction order
- [`02-safe-moves-mechanics.md`](./02-safe-moves-mechanics.md) — the mechanics of the moves
- [`10-javascript-typescript.md`](./10-javascript-typescript.md), [`11-python.md`](./11-python.md), [`12-go.md`](./12-go.md), [`13-monorepo.md`](./13-monorepo.md) — these principles instantiated per stack
