# 10 — JavaScript / TypeScript Layouts

## TL;DR

- App code is feature-first: `src/features/<name>/` (or `src/modules/`) holding that feature's components, hooks, api, types, tests; `index.ts` is its public API.
- Router-owned directories (Next.js `app/`, expo-router `app/`) are **routing trees, not homes for domain logic** — keep route files thin, domain code in features.
- Barrels (`index.ts`) only at module public boundaries. Deep-barreling everything invites circular imports, kills tree-shaking, and slows editors.
- Path aliases (`@/features/...`) for cross-module imports, relative for intra-module — and every alias must exist in *all* the configs that resolve it (tsconfig + test runner + bundler).
- NestJS repos: the target layout is owned by `nestjs-dev-guidelines` (`01-folder-structure`); this skill supplies the migration.
- File-based-routing conventions are framework-versioned — verify against the docs for the version in the repo before designing around them.

## Node service (framework-light)

For an Express/Fastify/Hono/Koa service (for NestJS see the hand-off above):

```
src/
  app/            # wiring: server setup, middleware registration, router assembly
  features/       # one folder per capability
    payments/
      routes.ts   # boundary in: parse/validate, delegate
      service.ts  # the logic
      store.ts    # persistence access
      types.ts
      payments.test.ts
      index.ts    # public API of the feature
  lib/            # pure, generic, content-named: dates.ts, money.ts, retry.ts
  config/         # env parsing/validation, typed config
  index.ts        # entrypoint: load config, build app, listen
```

Rules ([`00`](./00-structure-principles.md) instantiated):

- Cross-feature imports only via `features/<x>/index.ts` — never `features/payments/store`.
- `lib/` imports nothing from `features/` or `app/`.
- Multiple entry points (server + worker + CLI) → `src/entrypoints/` (or `apps/` in a
  monorepo, see [`13`](./13-monorepo.md)); each entrypoint is thin wiring over the same features.

## React SPA (Vite et al.)

```
src/
  app/            # providers, router config, global styles, app shell
  features/
    invoicing/
      components/ # feature-private components
      hooks/
      api.ts      # server communication for this feature
      types.ts
      index.ts
  components/     # ONLY genuinely shared, domain-free UI (design system)
  lib/            # pure utils, content-named
  main.tsx
```

- The classic failure is global type folders — `components/` (200 files), `hooks/`,
  `utils/` at top level. A component used by one feature lives in that feature; promotion
  to `src/components/` happens on the second consumer, as a deliberate move.
- Colocate: `InvoiceRow.tsx`, `InvoiceRow.test.tsx`, styles side by side.
- `src/components/` earns its existence only as a domain-free design system; the moment
  `InvoiceTable.tsx` lands there, it's a junk drawer with better branding.

## Next.js

The `app/` directory is a **routing tree owned by the framework** — file names are URL
segments and special files (`page`, `layout`, `route`, …) carry semantics. Two workable
patterns:

1. **Thin routes (default recommendation):** `app/` contains only routing files that
   import from `src/features/`. Domain code never lives in the routing tree; moving a
   feature never changes URLs, and moving a route never moves logic.
2. **Full colocation:** feature code lives beside its routes inside `app/`, using the
   framework's conventions for non-route files (private folders such as `_components/`,
   route groups such as `(marketing)/`). Workable for route-shaped apps; couples every
   code move to the URL space.

Pick one, write it down, don't mix. Route groups, private-folder rules, and `src/`-dir
support are **version-dependent — verify against the Next.js docs for the repo's version**;
design the target only after confirming.

## Expo / React Native

Same shape, same rule: with expo-router, `app/` is the routing tree — screens thin,
domain code in `src/features/`; shared UI in `src/components/`. Router conventions and
`src/` support are version-dependent — verify against the Expo docs for the repo's version.

## Barrels (`index.ts`)

A barrel is a module's public API — that is the only place it belongs:

- ✅ One barrel per feature/package boundary: `features/payments/index.ts` exporting the
  intended surface. This is what makes "imports go through the public API" greppable and
  lintable.
- ❌ Barrels in every folder, re-exporting everything: import cycles appear (A's barrel →
  B → back through A's barrel), bundlers tree-shake worse (a barrel import can pull the
  whole module graph), editors slow down, and "who actually uses this?" becomes
  unanswerable.
- A barrel re-exporting another barrel is a smell — flatten or split the boundary.

## Path aliases

- Alias for **cross-module** imports (`@/features/payments`, `@/lib/dates`); relative for
  **intra-module** (`./service`). Deep `../../..` chains are move-hostile; aliasing them
  first is a cheap pre-stage that makes the whole migration's diffs smaller.
- One alias root (`@/` → `src/`) beats an alias zoo (`@components`, `@utils`, …): fewer
  mappings to mirror, and the full path stays visible for boundary lint.
- Every resolver must agree: `tsconfig.json` `paths` **and** the test runner
  (`moduleNameMapper` or equivalent) **and** the bundler alias config. A mismatch is a
  works-in-editor-fails-in-CI bug; during restructures these configs are census entries
  ([`02`](./02-safe-moves-mechanics.md)).

## Tests

- Unit/component tests colocated: `thing.test.ts` beside `thing.ts` (same stance as
  `nestjs-dev-guidelines` `23`: spec beside impl).
- E2E lives outside `src/` (`e2e/` or `test/`) — it tests the app boundary, not a module.
- Restructure note: moving tests with their subjects is automatic under colocation; a
  separate `tests/` mirror tree doubles every mapping row and drifts — if the repo has one,
  migrating to colocation is usually worth a stage of its own.

## Migration notes for this ecosystem

- Pre-stage cheaply: introduce the alias root and boundary lint (warn mode) **before**
  moving files — imports get shorter and the moves stop churning `../../` chains.
- After each stage: `tsc --noEmit` is the todo list; then the census grep — jest/vite
  configs, `package.json` `main`/`exports`/`files`/`scripts`, Next/Expo config, CI paths.
- `package.json` `exports` of a published package are **public API**: moving files behind
  them is invisible to consumers (good — do freely); changing the export paths themselves
  is a breaking release, not a restructure stage.
- Watch dynamic `import()` with template strings and asset paths in JSX — invisible to
  `tsc`, greppable per [`02`](./02-safe-moves-mechanics.md).

## Anti-patterns

- Domain logic implemented inside route files in `app/` (either framework) — untestable
  without the router and welded to the URL space.
- Top-level `components/`+`hooks/`+`utils/` type folders as the primary structure.
- Barrels everywhere; deep imports bypassing a feature's barrel.
- Alias defined in tsconfig but not the test runner (or vice versa).
- `src/components/` accumulating domain components because promotion is frictionless.
- A `shared/` folder importing from `features/` (inverted dependency, see `00`).

## Review checklist

- [ ] Features hold their own components/hooks/api/tests; cross-feature imports via `index.ts` only
- [ ] Routing tree (`app/`) thin, or fully-colocated by explicit written convention — not mixed
- [ ] `src/components/` is domain-free design system only
- [ ] Barrels only at public boundaries; no barrel-of-barrels
- [ ] One alias root, mirrored in tsconfig + test runner + bundler
- [ ] Unit tests colocated; e2e outside `src/`
- [ ] `lib/` content-named and imports nothing above it
- [ ] Framework routing conventions verified against the repo's version docs

## See also

- [`00-structure-principles.md`](./00-structure-principles.md) — the principles these layouts instantiate
- [`01-restructure-workflow.md`](./01-restructure-workflow.md) / [`02-safe-moves-mechanics.md`](./02-safe-moves-mechanics.md) — getting there
- [`13-monorepo.md`](./13-monorepo.md) — when features grow into packages
- `nestjs-dev-guidelines` `01-folder-structure`, `03-module-design` — NestJS targets
