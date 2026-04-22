# 29 — Code Review Checklist

## TL;DR

- A review has three outputs: **blockers**, **suggestions**, **approval (conditional on blockers)**.
- Block on: security, data-loss risk, broken non-negotiable, contract breakage. Suggest everything else.
- Cite the rule + reference file when flagging. Show the fix, don't just point.
- Read the diff end-to-end before commenting. Context comes first.

## Why it matters

Reviews are the primary gate between a mistake and production. Clear conventions convert
reviews from opinion battles into pattern matching — fast, consistent, and kind.

## Review mindset

1. **Intent first.** What is this PR trying to do? Read the description, then the tests, then the code.
2. **Correctness.** Does it do what it claims? Does it handle the unhappy paths?
3. **Security / data integrity.** Authn, authz, validation, SQL injection, PII, leaks.
4. **Consistency.** Does it follow the conventions in this skill + existing patterns in the repo?
5. **Observability.** Can we debug this in production?
6. **Tests.** Are they meaningful? Do they cover branches + edge cases?
7. **Performance.** Any N+1, unbounded list, missing index?
8. **Readability.** Will the next engineer understand this in 6 months?

## Blocker vs suggestion

| Category | Blocker | Suggestion |
|---|---|---|
| Security / auth bug | ✅ | |
| Data-loss possibility | ✅ | |
| Non-negotiable broken (see SKILL.md top-10) | ✅ | |
| Contract break without deprecation path | ✅ | |
| Missing validation on user input | ✅ | |
| Missing auth on a protected route | ✅ | |
| SQL injection / string-concat query | ✅ | |
| Business logic in controller | ✅ | |
| No test for new branching logic | ✅ | |
| Missing `Idempotency-Key` on money POST | ✅ | |
| Wrong HTTP status / envelope | ✅ | |
| Direct provider SDK instead of LLM gateway | ✅ | |
| Naming not matching convention | | ✅ |
| Extra field in DTO | | ✅ |
| Opportunity to simplify | | ✅ |
| Minor perf improvement | | ✅ |
| Docs/comment quality | | ✅ |
| Style debate | don't raise | |

## Sectional checklist

### Correctness

- [ ] PR description matches the diff
- [ ] Happy path works (verified by test or local reasoning)
- [ ] Unhappy paths handled (empty, missing, invalid, concurrent, auth failure)
- [ ] Transactions wrap multi-row / multi-table writes (`04`, `13`)
- [ ] No silent error swallow; all `catch` either recover or rethrow (`10`)

### Security

- [ ] Every route guarded; `@Public()` opt-out is deliberate (`12`, `17`)
- [ ] Object-level authorization check after authentication (`11`)
- [ ] DTO with class-validator on every input; `whitelist` + `forbidNonWhitelisted` (`09`)
- [ ] Parameterized queries only; no string-concatenation (`11`, `14`)
- [ ] Sort / filter fields whitelisted (`08`)
- [ ] Rate limiting on sensitive routes (`11`)
- [ ] No secrets in code or commits (`20`)
- [ ] No PII in logs or errors (`21`, `11`)
- [ ] Passwords via Argon2id (`12`)
- [ ] File uploads: size + type + magic-byte check (`11`)
- [ ] Webhook signatures verified + dedupe (`11`, `06`)
- [ ] Audit log for privileged actions (`11`)

### API

- [ ] URL uses plural nouns, kebab-case, versioned (`06`)
- [ ] HTTP verb + status code match meaning (`06`)
- [ ] `Idempotency-Key` on state-creating POSTs (`06`)
- [ ] Response envelope `{ data, meta, error }` consistent (`07`)
- [ ] List endpoints paginate (cursor default; offset where justified) (`08`)
- [ ] Error responses: `{ code, message, traceId }`, namespaced codes (`10`)
- [ ] Swagger decorators: `@ApiTags`, `@ApiOperation`, `@ApiResponse` per status (`25`)

### Data / DB

- [ ] Tables plural snake_case; columns snake_case (`13`)
- [ ] FKs indexed; `ON DELETE` behavior explicit (`13`, `16`)
- [ ] Timestamps `timestamptz`; soft delete where appropriate (`13`)
- [ ] Money as integer minor units; never float (`13`)
- [ ] Unique constraints respect soft delete (partial unique) (`13`)
- [ ] Migration: forward-only; single logical change; `CONCURRENTLY` for big indexes (`15`)
- [ ] No cross-module DB reads (`03`)
- [ ] Zero-downtime rollout for destructive changes (`15`)

### Code quality / structure

- [ ] Controller is thin; service has logic; repository has DB (`04`)
- [ ] Constructor DI; no `new Service()`; no static service methods (`04`)
- [ ] No `any` without a comment explaining why (`04`)
- [ ] Functions ≤ ~30 lines; early returns; no deep nesting (`04`)
- [ ] No mutation of function arguments (`04`)
- [ ] Module has clean boundary; `@Global()` only for infra (`03`)
- [ ] `index.ts` exports only the public API (`03`)
- [ ] Folder structure matches `01` (core/common/integrations/modules/events/commands)
- [ ] File and symbol names follow `02`

### Testing

- [ ] New service logic has unit tests (`23`)
- [ ] New endpoint has at least one e2e happy-path + one error-path (`23`)
- [ ] Tests mock at boundaries, not internals (`23`)
- [ ] No flaky / skipped / `only` tests committed (`23`)
- [ ] Integration tests use transaction isolation (`23`)

### Observability

- [ ] Structured logging (nestjs-pino); no `console.log` (`21`)
- [ ] Redaction covers `authorization`, `cookie`, `password`, `token` (`21`)
- [ ] Correlation `traceId` propagated through jobs + outbound HTTP (`21`, `22`)
- [ ] Custom spans / metrics for business-important operations (`22`)
- [ ] LLM calls traced through Langfuse/Helicone when applicable (`22`, `26`)

### Background jobs / events

- [ ] Handlers idempotent (`18`, `19`)
- [ ] Retries bounded with backoff; DLQ monitored (`19`)
- [ ] Event naming `subject.verb-past-tense` (`18`)
- [ ] Outbox pattern when durability needed (`18`)
- [ ] `traceId` propagated through job / event payloads (`18`, `19`)

### AI product (if applicable)

- [ ] Features call `LlmService`, not provider SDKs directly (`26`)
- [ ] Timeouts + retries + fallback configured (`26`)
- [ ] Structured output validated with Zod (`26`)
- [ ] Prompt versioned + cached where appropriate (`26`)
- [ ] Usage metered; quota enforced before the call (`28`)
- [ ] Streaming: abort on client disconnect; heartbeat; standard event types (`27`)
- [ ] Cost stored as integer minor units (`28`)

### Performance

- [ ] No N+1 (relations batch-loaded or joined) (`24`, `14`)
- [ ] List queries have matching indexes (`13`, `08`)
- [ ] `SELECT` only needed columns
- [ ] Outbound calls have timeouts (`24`, `10`)
- [ ] CPU-heavy / slow work queued, not inline (`19`)
- [ ] Streams for large payloads; no unbounded buffering (`24`)

## Reviewing the review comment

Before posting:

- Is this a blocker or a suggestion? Label it.
- Have you cited the rule / reference?
- Did you provide the fix or an example, not just "this is wrong"?
- Is the tone kind? Short, direct, not personal.

Good:
> **Blocker** — SQL string concatenation is a SQL injection risk (see `11-security.md` rule 3). Change to parameterized: `pool.query('SELECT ... WHERE email = $1', [email])`.

Bad:
> This looks wrong. Why are you doing this??

## Review flow (summary to leave)

End your review with:

```
## Blockers
1. Business logic in controller (users.controller.ts:42). Move to UserService. See 04-code-quality.md rule 1.
2. Missing auth guard on DELETE /v1/payments/:id. See 12-authentication-patterns.md.
3. No Idempotency-Key on POST /v1/payments. See 06-api-design.md "Idempotency".

## Suggestions
- Consider extracting cost calculation into a pure util (payment.service.ts:120).
- `@ApiProperty` missing on amountCents; Swagger docs will be less helpful without it.

## Approval
Approve pending blockers 1–3.
```

## Anti-patterns (bad reviews)

- Blocking on style / taste. Use linters instead.
- "Have you considered X?" without evidence X is better.
- Drive-by comments without reading the surrounding code.
- Personal attack language.
- Re-review cycling — raise all blockers in the first pass, not one per round.
- Approving without reading because the author is senior.
- Rejecting without actionable next steps.

## Code review checklist (meta — for the reviewer)

- [ ] Read PR description before code
- [ ] Read diff end-to-end before commenting
- [ ] Blockers are truly blockers (security / data / non-negotiable)
- [ ] Suggestions are helpful, not preferences
- [ ] Each comment cites the rule and offers a fix
- [ ] Overall verdict at the end (approve / request changes / comment)

## See also

- [`30-code-review-anti-patterns.md`](./30-code-review-anti-patterns.md) — what to catch
- [`31-rules-rationale-examples.md`](./31-rules-rationale-examples.md) — good vs bad snippets
- Every other reference in this skill — the citation source for review comments
