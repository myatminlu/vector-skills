---
name: nestjs-dev-guidelines
description: Complete NestJS and Node.js backend production standards — folder structure, naming conventions, code quality, API design, database schema design, security, authentication, pagination, filtering, sorting, standard response envelopes, error handling, pipelines, interceptors, guards, validation, testing, logging, observability, background jobs, domain events, and code review rules. Use this skill every time you touch a NestJS or Node.js backend — writing new modules, controllers, services, DTOs, database schemas, migrations, creating or reviewing endpoints, designing APIs, refactoring, or acting as a senior backend engineer. Apply automatically whenever the user mentions NestJS, Nest, backend, API, controller, service, module, DTO, repository, TypeORM, Prisma, Drizzle, Postgres, pagination, validation, auth, JWT, rate limiting, code review, or asks for production-grade backend work. Also apply when building AI product backends needing LLM gateways, SSE streaming, usage metering, or cost tracking.
---

# NestJS Dev Guidelines

A complete set of production-grade NestJS and Node.js backend standards. Apply these rules
whenever working on a NestJS project — writing new code, reviewing PRs, or making architecture
decisions. Think like a senior backend engineer: consistency over cleverness, explicit over
implicit, boundaries over shortcuts.

## When to apply this skill

**Always apply** when any of these are true:
- The project has `@nestjs/*` in `package.json`, a `nest-cli.json`, or `*.module.ts` / `*.controller.ts` / `*.service.ts` files
- The user mentions NestJS, Nest, a controller, service, module, DTO, guard, pipe, interceptor
- The user asks to build, add, refactor, or review a backend feature, endpoint, or database schema
- The user asks you to act as a senior backend engineer, or asks for production-grade backend work
- The user is building an AI product backend (LLM gateway, streaming, metering)

**Also apply** when working on generic Node.js backends — most rules (naming, API design, DB
design, code review) transfer directly.

## How to use this skill

1. Before writing or reviewing code, scan the **Non-Negotiables** below.
2. For file placement, module boundaries, or refactor decisions, use the **Decision Trees**.
3. For deep detail on a topic, open the matching `references/NN-<topic>.md` file. Each is
   self-contained: TL;DR, rules, good/bad examples, anti-patterns, and a review checklist.
4. When reviewing a PR, run through `references/29-code-review-checklist.md` + the topic
   references relevant to the diff.

## Non-negotiables (top-level rules, never break these)

1. **Never put business logic in a controller.** Controllers only validate input, delegate to a
   service, and shape the response. Testable logic lives in services.
2. **Always validate external input.** Every controller that accepts a body/query/param uses a
   DTO with `class-validator` decorators, and `ValidationPipe` is global with `whitelist: true`,
   `forbidNonWhitelisted: true`, `transform: true`. See `09-validation.md`.
3. **Never trust the client.** IDs from the URL must be checked against the authenticated user's
   ownership. Filters/sorts are whitelisted. Mass-assignment is impossible due to `whitelist`.
4. **One module owns its tables.** No cross-module raw DB reads. If module B needs data from
   module A, call A's service (DI) or subscribe to A's events. See `03-module-design.md`.
5. **snake_case in the database, camelCase in code.** Tables plural, columns snake_case,
   primary keys `id`, foreign keys `<entity>_id`. See `13-database-design.md`.
6. **Every response is enveloped.** `{ data, meta?, error? }`. Errors always include
   `{ code, message, traceId }`, plus HTTP status. See `07-standard-responses.md` and
   `10-error-handling.md`.
7. **Pagination is required for any list endpoint.** Cursor-based by default, offset only when
   the product needs page numbers. Both return `meta` with pagination info.
   See `08-pagination-filters-sorting.md`.
8. **Secrets come from env only.** No secrets in code, no secrets in logs. Validate env with
   Zod at boot — fail fast. See `20-configuration.md` and `11-security.md`.
9. **Structured logs, redacted.** `nestjs-pino` with JSON in prod; redact `authorization`,
   `cookie`, `set-cookie`, `password`, `token`. Correlation ID on every log line.
   See `21-logging.md`.
10. **Test at boundaries, not internals.** Unit-test services with mocked dependencies; e2e-test
    controllers through the HTTP layer; never mock the code under test. See `23-testing.md`.

## Senior-engineer mindset (decision trees)

Full decision trees live in `references/05-thinking-decision-trees.md`. Short version:

**Where does this file go?**
- Business feature → `modules/<feature>/`
- App-wide infra (auth, redis, mail) → `core/<name>/`
- Generic utility (pipe, decorator, type) → `common/<kind>/`
- External API client (Stripe, AWS) → `integrations/<provider>/`
- CLI/CRON job → `commands/<name>.command.ts`
- Domain event publisher/listener → `events/<event-name>/`

**Should I create a new module?**
- Does it own its own DB tables? → Yes, new module.
- Does it have its own lifecycle / domain logic? → Yes, new module.
- Is it just a helper used by one module? → No, put it inside that module's `utils/`.
- Is it used by 2+ modules but owns no data? → `common/` utility.

**Should I refactor this now?**
- Am I already editing this code? → Yes, clean as you go.
- Is it blocking my current feature? → Yes, refactor minimally.
- Is it just "ugly"? → No, note it and move on.

**Should I skip the test?**
- Is it a controller? → No. E2E test always.
- Is it a service with branching logic? → No. Unit test always.
- Is it a thin pass-through (e.g., `findById`) with no logic? → Skipping is OK; the e2e test
  of the controller covers it.
- Is it a DTO / type? → No test needed; the compiler is the test.

## Rule index (one line per reference)

Read the full reference file when you need detail. The number prefix is for stable ordering.

| # | File | Rule in one line |
|---|---|---|
| 01 | `01-folder-structure.md` | `src/{core,common,integrations,modules,events,commands}` — one place for each kind of code |
| 02 | `02-naming-conventions.md` | `camelCase` vars, `PascalCase` classes, `snake_case` DB, `kebab-case.ts` files, `SCREAMING_SNAKE` env |
| 03 | `03-module-design.md` | One module per bounded context; `@Global()` only for true app-wide infra |
| 04 | `04-code-quality.md` | SOLID, constructor DI, pure utils, small functions, no `any` without a reason |
| 05 | `05-thinking-decision-trees.md` | How to decide: where to put code, when to refactor, when to skip a test |
| 06 | `06-api-design.md` | REST, plural nouns, verbs match semantics, URI versioning `/v1/...`, idempotency keys |
| 07 | `07-standard-responses.md` | `{ data, meta, error }` envelope via interceptor + filter |
| 08 | `08-pagination-filters-sorting.md` | Cursor default, offset for admin; `filter[field]=`, `sort=-createdAt`; whitelist fields |
| 09 | `09-validation.md` | class-validator DTOs + global ValidationPipe; Zod for env + runtime JSON parsing |
| 10 | `10-error-handling.md` | Hybrid taxonomy: HTTP status + namespaced code + traceId; domain errors extend `HttpException` |
| 11 | `11-security.md` | OWASP Top 10, helmet, CORS whitelist, rate limits, PII handling, SQL-injection prevention |
| 12 | `12-authentication-patterns.md` | Better Auth pattern or Bearer JWT; API keys for programmatic access; cookie > Bearer when both present |
| 13 | `13-database-design.md` | snake_case, plural tables, FK `<entity>_id`, indexes on FKs + query paths, `deleted_at`, UUIDv7 or bigint |
| 14 | `14-database-orm-patterns.md` | raw pg / TypeORM / Prisma / Drizzle — side-by-side patterns |
| 15 | `15-migrations.md` | Always forward-only in prod; no destructive changes without two-step rollout |
| 16 | `16-cascade-rules.md` | `ON DELETE CASCADE` for owned data; `RESTRICT` for shared refs; `SET NULL` for optional |
| 17 | `17-pipelines-interceptors-guards.md` | Order: Guard → Interceptor (pre) → Pipe → Handler → Interceptor (post) → Filter |
| 18 | `18-events.md` | EventEmitter2 for in-process; outbox pattern when crossing services or queues |
| 19 | `19-background-jobs.md` | BullMQ default; idempotent handlers; retries with backoff; DLQ for poison messages |
| 20 | `20-configuration.md` | `ConfigModule` global; Zod schema; fail fast on boot if env invalid |
| 21 | `21-logging.md` | nestjs-pino, JSON in prod, redact secrets, correlation ID per request |
| 22 | `22-observability.md` | OpenTelemetry traces + metrics; Langfuse/Helicone for LLM traces |
| 23 | `23-testing.md` | Unit beside impl (`*.spec.ts`); e2e in `test/`; mock at boundaries; real DB for integration |
| 24 | `24-performance.md` | Avoid N+1; size the pool; cache selectively; stream large payloads |
| 25 | `25-documentation-swagger.md` | `@ApiTags` / `@ApiOperation` / `@ApiResponse`; DTOs auto-schema via `@ApiProperty` |
| 26 | `26-ai-product-patterns.md` | LLM gateway with provider abstraction, retry, fallback, timeout |
| 27 | `27-ai-streaming-sse.md` | SSE endpoints; cancel-aware; heartbeat; Transfer-Encoding chunked |
| 28 | `28-ai-usage-metering-cost.md` | Per-call token + cost rows; aggregate per user/org/model; enforce quotas |
| 29 | `29-code-review-checklist.md` | PR review checklist across all rules above |
| 30 | `30-code-review-anti-patterns.md` | Catalog of anti-patterns with good-vs-bad snippets |
| 31 | `31-rules-rationale-examples.md` | Cross-cut rule + rationale + good/bad examples for quick reference |

## When to deep-read

| You are doing... | Open... |
|---|---|
| Starting a new feature module | 01, 03, 04 |
| Designing a new endpoint | 06, 07, 08, 09 |
| Returning errors consistently | 10 |
| Designing DB tables | 13, 14, 15, 16 |
| Adding auth to an endpoint | 11, 12, 17 |
| Adding a list endpoint | 07, 08 |
| Adding a background task | 19 |
| Writing tests | 23 |
| Adding observability | 21, 22 |
| Building an LLM feature | 26, 27, 28, 22 |
| Reviewing a PR | 29, 30, and any topic relevant to the diff |

## Code review mode

When the user asks you to review a PR, changes, or a diff:

1. Read the diff top-to-bottom first — understand intent before critiquing.
2. Walk the `29-code-review-checklist.md` — mark each item pass/fail/NA.
3. For each fail, cite the specific rule from the relevant reference file (e.g.,
   "business logic in controller — see `04-code-quality.md` rule 3").
4. Distinguish **blockers** (security, data-loss risk, non-negotiable rule broken) from
   **suggestions** (style, minor naming, optional refactor). Don't block on suggestions.
5. If you spot an anti-pattern, link to `30-code-review-anti-patterns.md` and quote the
   good version.
6. End the review with: (a) blockers (numbered), (b) suggestions (bulleted), (c) approval
   conditional on blockers being resolved.

## AI product appendix

If the project is an AI product backend (LLMs, agents, RAG, vector store, streaming, usage-
based billing), also read:
- `26-ai-product-patterns.md` — provider-agnostic LLM gateway, retry/fallback
- `27-ai-streaming-sse.md` — SSE endpoint patterns, cancel, heartbeat
- `28-ai-usage-metering-cost.md` — token + cost metering, quota enforcement
- `22-observability.md` — Langfuse/Helicone for LLM tracing

Everything else (auth, DB, error handling, testing) applies identically to AI products — the
AI bit is a module, not a framework.

## Meta

- **Rules > style preferences.** These are rules because they prevent real bugs or pay back
  in maintainability. Style debates are not covered.
- **Consistency > cleverness.** If a repo has an established pattern that differs from this
  skill, follow the repo unless the pattern is actively harmful.
- **When in doubt, keep it boring.** Boring code is easy to review, easy to onboard, and
  easy to replace. That is the point.
