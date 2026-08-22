# 11 — Python Layouts

## TL;DR

- Default to **src layout**: `src/<package>/`, tests outside the package in `tests/`, one `pyproject.toml` as the single source of packaging truth.
- Absolute imports everywhere; relative imports and `sys.path` hacks are what break silently when files move.
- Feature-first inside the package: `src/app/payments/` with its router/schemas/service together — not global `routers/`, `schemas/`, `services/` bins.
- Django is the exception that proves the rule: its **apps are the feature mechanism** — follow Django's convention instead of inventing one on top.
- Python's restructure killer is **dotted-path strings** — settings modules, `"pkg.module:app"` server targets, task includes, entry points. Census them before moving anything.
- `utils.py` is the junk drawer; `__init__.py` holds the public API or nothing.

## src layout vs flat layout

```
# src layout (default)                 # flat layout
pyproject.toml                         pyproject.toml
src/
  billing_service/                     billing_service/
    __init__.py                          __init__.py
    ...                                  ...
tests/                                 tests/
```

Why src wins: with a flat layout the package sits on `sys.path` when you run anything from
the repo root, so imports resolve against the **checkout**, not the **installed** package —
tests pass locally while packaging bugs (missing files, broken entry points, undeclared
data) ship silently. src layout forces an editable install (`pip install -e .`), so tests
exercise the same import path users get.

Flat is acceptable for a small internal app that is deployed as a checkout and never
packaged. Scripts-with-no-package (a folder of loose `.py` files sharing state via
`sys.path`) is the structure to migrate *away* from — that's step one before any finer
layout work.

## Package layout (service)

```
pyproject.toml
src/app/
  __init__.py
  main.py            # app factory / composition root
  config.py          # env parsing, typed settings
  payments/          # feature-first (00): everything payments in one place
    __init__.py      # public API of the feature
    router.py        # boundary in (FastAPI router / flask blueprint)
    schemas.py       # request/response models
    service.py
    store.py
  invoicing/
    ...
  lib/               # pure, content-named: dates.py, money.py, retry.py
tests/
  payments/
    test_service.py
  conftest.py
```

- `tests/` mirrors the package by feature and stays **outside** it — test code doesn't ship,
  and pytest discovers it without the package exporting it.
- Global `routers/` + `schemas/` + `services/` bins are the layer-first anti-pattern from
  [`00`](./00-structure-principles.md): one feature change touches three trees. Tutorials
  scaffold it; migrations undo it.
- `lib/` (or a second top-level package for a big shared surface) imports nothing from
  features. Enforce with `import-linter` contracts — Python will not stop you otherwise.

## Django: use its convention

Django apps *are* feature packages with framework support (models, migrations, admin per
app). Don't fight it and don't double-wrap it:

- One Django **app per domain feature**; app-local `models.py`/`views.py`/etc. per Django's
  own layout. Inventing `features/` on top of apps creates two competing structures.
- Project package holds settings and root urls; split settings by environment
  (`settings/base.py`, `settings/prod.py`) — selected by `DJANGO_SETTINGS_MODULE`, which is
  a **dotted-path string**: census it.
- Renaming/moving an app is a real migration: `INSTALLED_APPS`, migration dependencies, and
  app labels all reference it by dotted path. Plan it as its own stage with a runtime smoke,
  never as a drive-by.

## Imports and `__init__.py`

- **Absolute imports, always** (`from app.payments.service import charge`). Relative imports
  couple every import line to the file's own position — each move rewrites them — and behave
  differently under script-vs-module execution (`python file.py` vs `python -m`).
- No `sys.path.append` anywhere; a repo that needs it has a packaging problem to fix first.
- `__init__.py` is the feature's public API (explicit re-exports, optionally `__all__`) or
  empty. Logic in `__init__.py` runs on import — it turns "importing the package" into a
  side effect and makes moves order-sensitive.
- `import *` only in shim modules ([`02`](./02-safe-moves-mechanics.md)).
- Avoid stdlib-colliding module names (`email.py`, `logging.py`, `types.py`, `json.py`).
  At the repo root they *shadow* the stdlib — bizarre import-time failures, one of the
  quiet bug classes that moving into a named package kills — and even inside a package
  they're legal but a permanent source of human confusion.

## The dotted-path string census

Python's ecosystem wires itself with strings the typechecker never sees. Before moving
anything, grep for the old dotted path in:

- Server targets: `"app.main:app"` in gunicorn/uvicorn commands, Procfiles, Dockerfiles,
  compose files, deploy configs.
- `pyproject.toml`: `[project.scripts]` / entry points, plugin registrations, tool configs
  with package paths (coverage `source`, mypy per-module sections, setuptools package dirs).
- Task queues: celery `include`/autodiscover lists, beat schedules referencing task names
  (task names default to their dotted path — moving the module renames the task; in-flight
  queued tasks then fail: either pin explicit task names first, or drain/coordinate).
- Migrations/ORM: alembic `script_location` and `env.py` imports, Django
  `INSTALLED_APPS`/`DJANGO_SETTINGS_MODULE`/app labels.
- Anything doing `importlib.import_module(...)` or settings-driven class paths
  (`"app.auth.backends.JwtBackend"`).
- Test doubles: `mock.patch("app.services.email.send")` targets are dotted-path strings.
  They fail loudly at test time, but there will be *many* — include them in the codemod
  pass, don't fix them one red test at a time.
- Logging and observability: `dictConfig` logger keys are module paths (a stale key
  silently stops applying levels/handlers), and `__name__`-based logger names all change —
  so Sentry issue fingerprints, APM transaction names, and alerts keyed on logger/module
  names regroup or go quiet. Warn whoever is on call and re-point those alerts; "old
  issues reopening as new" after the deploy is this, not a regression.
- Pickled module paths: your own classes pickled into Redis caches or the Celery result
  backend embed their module path — after the move, unpickling raises
  `ModuleNotFoundError`, and **rollback breaks in the other direction** (new pickles
  unreadable by old code). Confirm Celery serializers are JSON (`task_serializer`,
  `accept_content`); if real pickles exist, version the cache keys at cutover.

Each hit is a mapping-table note in the plan ([`01`](./01-restructure-workflow.md)); the
post-stage sweep re-greps them. Unit tests catch none of these — the **runtime smoke**
(boot the app, start a worker) is the verify step that does.

## Migration notes

- Flat → src: move the package under `src/`, update `pyproject.toml` package discovery,
  `pip install -e .`, run the dotted-path census, boot the app. The classic failure after
  this move is code that only worked because the CWD was on `sys.path` — its imports were
  never real, and src layout is the moment they surface. Fix them; they were latent bugs.
- Tests importing package internals (`from app.payments.store import _rows`) pin your
  internals in place; part of the target design is deciding the public API tests use.
- Verify loop per stage: `pytest` + typecheck if present + `python -c "import app"` +
  census grep + boot smoke ([`02`](./02-safe-moves-mechanics.md)).
- Namespace packages (missing `__init__.py`, intentionally or not) change discovery
  semantics — decide explicitly; an accidentally missing `__init__.py` "working anyway" is
  a namespace package by accident.

## Anti-patterns

- Loose scripts sharing code via `sys.path` — pre-structural; fix packaging first.
- Global `routers/`/`schemas/`/`services/` layer bins for app code.
- `utils.py` / `helpers.py` graveyards — split into content-named `lib/` modules; when the
  graveyard is a giant single module, use the full split playbook
  ([`03-splitting-large-files.md`](./03-splitting-large-files.md): facade, extraction order,
  registration snapshots).
- Relative imports across features; any `sys.path` mutation.
- Logic in `__init__.py`; circular imports "fixed" by mid-function imports (that's a
  boundary problem — restructure the dependency, don't hide it).
- Moving a Django app or celery-task module without treating its dotted paths as API.
- Tests inside the shipped package, or tests reaching into private internals.

## Review checklist

- [ ] src layout (or an explicit, recorded reason for flat); editable install used in dev/CI
- [ ] One `pyproject.toml` as packaging truth; entry points and tool paths current
- [ ] Feature-first packages; no global layer bins; Django repos follow Django's app convention
- [ ] Absolute imports only; no `sys.path` hacks; `__init__.py` = public API or empty
- [ ] `lib/` content-named; feature→lib direction enforced (import-linter)
- [ ] Dotted-path census grepped: server targets, entry points, celery, migrations, settings
- [ ] Runtime smoke (app boot / worker start) in the per-stage verify loop
- [ ] Tests outside the package, mirroring features, using public APIs

## See also

- [`00-structure-principles.md`](./00-structure-principles.md) — feature-first, junk drawers, boundaries
- [`01-restructure-workflow.md`](./01-restructure-workflow.md) — the staged migration these notes plug into
- [`02-safe-moves-mechanics.md`](./02-safe-moves-mechanics.md) — the general census; shim module pattern
- [`03-splitting-large-files.md`](./03-splitting-large-files.md) — splitting a god module: seams, shrinking facade, cycles, TYPE_CHECKING
- [`13-monorepo.md`](./13-monorepo.md) — multi-package Python repos
