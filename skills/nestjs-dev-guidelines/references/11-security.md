# 11 — Security

## TL;DR

- Apply OWASP Top 10 (2021) as the mental model. One mistake — an unvalidated filter, a
  plaintext secret, a missing rate limit — can leak every user's data.
- `helmet()` on, strict CORS allow-list (never `*` with credentials), HTTPS + HSTS in prod.
- Parameterized SQL only. Never string-concatenate user input. For dynamic identifiers
  (sort/filter columns), use a server-side allow-list.
- Secrets via env, validated at boot, never committed, never logged. Production secrets come
  from a secret manager.
- Hash passwords with **Argon2id**. If migrating from bcrypt, verify-then-rehash on login.
- Compare tokens, signatures, and HMACs with `crypto.timingSafeEqual` — never `===`.
- Sign and verify webhooks against raw bytes; verify JWTs against the expected `alg` and key
  (no `alg: none`, no `kid` confusion).
- PII: minimize, segregate, encrypt at rest where it matters, redact in logs, support
  right-to-delete and export.
- Defense in depth: input validation + authN + object-level authZ + rate limit + audit log.
  Layers, not a single perimeter.

## Why it matters

Security bugs are low-frequency, high-impact. Layered controls turn "one clever attacker
wins" into "an attacker needs multiple independent mistakes to line up." Most of the rules
here are cheap when applied at the start and expensive to retrofit.

## When this file applies

Use this file whenever you:

- design or review an endpoint, especially one touching auth, money, PII, files, webhooks, or
  outbound HTTP;
- add or change a guard, pipe, interceptor, filter, or middleware;
- write or review SQL, raw queries, or any code that interpolates user input into a string;
- handle secrets, tokens, sessions, or hashed credentials;
- pick HTTP status codes for failures (cross-check `10-error-handling.md`).

For the dedicated, deeper topics, follow the explicit links rather than re-implementing the
guidance here:

| Topic | File |
|---|---|
| Auth (sessions, JWT, API keys, MFA) | [`12-authentication-patterns.md`](./12-authentication-patterns.md) |
| Input validation (DTO, Zod, sanitization) | [`09-validation.md`](./09-validation.md) |
| Webhooks (signature, replay, idempotency) | [`36-webhooks.md`](./36-webhooks.md) |
| File uploads (presigned URLs, scanning) | [`37-file-uploads.md`](./37-file-uploads.md) |
| Multi-tenant isolation (IDOR, scoping) | [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md) |
| Secrets and config validation | [`20-configuration.md`](./20-configuration.md) |
| Log redaction | [`21-logging.md`](./21-logging.md) |
| What never to leak in errors | [`10-error-handling.md`](./10-error-handling.md) |

## Agent use

When using this file in an implementation or review:

- Treat the checklist as a prompt for investigation, not a box-ticking substitute for reading
  the diff. Name the concrete exploit or failure mode.
- Separate **blockers** (data leak, auth bypass, secret exposure, injection, unsafe migration)
  from suggestions (hardening, clarity, optional defense in depth).
- Use the linked topic file for details before giving code: auth → `12`, errors → `10`,
  validation → `09`, webhooks → `36`, uploads → `37`, tenancy → `33`.
- Keep examples aligned with the repo-wide error contract: every thrown HTTP error body has
  `{ code, message }` and the global filter adds `traceId`.

## OWASP Top 10 (2021), applied

| # | Risk | Mitigation in this codebase |
|---|---|---|
| A01 | Broken access control | Guards on every route; object-level owner/tenant check in service or query; tests for authz |
| A02 | Cryptographic failures | Argon2id for passwords; TLS in transit; envelope encryption for sensitive fields at rest |
| A03 | Injection | Parameterized SQL; DTO validation; output escaping; allow-listed dynamic identifiers |
| A04 | Insecure design | Threat-model new features; default deny; fail closed |
| A05 | Security misconfiguration | Helmet; minimal CORS; debug off in prod; Swagger gated or off in prod |
| A06 | Vulnerable components | `npm audit` (or pnpm/yarn equivalent) in CI; Dependabot/Renovate; SBOM; pinned versions |
| A07 | Identification/auth failures | Rate-limited sign-in; lockout on abuse; MFA required for high-privilege roles; session revocation |
| A08 | Software and data integrity | Signed webhooks; signed releases; lockfile committed and enforced in CI |
| A09 | Security logging and monitoring failures | Structured logs; alerts on 5xx spikes, 401/403 spikes, outbound failures, audit-log gaps |
| A10 | SSRF | Allow-list outbound hosts; block private/loopback ranges; cap redirects |

## Transport + headers

```ts
// main.ts (Express adapter)
app.use(helmet({
  // tailor CSP if you serve HTML; pure JSON APIs can leave it off
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: 63_072_000,         // 2 years, in seconds
    includeSubDomains: true,
    preload: true,
  },
}));
app.use(compression());
app.enableCors({
  origin: env.ALLOWED_ORIGINS,   // exact strings only; never '*' with credentials
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-ID'],
  maxAge: 600,
});
```

- **TLS everywhere.** Terminate at the load balancer; redirect HTTP → HTTPS.
- **HSTS** via helmet, with `includeSubDomains` + `preload` once you've validated the policy.
- **Trust proxy** when behind a load balancer:
  - Express (`NestExpressApplication`): `app.set('trust proxy', 1)`.
  - Fastify (`NestFastifyApplication`): `new FastifyAdapter({ trustProxy: 1 })`.
  - Never trust raw `X-Forwarded-For`. Configure the framework to parse it via the trusted hop
    count, or read the proxy's canonical header (e.g. `True-Client-IP`, `CF-Connecting-IP`).

## Input validation (first line)

See [`09-validation.md`](./09-validation.md). The security-critical defaults:

- DTO with class-validator (or Zod, if that is the repo standard) for every controller input.
- Global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` — blocks
  mass assignment.
- Allow-list filter and sort fields. Treat anything reaching SQL as untrusted.
- Cap string lengths and array sizes to bound CPU and memory.

## SQL injection prevention

### Always parameterize

```ts
// ✅ parameterized
await pool.query(
  'SELECT * FROM users WHERE email = $1 AND tenant_id = $2',
  [email, tenantId],
);

// ❌ string-concat — injection risk
await pool.query(`SELECT * FROM users WHERE email = '${email}'`);
```

### Dynamic identifiers — allow-list

Parameters substitute values, not identifiers. If a column or table name comes from user
input (sort, filter), look it up against a fixed set:

```ts
const ALLOWED_SORT = new Set(['created_at', 'amount', 'status']);
if (!ALLOWED_SORT.has(sortField)) {
  throw new BadRequestException({
    code: 'QUERY.INVALID_SORT_FIELD',
    message: 'Sort field is not allowed.',
  });
}
// safe: server controls the string entirely
const sql = `SELECT * FROM payments ORDER BY ${sortField} DESC`;
```

### ORM usage

TypeORM, Prisma, and Drizzle parameterize when used idiomatically. Raw escapes still need
parameters: audit every `$queryRaw`, `Repository.query`, and `createQueryBuilder().where(rawString)`.

## Authentication

Defer to [`12-authentication-patterns.md`](./12-authentication-patterns.md). Security-relevant
invariants enforced from this file:

- Rate-limit sign-in, sign-up, and password reset (see Rate limiting below).
- Refresh-token rotation: each refresh invalidates the prior token.
- Session ids and refresh tokens stored only as hashes/HMACs; raw bearer secrets never live in the DB.
- Sessions tracked in DB; sign-out everywhere supported; force sign-out on password change.
- Browser cookies use the SameSite mode that matches deployment topology (`Lax`/`Strict` for
  same-site, `None; Secure` only for true cross-site) and CSRF protection on mutations.
- MFA (TOTP at minimum) **required for high-privilege roles** (admin, finance, support with
  customer-data access). Optional but recommended for everyone else.

### JWT pitfalls

- Reject `alg: none`. Pin the expected algorithm at verify time; never accept whatever the
  header says.
- For asymmetric tokens, fetch the public key by trusted reference (own JWKS, pinned issuer);
  do not let `kid` make the verifier load arbitrary keys.
- Validate `iss`, `aud`, `exp`, `nbf`, and (where applicable) `iat` against a `revoked_before`
  watermark per user.

## Authorization

- **Default deny.** New endpoints are guarded unless explicitly public via `@Public()`.
- **Object-level checks.** "Authenticated" is not "authorized." Verify the caller may act on
  this specific row, in this specific tenant.
- **RBAC / ABAC** via guards (`@Roles('admin')`) backed by DB-stored assignments — not
  hard-coded user IDs.
- **Don't cache authorization decisions** across requests without an explicit invalidation
  path. A cached "user can read X" survives role removal until the TTL expires; that is the
  cache becoming the authority. See [`24a-caching-patterns.md`](./24a-caching-patterns.md).

```ts
@Get(':id')
@UseGuards(AuthGuard)
async get(
  @Param('id') id: string,
  @CurrentUser() user: AuthUser,
) {
  // Better: enforce ownership in the query so attackers can't even probe existence.
  const payment = await this.payments.findByIdForUser(id, user.id);
  if (!payment) {
    throw new NotFoundException({
      code: 'PAYMENT.NOT_FOUND',
      message: 'Payment not found.',
    });
  }
  return payment;
}
```

If you must do the check post-fetch, use
`ForbiddenException({ code: 'AUTH.INSUFFICIENT_PERMISSION', message: '...' })`, and consider
whether `404` is more appropriate (see Error responses below).

## Rate limiting

Layered, with stricter caps on sensitive routes:

1. **Edge** (CDN / load balancer) — absorbs DDoS and obvious abuse.
2. **App global** (`@nestjs/throttler`) — e.g., 60 req/min/IP default.
3. **Sensitive routes** — sign-in, sign-up, password reset: 5 req/min/IP **and** 10 req/hour
   per email/account; lock the account on persistent abuse.
4. **Per-user / per-key quotas** — business limits: LLM calls per month, API calls per day.
   Track in DB or Redis; do not rely solely on the request-rate limiter.

```ts
// app.module.ts
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]);

// route-level override (sign-in)
@Throttle({ default: { ttl: 60_000, limit: 5 } })
@Post('sign-in')
```

Return `429` with a `Retry-After` header. Log and alert on threshold breaches.

## Secrets

- **Never in code, never in git.** `.env.example` is in the repo; the real `.env` is not.
- Validate with Zod (or repo equivalent) at boot — see [`20-configuration.md`](./20-configuration.md).
  Fail to start if a required secret is missing or malformed.
- Rotate periodically. Document rotation in `docs/OPERATIONS.md`.
- Encrypt third-party tokens (OAuth, API keys you store on behalf of users) at rest with
  envelope encryption or per-row key derivation.
- Never log secrets. Configure redaction once, centrally — see [`21-logging.md`](./21-logging.md).
- In prod, secrets come from a secret manager (AWS Secrets Manager, GCP Secret Manager,
  HashiCorp Vault) injected as env at startup.

## Password hashing

Use **Argon2id**. Tune for your environment; the values below are a reasonable starting point
for a modern server, but you must load-test before shipping — Argon2 is intentionally
expensive, and an under-resourced host will see login latency spike.

```ts
import { hash, verify } from '@node-rs/argon2';

export const ARGON_OPTS = {
  memoryCost: 65_536,   // 64 MiB
  timeCost: 3,
  parallelism: 2,
} as const;

const hashed = await hash(password, ARGON_OPTS);

// `verify` returns Promise<boolean>; it does NOT throw on a wrong password.
const ok = await verify(hashed, password);
if (!ok) {
  throw new UnauthorizedException({
    code: 'AUTH.INVALID_CREDENTIALS',
    message: 'Invalid email or password.',
  });
}
```

Tuning notes:

- OWASP's 2024 minimum is `m=19456` (≈ 19 MiB), `t=2`, `p=1`. Stronger settings cost more CPU
  and RAM per login; weaker settings are easier to brute-force offline if hashes leak.
- Pick parameters so a single login takes ~250–500 ms on production hardware. Measure under
  expected concurrent load — login storms are when this hurts.

If you inherit bcrypt, verify-then-rehash on successful login:

```ts
import * as bcrypt from 'bcrypt';
import { hash } from '@node-rs/argon2';

if (row.password_hash.startsWith('$2')) {
  if (!(await bcrypt.compare(password, row.password_hash))) {
    throw new UnauthorizedException({
      code: 'AUTH.INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
  }
  // success → upgrade to Argon2id (reuse ARGON_OPTS from above)
  const next = await hash(password, ARGON_OPTS);
  await this.repo.updatePasswordHash(row.id, next);
}
```

## Constant-time comparison

Comparing secrets, signatures, HMACs, or tokens with `===` (or `Buffer.equals`, or string
equality) leaks length and prefix-match information through timing.

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const expected = createHmac('sha256', secret).update(rawBody).digest();
const provided = Buffer.from(headerSignature, 'hex');

if (
  expected.length !== provided.length ||
  !timingSafeEqual(expected, provided)
) {
  throw new UnauthorizedException({
    code: 'WEBHOOK.SIGNATURE_INVALID',
    message: 'Webhook signature is invalid.',
  });
}
```

`timingSafeEqual` requires equal-length buffers; check length first to avoid throwing on
attacker-shaped input.

## CSRF

Cookie-based sessions are vulnerable to CSRF; token-in-`Authorization`-header flows are not
(the browser does not auto-attach them).

- Cookie sessions: enforce `SameSite=Lax` (or `Strict` for pure first-party); use
  `SameSite=None; Secure` only for true cross-site browser apps.
- For state-changing cross-origin requests, require a CSRF token (double-submit cookie or
  signed token in a custom header). Origin and Fetch Metadata checks are useful defense in
  depth, not a replacement for the token.
- Mixed mode: when both a cookie session and a Bearer token are present, [`12-authentication-patterns.md`](./12-authentication-patterns.md)
  prefers the cookie and fails closed if that cookie is invalid. Apply CSRF protection
  regardless when a cookie can authenticate the request.

## Open redirect

Any endpoint that takes a `redirect`, `next`, `return_to`, or similar URL param is a phishing
vector. Allow only:

- relative paths starting with `/` and not `//` (which would redirect to another host); and/or
- absolute URLs whose host is in a server-side allow-list.

Reject anything else with `400` — do not silently fall back to the home page if you support
deep links, because that hides the bug.

## Server-Side Request Forgery (SSRF) and outbound requests

- Allow-list destinations. Never fetch a URL that came from user input without an allow-list.
- If you must follow redirects, cap max hops (e.g. 3) and re-validate the final URL.
- Block private, loopback, link-local, and reserved ranges before issuing the request:

| Family | Block |
|---|---|
| IPv4 loopback | `127.0.0.0/8` |
| IPv4 private | `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` |
| IPv4 link-local | `169.254.0.0/16` (includes cloud metadata `169.254.169.254`) |
| IPv4 CGNAT | `100.64.0.0/10` |
| IPv4 reserved | `0.0.0.0/8`, `224.0.0.0/4`, `240.0.0.0/4` |
| IPv6 loopback | `::1/128` |
| IPv6 ULA | `fc00::/7` |
| IPv6 link-local | `fe80::/10` |
| IPv6 mapped IPv4 | `::ffff:0:0/96` (re-evaluate the embedded v4 address) |

- Resolve DNS yourself and check **all** resolved IPs against the block-list. Then connect to
  the validated IP (or use an HTTP client/agent with a custom `lookup` that returns only the
  validated address) so the library cannot silently resolve the hostname again after your
  check. Re-validate after every redirect. This closes the DNS-rebinding time-of-check /
  time-of-use gap.
- Set timeouts (see [`10-error-handling.md`](./10-error-handling.md)).
- On AWS/GCP, disable IMDSv1 on compute instances; require IMDSv2.

## ReDoS (regex denial of service)

User-controlled input fed into regex with catastrophic backtracking can hang the event loop.

- Avoid nested quantifiers and ambiguous alternations: `(a+)+`, `(a|aa)+`, `^(a|a?)+$`.
- Anchor and bound where possible (`^`, `$`, `{0,N}`).
- For complex matching, prefer a real parser or a regex engine with linear-time guarantees
  (e.g. `re2`).
- Always cap input length **before** matching.

## Prototype pollution

JSON parsers and merge utilities can be tricked into setting `__proto__`, `constructor`, or
`prototype` on `Object.prototype`.

- Validate parsed JSON via DTO/Zod and reject unknown keys (`forbidNonWhitelisted`).
- Don't deep-merge untrusted objects into trusted ones with naive utilities. Use libraries
  that strip dangerous keys (`lodash.merge` ≥ 4.17.21, or write an explicit copy).
- Never `Object.assign(target, JSON.parse(userInput))` without validation.

## PII handling

- **Minimize.** Don't collect what you don't need.
- **Segregate.** Keep PII in dedicated tables/columns; easier to access-control and to purge.
- **Encrypt at rest** for sensitive PII (government IDs, financial, health). Use envelope
  encryption with rotated KEKs.
- **Redact in normal app logs.** Never log email, phone, DOB, document number, or full IP for
  end users (mask the last octet). Log opaque `userId` instead.
- **Right to delete.** Support hard delete or anonymization via a documented job; a "soft
  deleted" row that still contains PII is not deleted.
- **Export.** Support user data export (e.g. GDPR Article 20).
- **Retention.** Define TTLs per data category; purge on schedule.

## Webhooks (inbound)

See [`36-webhooks.md`](./36-webhooks.md) for the full pattern. Security-critical points:

- Verify signature against the **raw bytes** before parsing the body. Configure the body
  parser to preserve `rawBody` (in NestJS: `NestFactory.create(AppModule, { rawBody: true })`
  or a route-scoped parser).
- Use the algorithm the provider documents (commonly HMAC-SHA256, but Ed25519 / HMAC-SHA1 /
  JWT-style also appear — verify per provider).
- Use `crypto.timingSafeEqual` to compare signatures (see Constant-time comparison); check
  buffer lengths first or it throws.
- Enforce a freshness window on the timestamp header (e.g. ≤ 5 minutes) to block replay;
  rely on NTP, do not widen the window to absorb clock skew.
- Dedupe by `(provider, event_id)` with a unique constraint; insert-then-process.
- Ack `2xx` even for unhandled event types — `4xx` causes infinite provider retries.
- For multi-tenant services, resolve the tenant id from the verified payload, never from
  URL or query.

## File uploads

See [`37-file-uploads.md`](./37-file-uploads.md). Security-critical points:

- Validate content-type **and** sniff magic bytes; never trust the client header or extension.
- Enforce size and count limits at the parser, before the controller sees the data.
- Compute `sha256`, size, and effective mime server-side; never trust client-supplied values.
- Store under an opaque, tenant-prefixed key. Never put user-supplied filenames in the storage path.
- Scan for malware before exposing to other users; readers must filter on `scan_status = 'clean'`.
- Serve via presigned URLs from a separate domain; don't proxy through the app origin.
- Strip EXIF metadata (especially location) from images uploaded by end users.
- Treat SVG as hostile (script + XXE surface) — disallow or sanitize, never serve inline from your origin.
- Rate-limit upload-initiation and finalize endpoints per user/tenant to bound storage cost and scan-queue abuse.

## Dependency hygiene

- `npm audit` (or pnpm/yarn equivalent) in CI; fail on `high`/`critical` unless tracked as an
  exception with an expiry.
- Lockfile committed and enforced (`npm ci`, `pnpm install --frozen-lockfile`).
- Dependabot or Renovate for PRs; review before merging.
- SBOM (`npm sbom`) published per release.
- Avoid unvetted packages. Check weekly downloads, last release, license, and whether the
  publisher is verified. Typosquatting is real.

## Audit logging

For sensitive actions, append-only audit trail (separate from normal application logs):

```sql
audit_log (
  id            uuid primary key,
  actor_user_id uuid,                  -- null if system
  actor_kind    text not null,         -- 'user' | 'api_key' | 'system'
  tenant_id     uuid,                  -- null if cross-tenant action
  action        text not null,         -- 'auth.sign_in', 'role.change', ...
  target_type   text,                  -- 'user', 'payment', ...
  target_id     text,
  result        text not null,         -- 'success' | 'failure'
  reason        text,                  -- short code on failure
  ip_address    inet,                  -- restricted audit log only; normal app logs mask IPs
  user_agent    text,
  request_id    text,                  -- correlates with request logs/traces
  metadata      jsonb,                 -- structured, redact secrets/PII
  created_at    timestamptz not null default now()
)
```

Log at minimum: sign-in, sign-out, password change, MFA enrol/disable, role change, refund
issued, data export, data deletion, secret/key rotation. Retain per compliance window
(typically 1 year+). Rows are insert-only; never update or delete except by retention policy.

## Error responses

- Don't leak stack traces, query fragments, or internal paths in the response body. See
  [`10-error-handling.md`](./10-error-handling.md).
- Sign-in and password-reset responses must look the same regardless of whether the email
  exists.
- Sign-up behavior is product-dependent: if email enumeration is high-risk, return generic
  success and send a verification email only when appropriate; if the product intentionally
  surfaces duplicate-email errors, use the standard `409 USER.EMAIL_TAKEN` contract from
  [`10-error-handling.md`](./10-error-handling.md) and rate-limit the endpoint.
- For "exists but you can't see it" rows, prefer `404` over `403` so attackers can't even
  probe existence. Use `403` only when the caller demonstrably has access to the parent
  resource (e.g. they can list a folder but not read one specific file).
- Never echo user input verbatim in HTML error pages — that's stored XSS waiting to happen.

## Threat modeling (new features)

Before building anything that handles money, PII, or privileged actions:

1. **Assets** — what data and abilities matter?
2. **Actors** — user, admin, partner, attacker (insider and outsider).
3. **Trust boundaries** — where do assumptions change?
4. **Threats (STRIDE)** — Spoofing, Tampering, Repudiation, Info disclosure, DoS, Elevation.
5. **Mitigations** — guards, rate limit, audit, encryption, approvals.

A 30-minute session catches 80% of bugs earlier and for free.

## Anti-patterns

- Comparing tokens, signatures, or HMACs with `===` or `Buffer.equals`.
- `cors({ origin: '*', credentials: true })` — browsers will refuse, but the misconfiguration
  hides bugs and can break in subtle ways once an allow-list is added later.
- Authorization that stops at "is the user logged in" without checking ownership/tenant.
- Storing OAuth tokens, API keys, or session cookies in plaintext.
- Returning different responses for "user exists" vs "user does not exist" on sign-in or
  password reset.
- Following user-supplied URLs without an allow-list and private-IP block.
- Logging request bodies, headers, or query strings without redaction.
- Hard-coding admin user IDs or role checks in code instead of in DB-backed RBAC.
- Disabling CSRF "because we'll fix it later" while shipping a cookie-authenticated POST.
- Trusting `X-Forwarded-For` directly for rate-limit keying without trust-proxy configured.

## Code review checklist

- [ ] Every controller input has a DTO; `whitelist` + `forbidNonWhitelisted` enabled globally
- [ ] SQL always parameterized; dynamic identifiers checked against an allow-list
- [ ] Passwords hashed with Argon2id (or bcrypt ≥ 12 rounds during migration); never plaintext
- [ ] Token/signature/HMAC compares use `crypto.timingSafeEqual`
- [ ] Every route has a guard or explicit `@Public()`
- [ ] Object-level authorization (owner/tenant) enforced beyond authN, ideally in the query
- [ ] Rate limiting global + stricter on auth and other sensitive routes
- [ ] MFA required for high-privilege roles
- [ ] Secrets in env only; not logged; not echoed in error responses
- [ ] `helmet()` on; CORS is an allow-list (no `*` with credentials); HSTS configured
- [ ] Trust-proxy configured correctly for the deployment topology
- [ ] Webhooks: signature verified on raw bytes, replay window, dedupe by event id
- [ ] File uploads: size limit, magic-byte sniff, opaque tenant-prefixed storage key, server-computed hash/size/mime, AV scan before exposure, upload endpoints rate-limited
- [ ] Outbound HTTP: allow-listed hosts, private-IP block, redirect cap, timeouts
- [ ] No PII in logs; redaction configured centrally
- [ ] Audit log written for sensitive actions, with `request_id` and `tenant_id` where applicable
- [ ] Dependencies scanned in CI; no open high/critical without a tracked exception
- [ ] Errors don't reveal existence vs permission unnecessarily (404 vs 403 considered)

## See also

- [`09-validation.md`](./09-validation.md) — DTO + Zod input validation
- [`10-error-handling.md`](./10-error-handling.md) — error taxonomy and what not to leak
- [`12-authentication-patterns.md`](./12-authentication-patterns.md) — sessions, JWT, API keys, MFA
- [`17-pipelines-interceptors-guards.md`](./17-pipelines-interceptors-guards.md) — guard ordering
- [`20-configuration.md`](./20-configuration.md) — env validation, secret manager
- [`21-logging.md`](./21-logging.md) — log redaction
- [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md) — tenant scoping and IDOR
- [`36-webhooks.md`](./36-webhooks.md) — inbound webhook pattern
- [`37-file-uploads.md`](./37-file-uploads.md) — uploads pattern
