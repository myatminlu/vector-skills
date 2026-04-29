# 35 — Source of Truth & Freshness

## TL;DR

- This skill teaches **how to think and what to verify**, not which package version to install.
- Encode **engineering invariants** locally; they are stable.
- For anything that changes over time (versions, APIs, model IDs, prices, CLI flags), **verify against the installed repo first, then official docs** — never recall from memory.
- Snippets are **shape examples**, not paste-ready code. Adapt and typecheck before committing.
- When you cite a verified fact, **include the source URL or the repo path** so the user can re-verify.

## Why it matters

A skill that freezes vendor APIs, model IDs, prices, or command flags rots faster than the
repos it is meant to help. A reader copies a frozen snippet, the snippet is stale, and the
safety invariant it was meant to teach gets lost in the compile errors. The durable value
of this skill is the **decision process** — what to verify, where to verify it, and which
outcomes must hold regardless of which library version is installed.

## Durable (encode locally)

These are engineering invariants. They change slowly and are safe to encode in this skill:

- Thin controller; service owns domain decisions; repository owns persistence details.
- Every external input passes through one validation choke point.
- Object-level authorization after authentication; no client-supplied identity.
- Stable response and error contracts.
- Parameterized queries; whitelisted sort/filter fields.
- Forward-only migrations; expand/contract for destructive changes.
- Structured, redacted logs with request correlation.
- Test at boundaries; do not mock the class under test.
- Quotas and usage metering live at the gateway/boundary, not scattered across controllers.

## Volatile (verify first)

Open the installed package or official docs **before** giving concrete code, commands, or
identifiers for any of the following. When in doubt, treat the topic as volatile.

- NestJS, Express/Fastify adapter, Node, TypeScript, Jest/Vitest, OpenTelemetry, BullMQ,
  Drizzle, Prisma, TypeORM, `pg`, `ioredis`, Swagger/`@nestjs/swagger` APIs.
- Package install commands, CLI commands, migration commands, config flags, import paths.
- Cloud and provider SDKs: AWS SDK v3 (S3), GCS, Cloudflare R2, Stripe, Twilio.
- LLM SDKs: OpenAI, Anthropic, Google/Gemini, plus observability wrappers like Langfuse
  and Helicone.
- **Model IDs, model families, context windows, reasoning/thinking flags, prompt-cache
  behaviour, token-usage field names, and pricing.** This skill does not embed any of
  these — always verify against the provider's current docs.
- PostgreSQL built-in functions, extension names, version-specific SQL syntax, and lock
  behaviour.
- Browser, CORS, cookie, TLS, OWASP, and upload-security guidance.

## Source map

Use the repo first; fall back to official docs.

| Topic | Preferred source |
|---|---|
| Repo's installed versions and conventions | `package.json`, lockfile, `tsconfig.json`, existing modules |
| NestJS core APIs, pipes, guards, lifecycle, shutdown | `https://docs.nestjs.com/` |
| Node runtime features and LTS | `https://nodejs.org/` |
| TypeScript compiler/module behaviour | `https://www.typescriptlang.org/docs/` |
| Express adapter | `https://expressjs.com/` |
| Fastify adapter | `https://fastify.dev/docs/latest/` |
| PostgreSQL functions, indexes, locks | `https://www.postgresql.org/docs/current/` |
| Drizzle ORM / drizzle-kit | `https://orm.drizzle.team/` |
| Prisma | `https://www.prisma.io/docs` |
| TypeORM | `https://typeorm.io/` |
| Redis / ioredis | `https://redis.io/docs/` and `https://github.com/redis/ioredis` |
| BullMQ | `https://docs.bullmq.io/` |
| OpenTelemetry JS | `https://opentelemetry.io/docs/languages/js/` |
| `class-validator` / `class-transformer` | `https://github.com/typestack/class-validator` |
| Zod | `https://zod.dev/` |
| AWS SDK v3 (S3) | `https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/` |
| Google Cloud Storage | `https://docs.cloud.google.com/storage/docs` |
| Cloudflare R2 (S3-compatible) | `https://developers.cloudflare.com/r2/api/s3/` |
| OpenAI models / APIs | `https://platform.openai.com/docs` |
| Anthropic / Claude models / APIs | `https://platform.claude.com/docs/` |
| Gemini models / APIs | `https://ai.google.dev/gemini-api/docs` |
| Langfuse | `https://langfuse.com/docs` |
| Helicone | `https://docs.helicone.ai/` |
| OWASP guidance | `https://owasp.org/` |
| Browser / web APIs (CORS, cookies, fetch) | `https://developer.mozilla.org/` |
| Swagger / OpenAPI | `https://swagger.io/specification/` |

Prefer the repo over generic docs when the repo has pinned versions, custom wrappers, or
an established equivalent-safe pattern.

## How to answer with volatile facts

Follow these steps in order. Do **not** skip step 1.

1. **Read the repo first.** Open `package.json`/lockfile, the closest module, and any
   shared util/wrapper. The installed version and existing convention beat any external
   doc.
2. **State the invariant.** e.g. "quota is reserved before the LLM call" or "UUID default
   must exist in the target Postgres version".
3. **Verify the concrete API** against the installed package's types or the official docs
   linked above.
4. **Separate stable vs. volatile.** Make it explicit which part of your answer is durable
   advice and which part depends on the current version, model, or pricing.
5. **Cite the source.** When you give a verified fact, include the URL or repo path so the
   user can re-verify. e.g. `(verified against package.json: bullmq@5.x)` or
   `(see https://docs.nestjs.com/fundamentals/lifecycle-events)`.
6. **If you cannot verify, say so.** Do not invent model IDs, prices, command names, or
   import paths from memory. Give the decision path instead and ask the user to confirm
   the version.

### Worked example

> **Task:** "Add a BullMQ worker that retries failed jobs with backoff."
>
> 1. Repo: `package.json` shows `bullmq@^5.12.0`; `src/queue/queue.module.ts` already
>    registers a connection.
> 2. Invariant: retries must be idempotent; backoff must be capped.
> 3. Verify: open `https://docs.bullmq.io/` for v5 `Worker` options
>    (`attempts`, `backoff: { type, delay }`).
> 4. Stable advice: idempotency key on the job payload; dead-letter after N attempts.
>    Volatile: exact option names and import paths for BullMQ v5.
> 5. Cite: `(BullMQ v5 docs: https://docs.bullmq.io/, "Job options" section;
>    repo: package.json bullmq@5.12)`.
> 6. If `package.json` were missing or the major were unclear, ask which BullMQ major
>    is installed before recommending option names.

## Snippet policy

Snippets in this skill are **shape examples**, not paste-ready starter kits.

Before using one:

- Check the repo's package versions and module system (CJS vs. ESM).
- Check whether the repo already has an equivalent helper, wrapper, or convention.
- Check the official docs for current API names.
- Run typecheck, lint, and the relevant tests.

Use this language:

- "Shape:"
- "Example, adapt to your installed version:"
- "Verify the exact option names in the official docs before copying."

Avoid this language:

- "Canonical current code:"
- "Copy this unchanged:"
- Exact model names, prices, or context windows unless the task explicitly verified them
  against current docs **in this conversation**.

## Updating this skill

When a local reference goes stale:

1. Remove or generalise the volatile detail.
2. Link the source map row instead of embedding a new frozen value.
3. Keep examples symbolic when exact values change often.
4. Add an eval that checks the desired **behaviour**, not a specific vendor version
   string.

The healthy end state: the skill survives version churn because it teaches the agent
where to look and which invariant to preserve.
