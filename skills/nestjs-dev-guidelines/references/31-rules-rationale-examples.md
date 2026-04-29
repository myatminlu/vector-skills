# 31 — Rules, Rationale, Examples (Cross-Cut)

A fast reference of the most important rules with **why** they exist + a snippet of good and
bad. Use when you want the one-screen answer instead of opening the full reference file.

---

## R1 — Controller delegates; service decides

**Why:** testability and clean boundaries. Controllers are HTTP transport, not domain logic.

✅
```ts
@Post() async create(@Body() dto: CreateUserDto) { return this.users.create(dto); }
```
❌
```ts
@Post() async create(@Body() body) { /* inline logic, db calls, branching */ }
```
→ See `04`.

---

## R2 — Every input validated via DTO

**Why:** stops mass assignment, surface-area attacks, runtime crashes.

✅ DTO with class-validator + global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`.
❌ `@Body() body: any`.
→ See `09`, `11`.

---

## R3 — Parameterize every query

**Why:** SQL injection mitigation; also plan caching.

✅
```ts
pool.query('SELECT ... WHERE id = $1', [id]);
```
❌
```ts
pool.query(`SELECT ... WHERE id = '${id}'`);
```
→ See `11`, `14`.

---

## R4 — HTTP status code matches outcome

**Why:** every HTTP library expects it. Returning `200 { success: false }` confuses clients.

✅ `throw new ConflictException({ code: 'USER.EMAIL_TAKEN', message: 'That email is already registered.' })` → filter renders 409.
❌ `return res.status(200).json({ success: false, error: 'email taken' })`.
→ See `06`, `07`, `10`, `39`.

---

## R5 — Response contract is consistent

**Why:** SDK generation, consistent client handling.

✅ Single resource — the object directly, no wrapper: `{ "id": "u_1", "email": "alice@example.com", "createdAt": "..." }`.
✅ List with pagination: `{ "data": [...], "meta": { "pagination": {...} } }` (metadata shape matches the endpoint's cursor or offset model).
✅ Error: `{ "code": "X.Y", "message": "...", "details": { ... }, "traceId": "..." }` (`details` only when present).
❌ Per-endpoint shapes: `{ "result": ... }`, `{ "users": [...] }`, `{ "error": { ... } }`.
→ See `07`, `39`.

---

## R6 — Error codes are namespaced and stable

**Why:** programmatic client handling, translation, analytics.

✅ `code: 'PAYMENT.INSUFFICIENT_FUNDS'`
❌ `code: 'error_5'` or `message: 'funds'`.
→ See `10`, `39`.

---

## R7 — List endpoints paginate

**Why:** unbounded lists OOM the server. Choose cursor/keyset for sequential browsing over mutable
or large data; choose offset when numbered pages or exact totals are actual product requirements.

✅ Cursor (default for sequential browsing): `GET /payments?limit=50&cursor=...` → `{ data, meta: { pagination } }`.
✅ Offset (only when page-number UX is genuinely required): `GET /admin/users?page=3&limit=50`.
❌ `GET /payments` → `[...all of it...]`.
→ See `08`.

---

## R8 — Whitelist sort and filter fields

**Why:** prevents SQL injection, full-table scans, info leakage.

✅ Enum `PaymentStatus`; known `allowedSortFields` set.
❌ `?sort=password_hash` runs the query anyway.
→ See `08`, `11`.

---

## R9 — `snake_case` DB, `camelCase` code, `kebab-case` URLs

**Why:** reduces ambiguity; matches ecosystem norms; enforceable by convention.

✅ `users.created_at` in SQL, `user.createdAt` in TS, `/v1/organization-members` in URL.
❌ Mixed `createdAt` columns or `organizationMembers` URL.
→ See `02`, `13`.

---

## R10 — `timestamptz`, not `timestamp`

**Why:** wall-clock bugs are eternal. Stored as UTC; printed per session.

✅ `created_at timestamptz NOT NULL DEFAULT now()`
❌ `created_at timestamp NOT NULL DEFAULT now()`
→ See `13`.

---

## R11 — Money as integer minor units

**Why:** floats round badly; accumulating totals compounds the error.

✅ `amount_cents bigint`, `amountCents: number` in TS.
❌ `amount numeric(10,2)` accumulated with `+` across many rows.
→ See `13`, `24`.

---

## R12 — FK always indexed; explicit `ON DELETE`

**Why:** cascades / lookups are O(n) without indexes. Cascade semantics are invisible until delete.

✅ `REFERENCES users(id) ON DELETE CASCADE` + `CREATE INDEX idx_... ON orders (user_id)`.
❌ `REFERENCES users(id)` alone.
→ See `13`, `16`.

---

## R13 — Forward-only migrations; one change per file

**Why:** migrations that run anywhere are immutable history. Tiny diffs review faster.

✅ New migration with a single concern; big destructive changes split into deploys.
❌ Edit a shipped migration; or 3 unrelated changes bundled.
→ See `15`.

---

## R14 — Soft delete with partial unique indexes

**Why:** otherwise `UNIQUE (email)` blocks re-use after soft delete.

✅ `CREATE UNIQUE INDEX uq_users_email_active ON users (email) WHERE deleted_at IS NULL;`
❌ `CREATE UNIQUE INDEX ON users (email);` + soft-delete rows.
→ See `13`.

---

## R15 — One module owns its tables

**Why:** module boundaries collapse without this. Cross-module reads leak schema coupling.

✅ `OrderService.create` calls `PaymentService.charge` (via DI).
❌ `OrderService` does `SELECT * FROM payments` directly.
→ See `03`.

---

## R16 — `@Global()` only for infrastructure

**Why:** feature dependencies should be explicit; infra (auth, DB) is every module's.

✅ `@Global()` on `DatabaseModule`, `AuthModule`.
❌ `@Global()` on `PaymentModule`.
→ See `03`.

---

## R17 — Bearer / cookie both supported; cookie wins and fails closed

**Why:** cookies revoke instantly; Bearer may outlive sign-out until `exp`. If a browser
request has an invalid cookie, falling back to Bearer lets an injected header change identity.

✅ Guard tries cookie first; if present and invalid, returns `401`; only falls back to Bearer
when no cookie is present.
❌ Bearer-only + long `exp` + no revocation list → zombie tokens.
→ See `12`.

---

## R18 — Short access + rotating refresh + revocation

**Why:** stateless JWTs are uncancellable without it. Short access bounds damage.

✅ 15-min access, refresh rotation, hashed refresh-token storage, DB-backed revocation by user.
❌ 7-day access, raw refresh tokens in DB, no rotation, no revocation.
→ See `12`.

---

## R19 — Argon2id for passwords

**Why:** GPU-resistant; bcrypt still OK but Argon2 is the 2020s default.

✅ `await argon2.hash(pw, { memoryCost: 64*1024, timeCost: 3, parallelism: 2 })`.
❌ `md5`, `sha1`, `sha256` — none of these.
→ See `11`, `12`.

---

## R20 — Secrets in env + validated at boot

**Why:** fail fast; impossible to miss a secret; no default-secret fallbacks.

✅ Zod env schema in `main.ts`; process exits on invalid.
❌ `process.env.SECRET || 'dev-secret'`.
→ See `20`, `11`.

---

## R21 — Structured logs, redacted

**Why:** searchability; PII / secret safety.

✅ `logger.info({ userId, orderId }, 'order placed')` + pino redact config.
❌ `console.log('order for ' + user.email + ' with token ' + token)`.
→ See `21`.

---

## R22 — Every request has a traceId

**Why:** correlation across logs, traces, jobs, and support tickets.

✅ Correlation id in pino-http, propagated to outbound HTTP + job payloads.
❌ Logs without a traceId — "which of 20 signins failed?".
→ See `21`, `22`.

---

## R23 — Outbound calls have timeouts

**Why:** without it, a stuck upstream stalls the event loop.

✅ `fetch(url, { signal: AbortSignal.timeout(5000) })`.
❌ `await fetch(url)` with SDK default (often infinite).
→ See `10`, `24`.

---

## R24 — Retry 5xx / 429, not 4xx

**Why:** 4xx is client's fault — retrying can't help and can amplify.

✅ Exponential backoff on network/timeout/5xx/429; stop on 400/401/403/404.
❌ Blind retry, DoS'ing the provider on a bad API key.
→ See `10`, `19`.

---

## R25 — Background jobs are idempotent

**Why:** retries and duplicate publishers are the norm.

✅ Dedupe key, natural-key upsert, or "already processed" check.
❌ Double-send emails when the worker crashes mid-job.
→ See `19`.

---

## R26 — Events named `subject.verb-past-tense`

**Why:** events are facts, not commands. Past tense enforces it.

✅ `user.created`, `payment.captured`, `order.cancelled`.
❌ `user.create`, `payment.capture` (imperative).
→ See `18`.

---

## R27 — Webhooks: verify, dedupe, ack-fast

**Why:** webhooks are inputs from the world; same discipline as any input, plus signature,
plus retry semantics. Slow `2xx`s and `4xx`s on unhandled types both cause duplicate work.

✅ Verify signature on raw bytes (`crypto.timingSafeEqual`) → insert `(provider, event_id)` →
   enqueue → return `2xx`. Worker rehydrates tenant context and re-fetches authoritative
   state for high-stakes events.
❌ Parse first, check later; no dedupe; sync work in the handler; `4xx` for unhandled
   event types.
→ See `36`, `11`, `18`, `19`, `33`.

---

## R28 — LLM calls through a gateway

**Why:** swappable providers, uniform retry/fallback, uniform cost tracking.

✅ `this.llm.call({ model, messages, metadata })`.
❌ `new Anthropic(...).messages.create(...)` scattered across services.
→ See `26`.

---

## R29 — Validate LLM output with Zod

**Why:** LLM JSON is non-deterministic; treat as untrusted input.

✅ `SummarySchema.parse(JSON.parse(result.text))` + one repair retry.
❌ `return JSON.parse(result.text)` as typed data.
→ See `26`, `09`.

---

## R30 — Stream LLM output with abort semantics

**Why:** users want early tokens; disconnects should stop upstream to avoid waste.

✅ SSE + `req.on('close', () => abort())` + heartbeat.
❌ Buffer full completion then return; no cancel.
→ See `27`.

---

## R31 — Meter every LLM call; enforce quotas before

**Why:** LLM bills are the #1 surprise. Per-user attribution needed for abuse and billing.

✅ `llm_usage_events` row per call (even failures); `QuotaService.assertWithin` pre-call.
❌ Aggregate monthly from provider invoice; hope for the best.
→ See `28`.

---

## R32 — Tests at boundaries, not internals

**Why:** tests that mirror implementation break on refactor, which defeats their purpose.

✅ Mock `UserRepository` in `UserService.spec.ts`.
❌ Mock `UserService.prototype.privateHelper`.
→ See `23`, `04`.

---

## R33 — E2E covers happy + one error per endpoint

**Why:** smoke that the HTTP chain works; catch response-contract / auth regressions.

✅ `POST /v1/users` happy path (201) + validation failure (422).
❌ 50 e2e tests trying to replace unit tests.
→ See `23`.

---

## R34 — Integration tests use a real DB + transaction rollback

**Why:** ORMs lie about raw SQL; real DB catches quirks. Transactions give isolation cheaply.

✅ BEGIN before each test, ROLLBACK after.
❌ Mock the pool; or leave state between tests.
→ See `23`, `14`.

---

## R35 — Every Route guarded by default; `@Public()` opt-out

**Why:** defense in depth. The worst defaults leak data silently.

✅ Global `AuthGuard` via `APP_GUARD`; `@Public()` decorator for the rare open endpoint.
❌ `@UseGuards(AuthGuard)` applied per controller and sometimes forgotten.
→ See `12`, `17`.

---

## R36 — Object-level authorization after authentication

**Why:** "authenticated" is not "authorized to see this row."

✅ Service checks `row.userId === user.id` or scopes `WHERE user_id = $user`.
❌ Any logged-in user can read any row by id.
→ See `11`, `12`, `33`.

---

## R37 — Idempotency key on money-moving POSTs

**Why:** network retries; double-charges are reputation damage.

✅ Accept `Idempotency-Key`; cache request/response for 24h.
❌ `POST /payments` with no key; client retry → double charge.
→ See `06`.

---

## R38 — No PII in logs, traces, URLs, cache keys

**Why:** logs are shared; traces are third-party; URLs are in browser history. PII leaks everywhere these do.

✅ Log `userId`; cache by `userId`; URL param `/users/:id` with opaque id.
❌ Log email; cache key contains email; URL `/users?email=alice@...`.
→ See `21`, `11`.

---

## R39 — Paginate by (created_at, id) for cursor lists

**Why:** stable sort under concurrent inserts; unique at ties (timestamps collide).

✅ `ORDER BY created_at DESC, id DESC` with composite index.
❌ `ORDER BY created_at DESC` alone — ties shuffle between pages.
→ See `08`.

---

## R40 — Swagger documents every status you return

**Why:** consumers need to know what to expect. Missing `@ApiResponse(422)` means no SDK error type.

✅ `@ApiResponse({ status: 200, ... })` + `@ApiResponse({ status: 422, ... })` + every other status the handler can return.
❌ `@ApiResponse({ status: 200, ... })` only — error statuses undocumented.
→ See `25`.

---

## R41 — Tenant identity is server-derived, not client-supplied

**Why:** a client-supplied `orgId` that is trusted without a membership check is the classic cross-tenant leak. Repository-level filtering must also enforce it in case a service check is missed.

✅ `ctx.user.activeOrgId` from session/JWT; `WHERE org_id = $ctxOrg` in every tenant-scoped query.
❌ `@Body() { orgId }` passed straight through to `WHERE org_id = $orgId`.
→ See `33`, `11`, `14`.

---

## R42 — Cache invalidation is defined before the cache is added

**Why:** the cache that nobody knows how to invalidate becomes a stale-data bug with a one-year half-life. Cache is never the sole authority for money/auth/quota.

✅ `key = users:v1:${userId}`; TTL 60s + `await cache.del(key)` on write; metrics on hit/miss.
❌ `set('user:'+id, user, 3600)` with no invalidation and no metrics; quota decision read from cache only.
→ See `24a`, `24`, `11`.

---

## R43 — Liveness ≠ readiness; one shutdown coordinator

**Why:** liveness that hits the DB restarts the pod when Redis hiccups; two signal handlers race and leave resources half-closed. Drain = flip readiness → wait → close.

✅ Liveness returns 200 cheaply; readiness checks startup + deps; one `onSignal` coordinator marks readiness false, waits for LB drain, then closes pools.
❌ `/healthz` checks DB + Redis + S3; two independent `process.on('SIGTERM')` handlers both closing the app.
→ See `34`, `32`, `19`.

---

## R44 — Verify volatile facts before recommending

**Why:** versions, package APIs, model IDs, install commands, and CLI flags drift fast. Recalling them from memory is how a skill ships stale advice that breaks installs and silently picks deprecated APIs.

✅ "Let me check the lockfile / official docs before pinning a version" → cite the verified source.
❌ "Use `@nestjs/common@10` with `useFactory: ...`" recalled from memory without checking the repo or docs.
→ See `35`, `32`.

---

## R45 — Uploads go direct to the bucket; the app validates and signs

**Why:** funneling bytes through your app is the most common path for unbounded growth, RCE via crafted content, and stored XSS. Presigned uploads keep the bytes out of the request handler.

✅ Server issues a short-lived presigned `PUT` with capped size + fixed prefix + required content-type; client uploads directly; server records metadata after a HEAD confirm. Filenames are opaque internal keys.
❌ `@UseInterceptors(FileInterceptor('file'))` with no size cap, trusting `Content-Type`, writing the user-supplied filename into the storage path.
→ See `37`, `11`, `24`.

---

## R46 — Custom param decorators don't authenticate

**Why:** decorators run per request and look like extraction. Putting auth, validation, or service calls inside one hides cross-cutting logic where reviewers won't look — and ties the request shape to identity decisions that belong in guards.

✅ `@CurrentUser()` reads `request.user` populated by `AuthGuard`; throws `Unauthorized` only if the guard didn't run. Validation stays in pipes/DTOs.
❌ `@CurrentUser()` calls `usersService.findByToken(req.headers.authorization)` to authenticate inline.
→ See `38`, `12`, `09`.

---

## R47 — Webhook controller in `modules/`, signature in `integrations/`

**Why:** signature verification is bytes-level and provider-specific (raw body, HMAC, replay window) — that's the integration's job. The handler decides what the event means for the domain — that's the feature module's job. Mixing them puts business logic where SDK code lives, and vice versa.

✅ `integrations/stripe/stripe-webhook.client.ts` verifies signature on raw bytes. `modules/billing/webhooks/stripe-webhook.controller.ts` dedupes on `(provider, event_id)`, enqueues, returns `2xx`.
❌ Stripe webhook controller in `integrations/stripe/` calling DB writes; or business handler verifying signatures inline.
→ See `36`, `01`, `19`.

---

## Using this file

- During reviews: search for the letter/number (e.g., "R3") in the rule index and cite.
- During onboarding: a printable 3-page summary when the full skill is overwhelming.
- In PR descriptions: link specific rules to justify non-obvious patterns.

## See also

- [`29-code-review-checklist.md`](./29-code-review-checklist.md) — checklist form
- [`30-code-review-anti-patterns.md`](./30-code-review-anti-patterns.md) — anti-patterns catalog
- Every other reference — the deep dives behind these one-liners.
