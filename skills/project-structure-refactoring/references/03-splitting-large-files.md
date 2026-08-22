# 03 — Splitting Large Files

## TL;DR

- A giant file is a structure problem wearing a filename. Split it **into the repo's standard layout** (features, content-named `lib/` modules) — never into `bigfile2` / `utils_new`.
- A split is not a move: `git mv` cannot express one-file-to-many. History survives through **verbatim extraction commits** and is read back with `git blame -C -C -C`.
- Map the inside before planning: symbol-level dependency graph, module-level state audit, external-importer count per symbol. The mapping table goes down to symbols, and symbols that reference each other heavily move **together**.
- Inside one file, everything sees everything; split apart, mutual references become **import cycles** the monolith never had. Extract shared base first, leaves next, hubs last; use type-only imports for type references; a cycle is a design finding, never a reason for a grab-bag `common` module.
- Keep the original file as a **shrinking facade** that re-exports every extracted symbol from its new home — frozen by a lint rule so it only shrinks, deleted (or formalized as public API) at the end.
- Everything in [`01`](./01-restructure-workflow.md)/[`02`](./02-safe-moves-mechanics.md) still governs — approval gate, green stages, census — because a split changes **every symbol's module path**: patch targets, registrations, and serialized paths all move.

## Why it matters

God files grow because splitting them looks riskier than adding one more function — until the
file is where merge conflicts concentrate, where every feature's PR collides, where review and
navigation give up. And the fear is justified: a naive split breaks things whole-file moves
never do. Import cycles materialize, module-level singletons initialize twice or not at all,
decorator-registered routes and tasks silently vanish, and `git log --follow` dead-ends. The
migration shell is still `01`; this file is the split-specific playbook that goes inside it.

## Is this file actually too big?

Line count alone decides nothing — a cohesive 2,000-line parser can be healthier than an
800-line file mixing four domains. Split when the **symptoms** are present:

- Merge conflicts cluster in it; unrelated features keep editing it.
- "Where is X?" means scrolling, not navigating; its test file is an equal monster.
- Import-time cost or tooling pain (editor, test collection) traces to it.
- It mixes domains that change for different reasons — the real criterion.

And per [`00`](./00-structure-principles.md): not mid-feature, not without a green verify
signal, not when it's stable and rarely touched. A frozen monolith charges no rent.

## Split into the structure, not into fragments

The target of a split is the repo's standard layout — the same placement rules as any
restructure ([`00`](./00-structure-principles.md), stack files `10`–`12`):

- Domain logic → its feature package/module (`payments/`, `invoicing/`).
- Generic pure helpers → content-named `lib/` modules (`dates`, `money`, `retry`).
- Wiring (app construction, registration) → the entrypoint/app module.
- Module-level state (engine, clients) → one deliberate home each, initialized once.

`big_file_part2.py`, `api2.ts`, `helpers_from_main.go` are the failure mode: same mud,
smaller piles. **If a piece can't be named by its content, it isn't a piece yet** — keep
clustering until it can be.

One asymmetry worth knowing before planning: in **Go**, a package is a directory and files
inside it are invisible to importers — so splitting a huge `.go` file into several files in
the *same package* changes nothing for anyone and needs none of the machinery below; only
promoting pieces into new *packages* does (then it's the normal move workflow, [`12`](./12-go.md)).
In Python and JS/TS the file **is** the module, so every split changes import paths — which
is why the rest of this playbook exists.

## Seam discovery — inventory, inside one file

Commands, not memory (the `01` inventory phase, zoomed into one file):

- **Symbol census.** Top-level classes/functions/constants with line counts — language
  server outline, `ctags`, or a grep for `^(class|def|func|export)` shapes.
- **Internal reference graph.** For each symbol: which other symbols in the file reference
  it (LSP call hierarchy where available; a script over the symbol list otherwise).
  Classify each as **leaf** (references nothing internal), **mid**, or **hub** (referenced
  by many). Clusters of mutual reference are your future modules.
- **Module-level state audit.** Everything that *executes at import time*: globals and
  singletons (DB engines, HTTP clients), registry mutations, decorators with side effects
  (route/task/CLI registration), top-level statements, Go `init()`. Each one is a split
  hazard — it must end up in exactly one home, initialized exactly once, imported by
  everything that needs it.
- **External importer count per symbol.** `git grep` the named imports of this file across
  the repo: which symbols does the outside world actually use, and how much fan-in does
  each have? High-fan-in symbols move last; unimported ones are free.
- **String references at symbol level.** Patch targets (`mock.patch("app.big.fn")`,
  `jest.mock`/spies), registrations by dotted path, serialized class paths — the
  [`02`](./02-safe-moves-mechanics.md)/[`11`](./11-python.md) census, now per symbol.

## The symbol-level mapping table

Same contract as [`01`](./01-restructure-workflow.md) — total coverage, unmapped rows are
findings, approval before extraction — but rows are symbols or clusters:

```
| Symbol(s) | Target | Stage | Notes |
|---|---|---|---|
| parse_date, to_utc            | lib/dates            | 2 | leaf; 3 external importers |
| InvoiceBuilder + _render_pdf  | invoicing/pdf        | 3 | cluster — extract together |
| engine, get_session           | db (new home)        | 1 | import-time singleton: one home, init once |
| send_invoice (task)           | invoicing/tasks      | 4 | registration by decorator — snapshot check |
| _legacy_export                | (unmapped — decide)  | — | zero importers; dead? own decision |
```

**The cluster rule:** symbols that reference each other heavily move together — a tight
cluster split across two modules *is* the import cycle you'll be debugging an hour later.

## Extraction order and the cycles that materialize

- Order: **shared base first** (pure types, constants, leaf helpers) → leaves → mids →
  hubs last. Hubs moved early drag everything with them; moved last, their extraction is
  mechanical because their dependencies already left.
- When a cycle appears anyway, it's a **design finding, not a mechanics problem** — stop
  the stage (per `01`), then either extract the shared dependency into a lower
  content-named module, or invert it with an interface/protocol owned by the consumer.
  Never "solve" it with a grab-bag `types`/`common`/`shared` module — that's the junk
  drawer ([`00`](./00-structure-principles.md)) reborn at module scale. A *small,
  content-named* base module (`invoicing/model`) is fine; `common.py` is not.
- **Type-only references need no runtime import.** TS: `import type { X }`. Python:
  `if TYPE_CHECKING:` (with string/`__future__` annotations). Go: define the interface in
  the consuming package. This dissolves most "cycles" that are really just type mentions.
- Lazy/mid-function imports as a *permanent* cycle fix are the anti-pattern `11` already
  bans. As a marked, temporary bridge inside one stage — acceptable, with its removal
  stage recorded like any shim.
- What a cycle does per language, so nobody is surprised mid-stage: Python — `ImportError`
  / partially-initialized module at import time; JS/TS — one side sees `undefined` at
  runtime (bundlers won't save you); Go — compile error (the only honest one).

## The shrinking facade

The original file path keeps working for the entire migration: it becomes a facade that
re-exports every extracted symbol from its new home.

```python
# app/big.py — shrinking facade; only shrinks, never gains definitions
from app.lib.dates import parse_date, to_utc          # noqa: F401
from app.invoicing.pdf import InvoiceBuilder          # noqa: F401
```

```ts
// src/api.ts — shrinking facade
export { parseDate, toUtc } from './lib/dates';
export { InvoiceBuilder } from './invoicing/pdf';
```

Why it's the load-bearing pattern:

- **Zero call-site churn per stage.** Hundreds of importers and `mock.patch`/`jest.mock`
  targets keep resolving through the old path while extraction proceeds underneath.
- **Single definition direction.** The facade imports *from* the new homes, never the
  reverse — so module-level singletons exist once, wherever their new home is.
- **Frozen by lint, not vigilance.** Ban new definitions in the facade and (eventually)
  new imports *of* it: ruff `banned-api`, ESLint `no-restricted-imports`, `import-linter`
  contracts. A facade that can grow is a second structure — the disease being cured.
- **Endgame stages, in order:** rewrite internal importers to the new paths (codemod +
  typechecker, per `02`) → move patch targets and remaining string refs → delete the
  facade. Exception: if the old path is *published API* (a library's entry point), the
  facade graduates into a deliberate public surface — that's the shim decision of `01`
  Phase 7, with a removal or support policy, not an accident.
- **Go:** no function re-exports — the facade doesn't port. Use the package-file asymmetry
  instead: split within the package first (free), promote to sub-packages only at proven
  seams (normal move machinery).

## History: verbatim extraction commits

- Git attributes moved code by content similarity — for splits that means **extraction
  commits contain verbatim cut-paste plus facade and import lines, nothing else**.
  Improving code "while extracting" destroys attribution *and* hides behavior change in
  the least reviewable diff there is; Non-Negotiable 4 applies with more force here, not
  less. Wanted improvements go on the follow-up list for `code-implementation`.
- Post-split archaeology changes tools: `git log --follow` on an extracted file dead-ends
  at the extraction; `git blame -C -C -C` and `git log -L` trace lines back across it.
  Put that in the plan doc — the history isn't lost, it just needs `-C`.
- One cohesive cluster per stage, commit named for it:
  `restructure(3/8): extract invoicing PDF out of app.py`.

## Verify loop — split-specific additions

Everything in [`02`](./02-safe-moves-mechanics.md)'s gate (verify commands, census grep,
presence checks), plus two that exist *because* it's a split:

- **Runtime smoke every stage, not just entrypoint stages.** Import-time behavior is
  exactly what a split reshuffles — state now initializes from a different module, in a
  different order. Boot the app, start a worker, once per stage.
- **Registration snapshot.** Routes, tasks, CLI commands, plugins registered by decorator
  or import side effect were registered *because the god file got imported*. After a
  split, a module nobody imports registers nothing — the route disappears with no red
  anywhere. Snapshot the registration list at baseline (route table, task registry,
  command list) and diff it per stage, exactly like `02`'s test-count ratchet.

## Anti-patterns

- Fragments named by sequence, not content: `big2.py`, `api_rest.ts`, `helpers_old/`.
- Extract-and-improve in one commit; renaming symbols during extraction.
- A grab-bag `types`/`common` module to make cycles compile.
- Permanent mid-function imports dodging a cycle the structure should resolve.
- Splitting a hub first (maximum churn) or splitting a tight cluster apart (instant cycle).
- A facade without the lint freeze — it quietly becomes a second home.
- Ignoring registration side effects — routes/tasks silently unregistered.
- Treating it as "just one file" and skipping stages, mapping, or approval: a 30,000-line
  split is a full migration wearing a small diff's clothes.

## Review checklist

- [ ] Split justified by symptoms (conflict clustering, mixed domains), not line count alone
- [ ] Pieces land in the standard layout with content names; no sequence-named fragments
- [ ] Seam discovery done: symbol graph, state audit, external importer counts, symbol-level string census
- [ ] Mapping table at symbol level, total; clusters extracted together; unmapped rows resolved in the plan
- [ ] Order: shared base → leaves → hubs; cycles resolved by design (type-only imports, consumer-owned interfaces), no grab-bag modules
- [ ] Facade in place, single-direction, lint-frozen shrink-only; endgame stages scheduled (importers → patch targets → delete/formalize)
- [ ] Extraction commits verbatim; `blame -C -C -C` noted in the plan
- [ ] Per-stage: runtime smoke + registration snapshot diff + census grep, all green before commit
- [ ] Go repos: intra-package file split used first; new packages only at proven seams

## See also

- [`00-structure-principles.md`](./00-structure-principles.md) — where the pieces belong; junk-drawer ban
- [`01-restructure-workflow.md`](./01-restructure-workflow.md) — the migration shell: mapping, approval, stages
- [`02-safe-moves-mechanics.md`](./02-safe-moves-mechanics.md) — census, presence checks, import tooling
- [`10-javascript-typescript.md`](./10-javascript-typescript.md) / [`11-python.md`](./11-python.md) / [`12-go.md`](./12-go.md) — stack targets and hazards (dotted-path census in `11`; package-file asymmetry in `12`)
