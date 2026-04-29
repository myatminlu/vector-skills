# 36 — Webhooks

## TL;DR

- **Verify the signature on the raw bytes** before parsing. Reject unsigned, mismatched, or stale payloads with `401`. Use the algorithm the provider documents (commonly HMAC-SHA256, but Ed25519, HMAC-SHA1, and JWT-style signatures all show up — verify per provider).
- **Dedupe on `(provider, event_id)`.** Insert-then-process; if the unique constraint fires, return `2xx` without re-running side effects.
- **Acknowledge fast.** Verify → insert → enqueue → return `2xx`. Real work runs in a background worker, not in the HTTP handler.
- **Always ack `2xx` for unhandled event types.** A `4xx` for an event you don't care about triggers infinite provider retries.
- **Never trust the body for high-stakes state.** For payments, refunds, account changes, re-fetch authoritative state from the provider's API by id, then act.
- **Resolve the tenant from the verified payload**, not from URL or query. Stale or unmapped deliveries get a `2xx` and a loud log line.
- **Log enough to forensics-check a delivery; never log the raw body, signature header, or auth header** — they may carry PII or secrets.

## Why it matters

Webhooks are the most common way external systems write into yours, and they're the most common
back-door for replay, forgery, and double-processing bugs. A weak handler quietly turns provider
retries into duplicate charges, refunds, or state flips. In multi-tenant SaaS, a routing bug also
cross-wires one customer's events into another's account.

## Verify

- **Sign over the raw request bytes**, not the parsed JSON. Some libraries reformat keys and whitespace; once that happens, the signature can't match.
- **Use the algorithm the provider documents.** HMAC-SHA256 is common (Stripe, GitHub `X-Hub-Signature-256`, Slack), but providers also use Ed25519 (Discord), HMAC-SHA1 (legacy), or JWT-style signatures. Each provider's contract is volatile — verify against their current docs, do not assume. See [`35-source-of-truth-freshness.md`](./35-source-of-truth-freshness.md).
- **Constant-time compare.** Use Node's `crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))`. The buffers must be the same length or it throws — check lengths first and fail closed if they differ. Never use `===`, `==`, or `Buffer.compare` for signatures.
- **Reject mismatches with `401`** and an empty body. Don't echo which check failed.
- **Enforce a freshness window** on the timestamp header where the provider supplies one (typically ≤ 5 minutes). This blocks replay even if a signature leaks. Tolerate small clock skew (≈ 1 minute either side) and rely on NTP-synced clocks; do not widen the window to "fix" skew.
- **Pin the secret per provider and per environment.** Rotate by adding a second active secret, accepting either, then retiring the old one. Per-tenant secrets where the provider supports them (Stripe Connect, multi-installation GitHub apps).

### NestJS-specific: raw body access

NestJS parses JSON before your handler runs. If you stringify `req.body` to verify a signature, the original bytes are already gone — formatting differences make signatures fail intermittently. Two patterns to choose from:

- **App-wide:** enable raw body at bootstrap and read it on the webhook route. *Shape:* `NestFactory.create(AppModule, { rawBody: true })`, then read `req.rawBody` (Buffer) inside the controller. Verify the option name against the installed `@nestjs/core` major before copying — see [`35-source-of-truth-freshness.md`](./35-source-of-truth-freshness.md).
- **Route-scoped:** apply a `rawBody`-preserving body-parser only on webhook routes, leaving JSON parsing on for the rest of the API. Useful when the rest of the app already relies on parsed bodies.

**Do not** apply the global `ValidationPipe` to webhook DTOs — the body is provider-shaped, not your API contract. Validate the parsed event with Zod *after* signature verification (see [`09-validation.md`](./09-validation.md)).

## Idempotency

- Persist `(provider, event_id, event_type, received_at, status)` to a `webhook_events` table with a unique index on `(provider, event_id)`.
- **Insert-then-process.** Try the insert first. If it conflicts, the event has been seen — return `2xx` without re-processing.
- Track `status` (`received → processing → done | failed`) so a provider retry that arrives while the worker is still mid-flight does not double-process, and so stuck rows can be replayed during incident recovery.
- For at-least-once providers, design every downstream effect to be idempotent on the **domain entity** (e.g., a unique constraint on `payment_id`, not just `event_id`) — providers sometimes deliver the same business event under different `event_id`s.
- **Retention.** `webhook_events` grows forever if you let it. Pick a window appropriate to the provider (30–90 days is typical for replay protection), partition by `received_at`, and prune old partitions on schedule.

## Acknowledge fast

Order: **verify → insert dedupe row → enqueue → return `2xx`.** The handler must not hold the connection while business logic runs.

- Push the actual work to your background-job runner; failures there go to a DLQ, not back to the provider — see [`19-background-jobs.md`](./19-background-jobs.md).
- Slow `2xx` responses cause provider retries, which cause duplicate work even with idempotency and waste worker capacity.
- **Always ack `2xx` for event types you don't handle.** Returning `4xx` for an "unknown" type makes the provider retry until they give up — sometimes for days. Log it, write the dedupe row, return `2xx`, move on.

## Don't trust the body

- For money, refunds, account state, and entitlement changes: re-fetch authoritative data from the provider's API by id, then act on the response.
- The webhook tells you "something changed for X" — it is not the source of truth, just a notification.
- For low-stakes events (typing indicators, read receipts, presence), trusting the body is fine. Reserve the re-fetch for state where being wrong has a financial or compliance cost.

## Multi-tenant routing

If your service is multi-tenant, every webhook delivery must resolve to exactly one tenant before any business code runs.

- **Map per-provider account id → tenant id** at integration setup and store it. Stripe `account.id`, GitHub installation id, Slack team id, etc. — whichever the provider includes in the (signed) payload.
- **Resolve the tenant from the verified payload**, never from a path parameter or query string a caller could forge.
- **Use per-tenant secrets** where the provider supports them. One leaked secret should not expose every tenant.
- **Rehydrate tenant context in the worker** before business code runs — same pattern as background jobs. See [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md).
- A delivery that doesn't map to a known tenant → `2xx` (so the provider stops retrying) plus a loud log. It is almost always a stale install, not an attack.

## Log carefully

- Log `provider`, `event_id`, `event_type`, `tenant_id`, `received_at`, `result`, `latency_ms`, `correlation_id`.
- **Never log the raw body, the signature header, or the auth header.** Configure redaction in the logger — see [`21-logging.md`](./21-logging.md).
- Tag every downstream span with the `event_id` so the full effect of one delivery is traceable across services.

## Folder placement

Two parts, two places — see [`01-folder-structure.md`](./01-folder-structure.md):

- **Signature verification + provider event types** → `integrations/<provider>/` (e.g., `integrations/stripe/stripe-webhook.client.ts`). Bytes-level concerns only.
- **Webhook controller (HTTP endpoint, dedupe, enqueue) + business handler** → `modules/<feature>/webhooks/` (e.g., `modules/billing/webhooks/stripe-webhook.controller.ts`).

## Anti-patterns

- Parsing JSON before verifying the signature (changes byte boundaries; some libs reformat).
- Comparing signatures with `===`, `==`, or `Buffer.compare` (timing oracle).
- Storing only the request body without `event_id` — can't dedupe.
- Doing work synchronously in the handler then returning `2xx` only on success — slow `2xx` triggers provider retries.
- Returning `4xx` for unhandled event types — causes infinite provider retry loops.
- Treating the webhook body as authoritative for charge amount or account state.
- Logging headers including `Authorization`, `X-Signature`, or the raw body for "debugging."
- Reading the tenant id from the URL or a query string instead of from the verified payload.
- Letting `webhook_events` grow without retention.
- Applying the global `ValidationPipe` to webhook DTOs (the body is the provider's shape, not yours).

## Review checklist

- [ ] Signature verification runs against raw bytes, before any parsing.
- [ ] Raw body is preserved on webhook routes (e.g., `rawBody: true` or route-scoped parser).
- [ ] Constant-time compare (`crypto.timingSafeEqual`) for the signature; length checked first.
- [ ] Replay window enforced on the timestamp header where supported; clock skew kept tight.
- [ ] `(provider, event_id)` uniqueness in DB; insert-then-process; `status` column tracks progress.
- [ ] Handler returns `2xx` after enqueue, not after full processing.
- [ ] Unhandled event types return `2xx` (not `4xx`).
- [ ] Authoritative state for high-stakes actions is re-fetched, not trusted from the body.
- [ ] Tenant id resolved from the verified payload, not URL/query; per-tenant secrets where available; tenant context rehydrated in the worker.
- [ ] Logs redact body, signature, and auth headers.
- [ ] DLQ exists for failed background processing.
- [ ] `webhook_events` has a documented retention/partition strategy.

## See also

- [`11-security.md`](./11-security.md) — secrets handling, OWASP signature verification, constant-time comparison
- [`19-background-jobs.md`](./19-background-jobs.md) — BullMQ workers, retries, DLQ
- [`21-logging.md`](./21-logging.md) — redaction config
- [`09-validation.md`](./09-validation.md) — Zod-parsing webhook payloads after verification
- [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md) — scoping events to tenants, rehydrating context
- [`35-source-of-truth-freshness.md`](./35-source-of-truth-freshness.md) — verifying volatile vendor API shapes
