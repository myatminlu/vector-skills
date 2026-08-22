# 02 — Safe Moves Mechanics

## TL;DR

- Git tracks renames by **content similarity**, not by `git mv` — so a commit that moves *and* rewrites a file destroys `--follow` history and blame. Moves + mechanical path fixes in one commit; rewrites never.
- The type checker catches broken imports. **Nothing catches broken strings**: Dockerfile COPYs, CI `paths:` filters, CODEOWNERS, dotted-path strings in config. Grep the census after every stage.
- Fix imports with tooling (typechecker errors, IDE/language-server rename, codemods) — hand-editing hundreds of import lines is how typos ship.
- Dynamic imports, reflection, and string-built paths are invisible to typecheckers — grep for them before planning the move.
- Shims (re-export at the old path, deprecation note, scheduled removal) buy gradual migration for paths with external consumers.

## Why it matters

The moves themselves are the easy 20%. The other 80% is everything that referenced the old
path: imports the compiler will catch, and a long tail of strings nothing will. The failures
that reach production after a restructure are almost never "the import was wrong" — they're
"CI quietly stopped running the tests because the `paths:` filter no longer matched" or "the
Docker image built fine and was missing a directory". This file is the census of that tail.

## Git: moves and history

- `git mv` is `mv` + staging — the rename lives nowhere in the object model. Git *detects*
  renames at diff/log time by content similarity. Consequence: **the commit content decides
  whether history survives**, not the command you used.
- Keep each moved file ≈ identical in its move commit. Mechanical import-path edits inside
  the moved file are fine (similarity stays high); rewriting it in the same commit drops it
  below the detection threshold — `git log --follow` dead-ends and blame points at you.
- Batch pure moves freely — one commit moving 40 untouched files keeps perfect rename
  detection for all 40.
- Case-only renames (`Button.tsx` → `button.tsx`) need two-step moves on case-insensitive
  filesystems (macOS default, Windows): `git mv Button.tsx tmp && git mv tmp button.tsx` —
  otherwise some checkouts see no change and others see a conflict.
- Some hosts' blame/history UIs are weaker than `git log --follow` — one more reason move
  commits stay pure and reviewable.

## Fix imports with tooling, not fingers

Order of preference:

1. **Language-server / IDE move-file refactor** — updates importers as part of the move
   (TS server, PyCharm/pylance, gopls). Best when moving few files.
2. **Compiler-error-driven**: move, then run the typechecker and fix exactly what it lists
   (`tsc --noEmit`, `go build ./...`, `mypy`/import errors from the test run). Best for
   batches — the error list *is* the todo list.
3. **Codemod / structured search-replace** for one-to-one path swaps across hundreds of
   files (`ts-morph`/jscodeshift scripts, or disciplined `sed` on the exact old import
   string). Always follow with the typechecker; a codemod without a verify pass is a typo
   distributor.

Never hand-walk hundreds of import lines from memory — that's the highest-typo-rate,
lowest-review-value work in the whole migration.

### What the typechecker cannot see

Grep for these **before** planning a move; each one found becomes a mapping-table note:

- Dynamic imports with computed paths: `import(`, `require(` with variables or template
  strings; `importlib.import_module(...)`; plugin loaders scanning directories.
- Reflection / registry patterns keyed by module path or class path.
- Lazy framework loading: task queues resolving `"app.tasks.send_email"`, DI containers
  configured with string class paths, ORM model discovery by module list.
- Asset references: file paths in templates, i18n loaders, `fs.readFile` relative paths,
  test fixtures loaded by path.

If a move would break one of these, the fix belongs in the same stage — and the grep that
found it belongs in the census below so the final sweep re-checks it.

## The silent-breaker census

Build this list in Phase 1 (per [`01`](./01-restructure-workflow.md)); grep it for old paths
after **every** stage. Ordered roughly by how quietly each one fails:

**Fails invisibly (worst — discovered in prod or never):**
- **CI `paths:` / `paths-ignore:` filters** — a moved folder can silently *stop triggering
  the workflow*. Tests don't fail; they stop running. Check every workflow's trigger filters.
- **CODEOWNERS** — patterns pointing at old paths silently stop requesting review.
- **Coverage / lint include-exclude globs** — moved code silently exits the checked set.
- **`.gitignore` / `.dockerignore`** — a pattern that matched the old path may now ignore
  real source (or stop ignoring generated files).
- **Scheduled/cron entries and deploy scripts** calling moved binaries or scripts by path.

**Fails at build/deploy (loud, but after merge):**
- **Dockerfile** `COPY`/`ADD`/`WORKDIR` paths; compose `build.context`, volume mounts.
- **CI steps** with `working-directory:` or explicit paths to scripts, manifests, artifacts.
- **Bundler/test configs**: tsconfig `include`/`paths`, jest `roots`/`moduleNameMapper`,
  vite/webpack aliases, pytest `testpaths`, package.json `main`/`exports`/`files`/`scripts`.
- **Serverless/platform configs**: function entry paths, `vercel.json`/`netlify.toml`
  routes and directories, Procfiles.
- **Codegen configs**: OpenAPI/GraphQL/protobuf output and input paths.

**Fails at runtime (loud, in the wrong environment):**
- **Dotted-path strings**: `"myapp.settings.prod"`, gunicorn/uvicorn `"pkg.module:app"`,
  celery includes, alembic `script_location`/`env.py` imports, Django `INSTALLED_APPS`,
  entry-point tables in `pyproject.toml`.
- **Migration/seed tooling** that discovers files by directory.

**Fails socially (nobody's build, everyone's trust):**
- README/docs code links, architecture docs, onboarding guides, editor run configs, deep
  links in issues/wikis you control.

The mechanical sweep after each stage:

```bash
# for each old path/prefix in this stage's mapping rows:
git grep -n "src/helpers" -- ':!*.lock' ':!dist' && echo "STILL REFERENCED"
```

Zero hits (or only intentional shims) is the exit criterion for the stage, alongside the
green verify run.

## Assert presence, not just absence of failure

The census catches stale references you grep for. A second class of silent breakage is
things that *stop being counted*: path-driven discovery fails open — a glob that matches
nothing is not an error, it's a green build doing less. Three cheap comparisons per stage
turn that absence into a red diff:

- **Collected-test count.** Compare the runner's collected count against the Phase-0
  baseline; a drop without deliberately deleted tests means discovery broke. Make zero-
  collected a hard failure while you're at it: no `--passWithNoTests`, pytest's exit code 5
  not swallowed by a wrapper, `go test ./...` counted rather than trusted (it prints
  `no test files` and still exits 0).
- **CI check set.** Diff the list of jobs that actually ran on the stage's PR against the
  baseline PR's list. A workflow skipped by a stale `paths:` filter shows up as *absent*,
  never as red — only a comparison sees it.
- **Artifact inventory.** When the stage touches anything a build packages, diff the file
  list inside the built artifact (`docker export ... | tar t`, `npm pack --dry-run`,
  `tar tzf dist/*`) before vs after: a pure move shows renames only; a *disappearance* is
  next month's prod incident caught in the PR.

These are one-line scripts, and they outlive the migration: keep the test-count and
check-set assertions in CI permanently and they also catch the slow version of this
failure — a team's tests drifting out of discovery over months.

## Shims: gradual migration for consumed paths

For old paths with consumers outside this migration's reach (other repos, published
packages, in-flight PRs you agreed to spare):

```ts
// old path: src/helpers/date.ts
/** @deprecated moved to src/lib/dates — remove with restructure stage 6 */
export * from '../lib/dates';
```

```python
# old path: myapp/utils/dates.py
"""Deprecated: moved to myapp.lib.dates (removal: restructure stage 6)."""
import warnings
from myapp.lib.dates import *  # noqa: F401,F403
warnings.warn("myapp.utils.dates moved to myapp.lib.dates", DeprecationWarning, stacklevel=2)
```

Go has no re-export for functions; type aliases forward types only. For Go, prefer atomic
in-repo updates (imports are cheap to fix when the compiler lists them all); a package
consumed by *other modules* is public API — moving it is a breaking release decision, not a
shim decision (see [`12`](./12-go.md)).

Shim rules (from [`01`](./01-restructure-workflow.md)): only for external consumers; every
shim carries its removal stage; the final census sweep counts remaining shims against the
plan.

## Verify loop per stage

The full exit gate for a stage, in order:

1. Recorded verify commands green (build, typecheck, tests, lint) — **and the presence
   checks above match baseline**: collected-test count, CI check set, artifact inventory
   where applicable.
2. Census grep clean for this stage's old paths.
3. Runtime smoke where the stage touched entry points or dotted-path strings — start the
   app/worker once; import-time and discovery-time failures don't show in unit tests.
4. Diff self-review: moves + mechanical path fixes only — anything else gets pulled out of
   the commit.

Then commit, stage-named. Red at any step → fix the missed mechanical reference, or revert
the stage and amend the plan (per `01`).

## Anti-patterns

- Move + rewrite in one commit ("while I'm here") — history and review both die.
- Hand-editing hundreds of imports without a typecheck pass at the end.
- Trusting green unit tests as proof after moving entry points or dotted-path strings.
- Sweeping only source files — the census exists because configs and CI are where it breaks.
- `sed` across the tree with a short pattern that also matches URLs, translations, or lockfiles.
- Case-only renames in one step.
- Deleting the old path when external repos import it (that's a breaking change, not a move).
- Leaving the census grep out of the final stage — shims and stragglers live forever.

## Review checklist

- [ ] Move commits contain moves + mechanical path fixes only; rewrites live in separate commits
- [ ] Imports fixed via tooling (LSP / typechecker-driven / codemod), verified by the typechecker
- [ ] Dynamic-import / reflection / dotted-path greps run before the plan, rechecked after moves
- [ ] Census grep after every stage: CI paths filters, CODEOWNERS, Docker, configs, docs — zero stale hits
- [ ] Presence asserted per stage: collected-test count and CI check set match baseline; artifact inventory diff shows renames only; zero-tests-collected fails the build
- [ ] Runtime smoke after stages touching entry points or discovery paths
- [ ] Case-only renames done as two-step moves
- [ ] Shims: external consumers only, deprecation-noted, removal-staged
- [ ] Per-stage commits named for their stage; no batched mega-commit

## See also

- [`01-restructure-workflow.md`](./01-restructure-workflow.md) — where these mechanics slot into the migration
- [`10-javascript-typescript.md`](./10-javascript-typescript.md) — tsconfig paths, barrels, alias configs
- [`11-python.md`](./11-python.md) — dotted-path string census, absolute imports, packaging paths
- [`12-go.md`](./12-go.md) — import paths as API, internal/ enforcement
- [`13-monorepo.md`](./13-monorepo.md) — moving code across package boundaries
