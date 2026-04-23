---
name: nestjs-dev-guidelines
description: 'Production-grade NestJS backend standards for writing, reviewing, and evolving NestJS and Nest-style Node.js/TypeScript services like a senior backend engineer. Use this skill when the codebase already uses NestJS concepts such as modules, controllers, providers/services, DTOs, guards, pipes, or Nest-oriented folder boundaries, or when the user is explicitly designing those patterns in a NestJS app. Trigger for implementation work, refactors, PR reviews, audits, endpoint design, schema design, migrations, BullMQ jobs, observability, testing, and AI backend patterns such as LLM gateways, SSE streaming, usage metering, and quotas across files like *.module.ts, *.controller.ts, *.service.ts, DTOs, repositories, migrations, and backend integrations. Do NOT trigger for plain Express/Fastify/Hono/Koa backends unless the repo already follows Nest-style module/controller/DTO conventions, and do NOT trigger for non-Node backends or pure frontend work.'
---

# NestJS Dev Guidelines

A complete set of production-grade NestJS and Nest-style Node.js backend standards. Apply these
rules whenever working on a codebase that already uses NestJS concepts such as modules,
controllers, providers/services, DTOs, pipes, and guards, or when the task is explicitly about
designing those patterns. Think like a senior backend engineer: consistency over cleverness,
explicit over implicit, boundaries over shortcuts.

## How to use this skill

1. Before writing or reviewing code, scan `references/00-execution-discipline.md` and the
   **Non-Negotiables** below.
2. For file placement, module boundaries, or refactor decisions, use the **Decision Trees**.
3. For deep detail on a topic, open the matching `references/NN-<topic>.md` file. Each is
   self-contained: TL;DR, rules, good/bad examples, anti-patterns, and a review checklist.
4. When reviewing a PR, run through `references/29-code-review-checklist.md` + the topic
   references relevant to the diff.

## Scope and precedence

Use this section when the repo is "backend TypeScript" but not obviously a standard NestJS app.

1. **NestJS-first scope.** Apply this skill directly when the repo already uses NestJS primitives
   (`@Module`, controllers, providers/services, guards, pipes, DTOs) or when the user is asking
   you to design a NestJS solution.
2. **Plain Node backends are partial-match only.** If the repo is plain Express/Fastify/Hono/Koa
   without NestJS primitives, use only the cross-cutting guidance here (validation, contracts,
   authz, DB design, testing, observability). Do not force Nest-specific APIs, decorators, or
   folder structure onto that codebase.
3. **Protect outcomes first, tooling second.** The non-negotiables below are invariants first and
   implementation defaults second. Centralized input validation, stable response contracts,
   structured redacted logging, ownership checks, and test coverage matter more than the exact
   library used to achieve them.
4. **Follow equivalent-safe repo conventions.** If the repo already uses a different but healthy
   mechanism that preserves the same safety/property boundary (for example Zod instead of
   `class-validator`, or a repo-standard structured logger instead of `nestjs-pino`), follow the
   repo rather than rewriting it mid-task.
5. **Escalate harmful conflicts.** If the existing pattern weakens security, correctness, data
   integrity, or a stable contract, call it out explicitly and ask before normalizing or widening
   that pattern.

## Execution discipline

Apply these rules before touching NestJS-specific details. They exist to reduce the usual LLM
failure modes: silent assumptions, overbuilt code, broad refactors, and unverified fixes.

1. **Think before coding.** State assumptions. If the task is ambiguous, ask or explicitly list
   the plausible interpretations instead of silently picking one.
2. **Search before writing new code.** Check the current module first, then shared/common/core
   code for an existing util, DTO, service, guard, interceptor, repository, or pattern you can
   reuse.
3. **Fix root causes, not trigger hacks.** Do not patch broad behavior with one-off regexes,
   hardcoded phrases, or manual if/then rules unless the product requirement is literally
   deterministic rule-based routing.
4. **Prefer the smallest correct change.** No speculative flags, abstractions, helpers, config,
   or edge-case handling unless the task or codebase clearly needs them.
5. **Make surgical edits.** Touch only the lines needed for the request. Do not clean up
   unrelated code, comments, or formatting just because you are nearby.
6. **Search and update the full impact surface.** If a shared function, contract, DTO, type, or
   behavior changes, scan and update callers, tests, docs, examples, and related flows until the
   whole change is consistent.
7. **Ask before changing shared behavior.** If reusing existing code requires changing shared
   semantics, multiple callers, or a reusable contract, stop and confirm instead of silently
   widening the blast radius.
8. **Define what success looks like.** Convert vague requests into checks you can verify:
   regression test, unit test, e2e test, typecheck, lint, build, or a concrete manual check.
9. **Stop when confused.** Name the uncertainty early. Short clarifying questions are cheaper
   than rewriting the wrong code.

Open `references/00-execution-discipline.md` for the full checklist and examples.

## Non-negotiables (protect these outcomes; prefer these patterns)

Each rule has a **Why** so you can reason about edge cases instead of applying it blindly.

1. **No business logic in a controller.** Controllers validate input, delegate to a service, and
   shape the response. Nothing else.
   *Why:* controllers are thin HTTP adapters. Logic in them can't be unit-tested without booting
   the framework, and it pulls HTTP concerns into domain code. See `04-code-quality.md`.
2. **Every external input goes through a DTO.** Body, query, and param DTOs use
   `class-validator`; `ValidationPipe` is global with `whitelist: true`, `forbidNonWhitelisted:
   true`, `transform: true`.
   *Why:* DTOs are the one choke point where unknown fields, bad types, and injection payloads
   are stopped. Skipping one means you trust the client. See `09-validation.md`.
3. **Never trust the client.** Every ID from the URL is checked against the authenticated
   user/org's ownership. Filter and sort fields are whitelisted. Mass-assignment is prevented
   by `whitelist`.
   *Why:* IDOR and mass-assignment are the two most common application-level breaches. They only
   exist when code assumes "if the token is valid, the payload is fine." See `11`, `12`.
4. **One module owns its tables.** No cross-module raw DB reads. If module B needs data from
   module A, call A's service (DI) or subscribe to A's events.
   *Why:* shared table access makes every schema change a cross-team coordination problem.
   Modules become coupled through the DB instead of through APIs. See `03-module-design.md`.
5. **snake_case in the database, camelCase in code.** Tables plural, columns snake_case,
   primary keys `id`, foreign keys `<entity>_id`.
   *Why:* each ecosystem has a convention; mixing them creates a lifetime of mapping bugs and
   makes ad-hoc SQL painful. Pick the convention of the side that's hardest to change (the DB).
   See `13-database-design.md`.
6. **Responses follow one stable contract.** Single-resource success returns the object itself;
   list success returns `{ data, meta }`; errors return `{ code, message, details?, traceId }`
   with the correct HTTP status.
   *Why:* a consistent contract lets clients write one error handler and one pagination handler
   that works everywhere, and lets support triage issues by `traceId`. See `07`, `10`.
7. **Pagination is required for any list endpoint.** Choose cursor/keyset for sequential browsing
   over mutable or large data; choose offset when page-number navigation or exact totals are real
   product requirements. Both return `meta` with pagination info.
   *Why:* an unpaginated list is a latent OOM and a latent DB outage. The right pagination model
   depends on UX, consistency requirements, and scale. See `08`.
8. **Secrets come from env only — validated with Zod at boot.** No secrets in code, no secrets
   in logs. Invalid env = crash before serving traffic.
   *Why:* a missing/malformed env var caught at boot is a minor incident; caught at runtime on
   the hot path, it's a customer outage. See `20`, `11`.
9. **Structured logs, redacted.** `nestjs-pino` with JSON in prod; redact `authorization`,
   `cookie`, `set-cookie`, `password`, `token`. Correlation ID on every log line.
   *Why:* plain-text logs can't be queried at scale, and one unredacted `Authorization` header
   is a credential leak with a long tail. See `21`.
10. **Test at boundaries, not internals.** Unit-test services with mocked dependencies;
    e2e-test controllers through the HTTP layer; never mock the class under test.
    *Why:* mocking the code under test just re-asserts the mock. Tests should verify the
    contract (HTTP, DB, external calls), not the implementation. See `23`.

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
| 00 | `00-execution-discipline.md` | Think first, keep changes small, edit surgically, define success criteria, verify before claiming done |
| 01 | `01-folder-structure.md` | `src/{core,common,integrations,modules,events,commands}` — one place for each kind of code |
| 02 | `02-naming-conventions.md` | `camelCase` vars, `PascalCase` classes, `snake_case` DB, `kebab-case.ts` files, `SCREAMING_SNAKE` env |
| 03 | `03-module-design.md` | One module per bounded context; `@Global()` only for true app-wide infra |
| 04 | `04-code-quality.md` | SOLID, constructor DI, pure utils, small functions, no `any` without a reason |
| 05 | `05-thinking-decision-trees.md` | How to decide: where to put code, when to refactor, when to skip a test |
| 06 | `06-api-design.md` | REST, plural nouns, verbs match semantics, URI versioning `/v1/...`, idempotency keys |
| 07 | `07-standard-responses.md` | Single success returns a plain object; lists return `{ data, meta }`; errors return `{ code, message, details?, traceId }` |
| 08 | `08-pagination-filters-sorting.md` | Cursor/keyset for sequential browsing, offset when page numbers/exact totals are real requirements; `filter[field]=`, `sort=-createdAt`; whitelist fields |
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
| Starting any implementation or bug fix | 00, 05 |
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

- **Execution discipline before framework detail.** Small, explicit, verified changes beat fast,
  broad, clever ones.
- **Rules > style preferences.** These are rules because they prevent real bugs or pay back
  in maintainability. Style debates are not covered.
- **Consistency > cleverness.** If a repo has an established equivalent-safe pattern that differs
  from this skill, follow the repo unless the pattern is actively harmful.
- **When in doubt, keep it boring.** Boring code is easy to review, easy to onboard, and
  easy to replace. That is the point.
