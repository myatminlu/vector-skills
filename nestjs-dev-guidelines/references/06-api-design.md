# 06 — API Design

## TL;DR

- REST, with plural nouns for resources: `/users`, `/payments`, `/conversations/:id/messages`.
- URI versioning: `/v1/...`. Bump major version on breaking changes; never break v1 in place.
- HTTP verbs match semantics: `GET` read (safe, idempotent), `POST` create / action, `PUT` full replace (idempotent), `PATCH` partial update, `DELETE` remove (idempotent).
- Status codes match meaning — don't `200 { "error": ... }`. Use `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`, `503`.
- Idempotency key on any `POST` that creates money or side-effects: `Idempotency-Key: <uuid>`.
- `Accept`, `Content-Type`, `If-Match` — use HTTP primitives before inventing custom headers.
- All list endpoints paginate. All writes validate.

## Why it matters

A consistent API is a contract. Clients (web, mobile, partners, internal) assume behavior
from shape. Breaking the contract silently breaks consumers. A self-consistent API needs no
docs to use; an inconsistent one is bug-bait even with perfect docs.

## URL conventions

- Plural resource names: `/users`, `/orders`.
- Singular for a specific instance: `/users/:id` (`:id` is the instance of the plural).
- Nested resources when ownership is strict: `/organizations/:orgId/members`. Avoid deeper
  than two levels — if you need three, redesign.
- Kebab-case for multi-word: `/organization-members`, not `/organizationMembers`.
- Action endpoints as sub-resources: `POST /payments/:id/refund` (verb after the resource)
  for actions that don't fit CRUD.
- No verbs in plain resource URLs: `POST /users` (not `POST /createUser`).

## Versioning

```ts
// main.ts
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
});

// controller
@Controller({ path: 'users', version: '1' })
export class UserController {}

// or opt out for stable infra
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {}
```

- **Bump v1 → v2** only for breaking changes: removed fields, changed semantics, renamed keys.
- **Additive changes are non-breaking:** new optional fields, new endpoints. Ship in v1.
- **Deprecation:** mark in Swagger (`@ApiOperation({ deprecated: true })`) + `Sunset` header for 90 days before removal.

## HTTP verbs

| Verb | Purpose | Safe | Idempotent | Body |
|---|---|---|---|---|
| GET | read | ✅ | ✅ | no |
| HEAD | metadata only | ✅ | ✅ | no |
| POST | create or action | ❌ | ❌ | yes |
| PUT | full replace | ❌ | ✅ | yes |
| PATCH | partial update | ❌ | ❌ | yes |
| DELETE | remove | ❌ | ✅ | optional |

**Idempotent** means: multiple identical requests produce the same result. `PUT /users/:id`
with the same body always leaves the same row. `POST /payments` without an idempotency key does not.

## Status codes

| Code | Meaning | Use when |
|---|---|---|
| 200 | OK | Read success, sync action success |
| 201 | Created | POST that creates a resource — include `Location` header |
| 202 | Accepted | Async: queued for processing |
| 204 | No Content | DELETE success, PUT with no body |
| 301/302/303/307/308 | Redirect | Don't redirect in JSON APIs unless intentional |
| 400 | Bad Request | Malformed body, invalid JSON |
| 401 | Unauthorized | Missing/invalid auth |
| 403 | Forbidden | Authenticated, but not allowed for this resource |
| 404 | Not Found | Resource doesn't exist (or user can't see it) |
| 409 | Conflict | State conflict: duplicate email, version mismatch |
| 410 | Gone | Previously existed, permanently removed |
| 422 | Unprocessable Entity | Validation failed (syntactically OK, semantically wrong) |
| 429 | Too Many Requests | Rate limited — include `Retry-After` |
| 500 | Internal Server Error | Unhandled/unknown |
| 502 | Bad Gateway | Upstream returned garbage |
| 503 | Service Unavailable | Overloaded / maintenance — include `Retry-After` |
| 504 | Gateway Timeout | Upstream didn't respond |

**Never** return `200` with `{ "success": false, "error": ... }`. That breaks every HTTP
client library. Use the right status code.

## Idempotency

For any POST that causes side effects (create, charge, send), accept an `Idempotency-Key` header.

```
POST /v1/payments
Idempotency-Key: 5b3a7c8f-...  ← client-generated UUID
Content-Type: application/json

{ "amount": 1000, "currency": "usd" }
```

Server:
1. Look up key in `idempotency_keys` table (scope: user + route + key).
2. If present with a saved response → return the saved response (same body, same status, same headers).
3. If not → process; save request fingerprint + response; return.
4. If present with a different request body → 422 `IDEMPOTENCY.KEY_MISMATCH`.

TTL: 24h typical.

## Request / response content

- `Content-Type: application/json; charset=utf-8` for JSON.
- `Accept: application/json` — reject others with `406`.
- JSON keys are `camelCase`. Dates in ISO 8601 UTC (`2026-04-22T10:15:30.000Z`).
- Money as integers in minor units (`amountCents: 1000` = $10.00), or string decimals (`"10.00"`) — never floats.
- Enums as stable string literals (`"pending"`), not numbers.

## Standard headers

| Header | Purpose |
|---|---|
| `Authorization: Bearer <token>` | JWT or opaque token |
| `Idempotency-Key: <uuid>` | Deduplicate POST |
| `If-Match: <etag>` | Optimistic concurrency |
| `Accept-Language: <lang>` | I18n |
| `X-Request-ID: <uuid>` | Correlation (server fills if missing, echoes back) |
| `Retry-After: <seconds>` | 429 / 503 hint |

## List, filter, sort, paginate

Every collection endpoint supports:

```
GET /v1/payments?filter[status]=paid&filter[createdAfter]=2026-01-01&sort=-createdAt&limit=50&cursor=...
```

See `08-pagination-filters-sorting.md`.

## Long-running actions

- Sync if < 200ms reliably: `200 OK`.
- Async if > 200ms or external: `202 Accepted` with a `jobId` in the body and a polling endpoint or webhook.

```json
{ "data": { "jobId": "job_7a2c...", "status": "queued", "pollUrl": "/v1/jobs/job_7a2c..." } }
```

## Webhooks (outbound)

If you deliver webhooks, treat consumers as you'd like to be treated:

- POST JSON to their URL.
- Sign with HMAC (`X-Signature: sha256=...`) using a per-endpoint secret.
- Include event id, type, timestamp, resource id, and the resource snapshot.
- Retry with exponential backoff on 5xx / timeouts; dead-letter after 24h.
- Expose a replay endpoint.

See `19-background-jobs.md` for retry infrastructure.

## RESTful vs RPC

NestJS makes RPC easy (`@Post('doTheThing')`). Resist. Map to REST when possible:

| RPC | REST equivalent |
|---|---|
| `POST /createUser` | `POST /users` |
| `POST /activateUser` | `PATCH /users/:id { "isActive": true }` |
| `POST /sendInvoice` | `POST /invoices/:id/send` (action sub-resource) |
| `POST /searchUsers` | `GET /users?filter[...]` |

Action sub-resources are a compromise — use them when the action isn't a state change you can
model as `PATCH`. "send", "refund", "cancel" are fine.

## Good vs bad

### Good
```http
POST /v1/payments
Authorization: Bearer eyJ...
Idempotency-Key: 5b3a-...
Content-Type: application/json
{ "amount": 1000, "currency": "usd", "customerId": "cus_123" }

HTTP/1.1 201 Created
Location: /v1/payments/pay_abc
X-Request-ID: req_xyz
{ "data": { "id": "pay_abc", "status": "pending", "amount": 1000, ... } }
```

### Bad
```http
POST /v1/doPayment
{ "amt": "10.00", "currency": "USD", "user": 123 }

HTTP/1.1 200 OK
{ "success": false, "errorMessage": "insufficient funds", "code": -5 }
```

Issues: verb in URL, abbreviated key, float amount, wrong HTTP status, ad-hoc error code.

## Anti-patterns

- Verbs in URLs (`/getUser`, `/doAction`).
- `200 OK` with `{ "error": ... }`.
- Mixing case styles in JSON keys.
- Float amounts.
- Breaking v1 in place instead of bumping to v2.
- Nested > 2 levels (`/orgs/:a/teams/:b/projects/:c/tasks/:d`) — flatten with query params.
- Mass-assigning whole rows (`PUT /users/:id` that replaces `id`, `createdAt`).
- POST without idempotency for money.
- Single monolithic `GET /data?type=X`.
- Custom auth schemes — use `Bearer` or cookie; don't invent `X-My-Auth`.

## Code review checklist

- [ ] URL uses plural nouns, kebab-case, `/v1/...`
- [ ] HTTP verb matches semantics (GET safe, idempotent; POST creates; etc.)
- [ ] Status code matches outcome (no `200` for errors)
- [ ] Money-moving POST accepts `Idempotency-Key`
- [ ] `Location` header on 201; `Retry-After` on 429/503
- [ ] JSON keys `camelCase`, dates ISO 8601, money as ints or string decimals
- [ ] Pagination on all list endpoints (`08`)
- [ ] Request body validated via DTO (`09`)
- [ ] Response uses standard envelope (`07`)
- [ ] Errors follow error taxonomy (`10`)

## See also

- [`07-standard-responses.md`](./07-standard-responses.md) — envelope
- [`08-pagination-filters-sorting.md`](./08-pagination-filters-sorting.md) — list endpoints
- [`09-validation.md`](./09-validation.md) — DTOs
- [`10-error-handling.md`](./10-error-handling.md) — error shape
- [`25-documentation-swagger.md`](./25-documentation-swagger.md) — OpenAPI
