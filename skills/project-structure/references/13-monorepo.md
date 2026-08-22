# 13 — Monorepo Patterns

## TL;DR

- A monorepo earns its keep when deployables **share code that must change atomically**. No shared code → separate repos; copy-paste drift between repos → the signal to consolidate.
- Canonical shape: `apps/` (deployables, never imported) + `packages/` (importable libraries, never deploy) + root-level tooling config.
- Dependency law: **apps → packages; packages → packages (acyclic); nothing → apps.** Declared in each package's manifest, enforced by workspace tooling — never reached via `../../` relative paths.
- A package's public API is its manifest-declared export surface; deep imports across packages re-create the big ball of mud with extra steps.
- Consolidating existing repos: import each with full history first, as-is; *then* restructure with the normal staged workflow. Two migrations, never one.
- Workspace/task tooling (pnpm/yarn/npm workspaces, Turborepo, Nx; go.work; uv workspaces) evolves fast — principles here, flags from the current docs.

## Monorepo or not

Yes, when:

- Several deployables share domain code (types, clients, UI kit) and changes must land
  **atomically** — one PR updates the shared code and every consumer, CI proves all of it.
- The same team(s) own the pieces and want one toolchain, one dependency story, one CI.
- You're already living the alternative's failure: copy-pasted modules drifting across
  repos (the `codebase-audit` duplication report across repos is exactly this evidence).

No, when:

- Teams are independent with independent release cadences and no shared code — a monorepo
  there is just a long clone with shared CI noise.
- The org can't invest in workspace tooling: past a handful of packages, "build and test
  everything on every PR" stops scaling, and affected-only task running (Turborepo/Nx/
  workspace-aware CI) becomes required infrastructure, not nice-to-have.
- One consumer, one library, both private → fold the library into the app as a module
  ([`00`](./00-structure-principles.md)); a package boundary nobody crosses is ceremony.

## The canonical shape (JS/TS shown; the shape generalizes)

```
repo/
  apps/
    web/            # deployable: Next.js app
    api/            # deployable: Node service
    worker/
  packages/
    domain/         # shared types + logic, content-named
    api-client/     # generated/hand client used by web + worker
    ui/             # design system
    config/         # shared tsconfig/eslint presets, as packages
  package.json      # workspace root: workspaces globs, repo-wide scripts
  turbo.json / nx.json / ...   # task graph config, if used
```

- **`apps/` are leaves**: they import packages and are imported by nothing. Deploy
  configs, Dockerfiles, and env handling live with their app.
- **`packages/` are libraries**: importable, versionless internally (consumed via
  `workspace:*` or equivalent), each with a manifest declaring its name, exports, and
  dependencies.
- Shared *configuration* (tsconfig base, lint presets) becomes packages too — copy-pasted
  dotfiles across packages are the same drift disease at config scale.
- Inside each app/package, the single-project rules apply unchanged
  ([`10`](./10-javascript-typescript.md)–[`12`](./12-go.md)): a monorepo is not an excuse
  for its members to be internally shapeless.

## Boundaries

- **Every cross-package import is declared** in the consumer's manifest and resolved by the
  workspace — never `import x from '../../packages/domain/src/...'`. Relative escapes
  bypass the dependency graph, break affected-detection, and weld the tree layout into
  source code.
- **Package public API = its export surface** (`exports` in package.json, `__init__.py`,
  Go package exports). Deep imports into another package's `src/` internals are the
  monorepo failure mode: every package sees every file, so nothing is private unless
  enforced — turn on the boundary lint (workspace constraint rules / import restrictions)
  as part of setup, not later.
- **No cycles.** `domain ↔ api-client` cycles make build order undefined and affected
  graphs lie. A wanted cycle means a third, lower package wants to exist.
- **Apps never import apps.** Shared behavior between two apps is a package waiting to be
  extracted.

## Task running and CI

The reason monorepo tooling exists: run only what a change affects.

- The workspace's dependency graph drives build order and cache keys; CI runs
  affected-only tasks. Without this, monorepo CI cost grows linearly with package count
  and the repo gets hated for it.
- Per-package scripts stay uniform (`build`, `test`, `lint` meaning the same thing in
  every package) so the task runner can orchestrate them generically.
- Tool specifics (Turborepo pipelines, Nx targets, pnpm filtering flags) are volatile —
  design against the concepts, verify invocations in the tool's current docs.

## Other ecosystems, same shape

- **Go**: usually **one module** per repo with `internal/` packages ([`12`](./12-go.md)) —
  Go's package system already gives monorepo ergonomics. Multiple modules + `go.work` only
  when parts genuinely version/release independently; verify workspace-mode details in
  current docs.
- **Python**: `apps/` + `libs/`, each with its own `pyproject.toml`, consumed as editable
  path/workspace dependencies (uv/poetry/pip flavors differ — verify current docs). The
  src-layout and dotted-path census rules from [`11`](./11-python.md) apply per package.
- **Mixed-language repos**: the `apps/`+`packages/` shape still holds; expect per-language
  tooling islands and keep each language's packages grouped so its toolchain has one root.

## Consolidating existing repos (the migration)

Two migrations, strictly ordered — never one:

1. **Import with history.** Bring each repo in **as-is** under `apps/<name>/` or
   `packages/<name>/`, preserving history (`git subtree add`, or filter/merge tooling for
   full-fidelity history — verify current tooling docs). Verify each still builds from its
   new location (its Dockerfile/CI paths just changed — census sweep,
   [`02`](./02-safe-moves-mechanics.md)). Commit per import.
2. **Then restructure** with the normal workflow ([`01`](./01-restructure-workflow.md)):
   de-duplicate the copy-pasted code into `packages/` stage by stage — each stage moves one
   duplicated area into a package and points every consumer at it, green and committed.

Mixing the two ("import and clean up as we go") produces the unreviewable mega-diff `01`
exists to prevent. Additional traps:

- CI consolidation is its own stage: per-repo workflows → one workspace-aware pipeline;
  every old workflow's `paths:` filters and secrets move deliberately.
- Copied-code drift means the copies **differ**: unifying them is behavior-adjacent work —
  diff the copies first; genuinely divergent logic goes to `code-implementation` as its own
  task, not silently "unified" in a move stage.
- Registry/deploy identities (published package names, image names, Procfile paths) are
  external consumers — shim or coordinate per [`01`](./01-restructure-workflow.md) Phase 7.

**Splitting** (extracting a package out to its own repo) is the mirror image: filter the
history for its paths, stand it up externally, and its old workspace path becomes a
consumed external dependency — a versioned-release decision, not a folder move.

## Anti-patterns

- Monorepo with no shared code, or shared-nothing teams sharing CI pain.
- `../../` imports across package boundaries; deep imports into another package's `src/`.
- Undeclared dependencies that happen to resolve because of hoisting — builds that work by
  accident until dependency layout changes.
- Cycles resolved by merging two packages into one giant `shared` package (junk drawer at
  package scale, see [`00`](./00-structure-principles.md)).
- Per-package divergent script names/toolchains that defeat generic task running.
- All-package CI on every PR long after affected-only was needed.
- Consolidating repos by copy-paste (history amputated) or restructuring during the import.
- One app's config/env conventions leaking into packages (packages must not know who
  deploys them).

## Review checklist

- [ ] Monorepo justified: shared code with atomic-change need (or consolidation of drifting copies)
- [ ] `apps/` deploy and are never imported; `packages/` are imported and never deploy
- [ ] Every cross-package import manifest-declared; zero `../../` boundary escapes
- [ ] Package export surfaces defined; deep-import boundary lint enforcing
- [ ] Dependency graph acyclic; apps never import apps
- [ ] Uniform per-package task names; affected-only CI wired to the graph
- [ ] Consolidations: history-preserving import stage first, restructure stages after — never mixed
- [ ] Divergent duplicate code diffed and routed to `code-implementation`, not silently unified

## See also

- [`00-structure-principles.md`](./00-structure-principles.md) — boundary and junk-drawer principles at package scale
- [`01-restructure-workflow.md`](./01-restructure-workflow.md) — the staged migration consolidation reuses
- [`02-safe-moves-mechanics.md`](./02-safe-moves-mechanics.md) — history preservation, census sweeps
- [`10`](./10-javascript-typescript.md) / [`11`](./11-python.md) / [`12`](./12-go.md) — per-language internals of each app/package
