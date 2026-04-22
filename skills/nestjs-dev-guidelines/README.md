# nestjs-dev-guidelines

A Claude Code skill that turns the agent into a senior NestJS / Node.js backend engineer.

Part of [vector-skills](../README.md). For install + editing instructions, see the
parent repo's README.

## What this skill covers

- **Structure**: folder layout (`core/`, `common/`, `integrations/`, `modules/`, `events/`, `commands/`), naming (camelCase code, snake_case DB, kebab-case files, singular domain folders), module boundaries
- **Code quality**: SOLID applied, thin controllers, constructor DI, decision trees for when to refactor / add a module / skip a test
- **API design**: REST + versioning, idempotency keys, standard `{data, meta, error}` envelope, cursor + offset pagination, filter/sort whitelisting
- **Validation**: class-validator DTOs + Zod for env and runtime JSON
- **Error handling**: hybrid taxonomy (HTTP status + namespaced code + traceId), global filter, domain-error base class
- **Security**: OWASP Top 10, Argon2id passwords, parameterized SQL, rate limits, PII redaction, webhook signature verification
- **Auth**: Better Auth pattern, Bearer JWT with rotation + revocation, API keys, object-level authorization
- **Database**: Postgres schema conventions, UUIDv7, timestamptz, soft delete + partial uniques, FK indexes, cascade matrix, migrations (forward-only, zero-downtime)
- **ORM patterns**: raw pg, TypeORM, Prisma, Drizzle — side-by-side
- **Runtime**: pipelines / interceptors / guards ordering, domain events (EventEmitter2 + outbox), BullMQ jobs with idempotency + DLQ
- **Observability**: nestjs-pino structured logs with redaction, OpenTelemetry, Langfuse/Helicone for LLMs
- **Testing**: unit/integration/e2e split, transaction-isolated integration tests, ESM stub pattern
- **AI product patterns**: provider-agnostic LLM gateway, SSE streaming with abort semantics, per-call usage metering + quotas
- **Code review**: PR checklist, anti-patterns catalog (35 common mistakes), rules with rationale

## Structure

```
.
├── SKILL.md                                 Entry — triggers + rule index + decision trees
├── references/                              31 topic-per-file deep dives
│   ├── 01-folder-structure.md
│   ├── 02-naming-conventions.md
│   ├── ... 
│   ├── 29-code-review-checklist.md
│   ├── 30-code-review-anti-patterns.md
│   └── 31-rules-rationale-examples.md
└── evals/
    └── evals.json                           8 capability test prompts
```

## Validate

```bash
python3 ~/.claude/skills/skill-creator/scripts/quick_validate.py .
```
