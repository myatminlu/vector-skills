# 32 — Modern NestJS / Node Stack

## TL;DR

This file is a decision checklist for **how to evaluate a NestJS stack**, not a list of which versions to use. Version matrices age out; the durable knowledge is which knobs to check, which invariants must not break, and when to stop and verify against the source of truth.

Read this file when:

- modernizing an existing NestJS service (Node, Nest, ORM, OpenTelemetry bumps).
- bootstrapping a new NestJS service.
- reviewing a PR that touches `main.ts`, the module system, or the runtime version.

For volatile facts — current LTS, current Nest major, package versions, exact APIs — verify against official docs and the repo's lockfile. See [`35-source-of-truth-freshness.md`](./35-source-of-truth-freshness.md).

## Why version matrices are wrong here

Framework and runtime churn are the most common sources of silent drift between local, CI, and
production. Pinning a version matrix in a skill is worse than useless — it ages out before the
skill is read again, so an agent recalling it confidently recommends a Node version two LTS
cycles old. What stays durable is the decision process, and that's all this file contains.

## Durable invariants

These do not change with versions. If a change touches one of them, slow down and verify before recommending.

### Module system

- Pick one module system (CommonJS or ESM) and keep `package.json` `"type"`, tsconfig `module` and `moduleResolution`, import extensions in source, test runner config, build output, and the runtime command in CI/Docker all aligned.
- In monorepos, the same `"type"` must stay consistent across shared packages — a CJS app importing an ESM-only shared lib is a common silent breakage.
- Changing module systems is a project migration, not a drive-by cleanup.

### Bootstrap order

Preserve this conceptual order. Adapt the exact imports and APIs to the installed NestJS version and platform adapter.

1. Load observability or runtime hooks that must patch modules **before** they are imported (e.g., OpenTelemetry SDK init at the very top of the entrypoint, before any `import` of app code that should be auto-instrumented).
2. Create the Nest app. If the repo's logger is provided through DI, use the `bufferLogs: true` pattern so log output during bootstrap is captured and replayed once the DI container is ready.
3. Register global validation, filters, guards, interceptors, CORS, and security middleware in the repo's established order.
4. Register one shutdown coordinator before long startup work — never multiple signal handlers that race.
5. Run required startup checks or migrations.
6. Start listening.
7. Mark readiness only after the app can serve traffic.

### Environment and config

- Validate the full env at boot (Zod, class-validator, or repo equivalent) and crash before serving traffic when required config is missing or malformed.
- Avoid scattered `process.env` reads outside the config boundary, with one narrow exception: bootstrap-stage code that runs before `ConfigModule` loads (e.g., logger setup, OpenTelemetry exporter endpoint) may read `process.env` directly. Keep this list small and explicit.
- Use native runtime features only after confirming the chosen Node version supports them.

### Compatibility floors

- Keep framework, platform adapter, validation, logging, and OpenTelemetry package majors compatible with each other and with the installed Node major.
- Prefer existing repo conventions when they preserve the same safety invariant.

## Verification process before recommending versions

1. Inspect the repo's `package.json`, lockfile, Node version file (`.nvmrc` / `engines`), Dockerfile, and CI runtime — these tell you what is actually installed, not what is declared.
2. Check official Node, NestJS, platform adapter, ORM, and OpenTelemetry docs for current support windows.
3. Confirm whether the work is a new service or an upgrade — the constraints are different.
4. Separate risky framework/runtime upgrades from unrelated feature work so a regression is bisectable.
5. Let the lockfile pin exact patches; document intentional major-version floors in the repo, not in chat.

Do not turn this skill into a version matrix. Version matrices age faster than review heuristics.

## Common failure modes

Recognize these in code review or when an agent is about to repeat them.

- **OpenTelemetry initialized after app imports.** SDK loaded inside `bootstrap()` after `import { AppModule }` runs — auto-instrumentation silently misses HTTP, database, and queue spans. Fix: initialize OTel at the very top of the entrypoint, or in a separate `--require` / `--import` script.
- **ESM/CJS mismatch.** `package.json` is `"type": "module"` but tsconfig emits CommonJS, or Jest hoists ESM-only deps incorrectly. Symptoms: `ERR_REQUIRE_ESM`, "Cannot use import statement outside a module", or Jest `SyntaxError: Cannot use import`. Fix: pick one and align all six points in the module-system list.
- **Multiple shutdown handlers racing.** Nest's `enableShutdownHooks` plus a custom `process.on('SIGTERM')` plus a queue worker's own handler — connections close in unpredictable order. Fix: one coordinator that orchestrates everyone else's `onApplicationShutdown`.
- **Readiness flips true before migrations finish.** Liveness and readiness wired to the same probe, or readiness returns true at `app.listen()`. Fix: a readiness flag that only becomes true after migrations, warm-up queries, and required external connections have all succeeded.
- **Bundling Node + Nest + ORM upgrade into one PR.** Cannot bisect when something breaks. Fix: separate PRs, each with its own staging soak.

## Review checklist

- [ ] Exact version/command advice was verified against official docs or installed tooling, not recalled from memory.
- [ ] Runtime, build, test, and Docker/CI Node versions agree.
- [ ] `@nestjs/*` packages and platform adapter majors are compatible.
- [ ] Module system is consistent across source, build, tests, runtime, and any monorepo shared packages.
- [ ] Observability initializes before app code is imported.
- [ ] Startup work finishes before readiness is marked true.
- [ ] Only one shutdown coordinator owns process signals.
- [ ] Env validated at boot; bootstrap-stage `process.env` reads are explicit and minimal.
- [ ] Large modernization is split from unrelated feature work.

## See also

- [`34-health-shutdown.md`](./34-health-shutdown.md) — readiness and shutdown semantics
- [`15-migrations.md`](./15-migrations.md) — migration rollout discipline
- [`20-configuration.md`](./20-configuration.md) — env validation at boot
- [`35-source-of-truth-freshness.md`](./35-source-of-truth-freshness.md) — source verification rules
