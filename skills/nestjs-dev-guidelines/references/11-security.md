# 11 — Security

## TL;DR

- Apply OWASP Top 10 mental model: injection, broken auth, sensitive data, etc.
- `helmet()` on, strict CORS whitelist, rate limit global + per-route, HTTPS in prod.
- Parameterized SQL only. Never string-concat user input into queries.
- Secrets from env only, validated at boot. Never committed, never logged.
- Hash passwords with Argon2id (or bcrypt ≥12 rounds if legacy). Never store plaintext.
- Sign/verify webhooks via HMAC + replay window. Sign/verify JWTs via public key (RS/ES).
- PII: minimize, encrypt at rest, redact in logs, right-to-delete surface.
- Defense in depth: validation + authZ + rate limit + audit log. Layers.

## Why it matters

Security bugs are low-frequency / high-impact. One mistake — an unvalidated filter, a
plaintext secret, a missing rate limit — can leak every user's data. Following a checklist
across layers converts "one clever attacker wins" into "need multiple independent mistakes."

## OWASP Top 10, applied

| # | Risk | Our mitigation |
|---|---|---|
| A01 | Broken access control | Guards on every route; owner check in service; unit tests for authz |
| A02 | Cryptographic failures | Argon2id passwords; TLS; field encryption for tokens at rest |
| A03 | Injection | Parameterized queries (never string concat); DTO validation; output escaping |
| A04 | Insecure design | Threat-model new features; default deny; fail closed |
| A05 | Security misconfiguration | Helmet; minimal CORS; disabled debug in prod; locked Swagger |
| A06 | Vulnerable components | `npm audit` in CI; dependabot; SBOM; pinned versions |
| A07 | Identification/auth failures | Rate limit login; account lockout; MFA optional; session revocation |
| A08 | Software and data integrity | Signed webhooks; signed releases; CI lockfile enforcement |
| A09 | Logging and monitoring failures | Structured logs; alerts on 5xx spikes, 401 spikes, outbound failures |
| A10 | SSRF | Whitelist outbound destinations; no user-provided URLs to fetch |

## Transport + headers

```ts
// main.ts
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,       // tailor if you serve HTML
}));
app.use(compression());
app.enableCors({
  origin: env.ALLOWED_ORIGINS,         // array of exact strings, never "*"
  credentials: true,                   // only with a known origin list
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-ID'],
  maxAge: 600,
});
```

- **TLS everywhere.** Terminate TLS at the load balancer; redirect HTTP → HTTPS.
- **HSTS** via helmet; include `includeSubDomains` + `preload`.
- **Trust proxy** set explicitly if behind a load balancer (`app.set('trust proxy', 1)`).
  Never trust `X-Forwarded-For` blindly — validate or use the proxy's canonical header.

## Input validation (first line)

See `09-validation.md`. Key rules:

- DTO with class-validator for every controller input.
- `whitelist: true` + `forbidNonWhitelisted: true` — blocks mass assignment.
- Whitelist filter / sort fields — blocks SQL injection via column name.

## SQL injection prevention

### Always parameterize

```ts
// ✅ good (pg)
await pool.query('SELECT * FROM users WHERE email = $1 AND tenant_id = $2', [email, tenantId]);

// ❌ bad
await pool.query(`SELECT * FROM users WHERE email = '${email}'`);
```

### Column/table names from user input — whitelist

Parameters substitute values, not identifiers. If you need dynamic columns (sort/filter):

```ts
const ALLOWED = new Set(['created_at', 'amount', 'status']);
if (!ALLOWED.has(sortField)) throw new BadRequestException({ code: 'QUERY.INVALID_SORT_FIELD' });
// safe: we control the string entirely
const sql = `SELECT * FROM payments ORDER BY ${sortField} DESC`;
```

### ORM usage

TypeORM, Prisma, Drizzle all parameterize when used idiomatically. Raw SQL through any of
them still requires parameterization — double-check any `$queryRaw` / `createQueryBuilder().where(rawString)`.

## Authentication — see `12-authentication-patterns.md`

High-level rules here:

- Passwords: **Argon2id** (memory 64 MiB, t=3, p=2). If migrating from bcrypt, verify-then-rehash on login.
- Rotate secrets periodically; no long-lived unprotected tokens.
- Implement refresh rotation: each refresh invalidates the prior.
- Track sessions in DB; allow sign-out everywhere; require sign-out on password change.
- Support MFA (TOTP) for high-privilege accounts.

## Authorization

- **Default deny.** New endpoints are guarded unless explicitly public (`@Public()` decorator).
- **Object-level checks.** Don't stop at "is authenticated." Check "is this user allowed to see this specific row."
- **RBAC / ABAC** — encode in guards (`@Roles('admin')`) backed by DB-stored role assignments.

```ts
@Get(':id')
@UseGuards(AuthGuard)
async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
  const payment = await this.payments.findById(id);
  if (payment.userId !== user.id && !user.isAdmin) {
    throw new ForbiddenException({ code: 'AUTH.INSUFFICIENT_PERMISSION' });
  }
  return payment;
}
```

Better: push the ownership check into the query (`WHERE user_id = $1`) so attackers can't
even learn the row exists.

## Rate limiting

Layered:

1. **Edge** (CDN / load balancer) — absorbs DDoS.
2. **App global** (`@nestjs/throttler`) — 60 req/min/IP default.
3. **Sensitive routes** — sign-in, sign-up, password reset: 5 req/min/IP + 10 req/hour/email.
4. **Per-user quotas** — business logic: LLM calls per month, API calls per day.

```ts
// app.module.ts
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])
// route-level override
@Throttle({ default: { ttl: 60_000, limit: 5 } })
@Post('sign-in')
```

Return `429` with `Retry-After`. Log + alert on threshold breach.

## Secrets

- **Never in code, never in git.** `.env.example` in repo; real `.env` out of repo.
- Validate with Zod at boot — see `20-configuration.md`. Fail to start if missing.
- Rotate regularly. Document rotation in `docs/OPERATIONS.md`.
- Encrypt OAuth/third-party tokens at rest with a per-row key derivation or envelope encryption.
- Never log secrets. See `21-logging.md` redaction.
- In prod, secrets come from a secret manager (AWS SM, GCP SM, Vault) injected as env.

## Password hashing

```ts
import { hash, verify } from '@node-rs/argon2';

const hashed = await hash(password, {
  memoryCost: 65536, timeCost: 3, parallelism: 2,
});

await verify(hashed, password);  // throws on wrong
```

If you inherit bcrypt, verify-then-rehash:

```ts
if (row.password_hash.startsWith('$2')) {
  if (!await bcrypt.compare(password, row.password_hash)) throw AuthError;
  // success → rehash with Argon2
  const next = await argon2.hash(password, argonOpts);
  await this.repo.updatePasswordHash(row.id, next);
}
```

## PII handling

- **Minimize.** Don't collect what you don't need.
- **Segregate.** Keep PII in dedicated tables/columns; easier to purge + access-control.
- **Encrypt at rest** for sensitive PII (SSN, tax ID, health). Use envelope encryption.
- **Redact in logs.** Never log email, phone, DOB, document number. Log `userId` (opaque).
- **GDPR / right-to-delete.** Support hard delete or anonymization via a documented job.
- **Export.** Support user data export (GDPR Article 20).
- **Retention.** Define TTLs; purge inactive accounts on schedule.

## Webhooks (inbound)

```ts
// Verify signature BEFORE parsing body
const signature = req.headers['stripe-signature'];
const raw = req.rawBody; // need to preserve — configure bodyParser to pass raw
try {
  const event = stripe.webhooks.constructEvent(raw, signature, endpointSecret);
} catch {
  throw new UnauthorizedException({ code: 'WEBHOOK.SIGNATURE_INVALID' });
}
// Replay protection: dedupe by event.id (unique constraint on webhook_events.id)
```

Every webhook payload is suspect. Validate shape (Zod), signature, timestamp window (< 5 min
skew), and dedupe.

## SSRF / outbound requests

- Whitelist destinations. Never fetch a URL that came from user input without allowlist.
- If you must follow redirects, cap max hops and re-check the final URL.
- Block private IP ranges (10.x, 172.16–31.x, 192.168.x, 169.254.x, ::1, metadata endpoints).
- Set timeouts (see `10-error-handling.md`).
- In AWS/GCP, disable IMDSv1 on compute instances.

## File uploads

- Validate content-type **and** sniff magic bytes (e.g. `file-type` package).
- Enforce size limits pre-storage (LB + app).
- Scan for malware if the file flows to other users.
- Store behind presigned URLs (S3); never serve user files from your origin.
- Randomize filenames; preserve extension only after re-validation.
- Strip EXIF (location) from images when uploaded by end users.

## Dependency hygiene

- `npm audit` in CI; fail on `high` / `critical` unless a tracked exception.
- Pin versions (`package-lock.json` committed).
- Dependabot / Renovate for PRs.
- SBOM (`npm sbom`) published per release.
- Avoid unvetted packages — check weekly downloads, last release, license.

## Audit logging

For sensitive actions, append-only audit trail (not overwritten by normal logs):

```
audit_log (id, actor_user_id, action, target_type, target_id, metadata jsonb, created_at)
```

Actions: sign-in, sign-out, password change, role change, refund issued, data export, data
deletion. Keep for 1y+ per compliance. Never edit rows.

## Error responses

- Don't leak stack traces, query fragments, or internal paths.
- Don't reveal whether a resource exists vs forbidden — return 404 for both if unsure.
- Don't leak which email exists on sign-up / password reset — same message either way.

## Threat modeling (new features)

Before building something that handles money, PII, or privileged actions:

1. **Assets** — what data / abilities matter?
2. **Actors** — user, admin, partner, attacker.
3. **Trust boundaries** — where do assumptions change?
4. **Threats (STRIDE)** — Spoofing, Tampering, Repudiation, Info disclosure, DoS, Elevation.
5. **Mitigations** — guards, rate limit, audit, encryption, approvals.

A 30-minute session catches 80% of bugs earlier and for free.

## Code review checklist

- [ ] DTO validates every input; `whitelist` + `forbidNonWhitelisted` enabled globally
- [ ] SQL always parameterized; dynamic identifiers whitelisted
- [ ] Passwords hashed with Argon2id (or bcrypt≥12); never stored plaintext
- [ ] Every route has a guard or explicit `@Public()`
- [ ] Object-level authorization (owner/org check) present beyond authN
- [ ] Rate limit global + stricter on sensitive routes
- [ ] Secrets in env only; not logged, not echoed in errors
- [ ] `helmet()` on; CORS is a whitelist; HSTS + HTTPS
- [ ] Webhooks verify signature + replay window + dedupe by event id
- [ ] File uploads: size limit, magic-byte sniff, sanitized storage
- [ ] No PII in logs; redaction configured
- [ ] Audit log for sensitive actions
- [ ] Dependencies scanned; no open high/critical

## See also

- [`09-validation.md`](./09-validation.md) — input validation
- [`12-authentication-patterns.md`](./12-authentication-patterns.md) — auth specifics
- [`20-configuration.md`](./20-configuration.md) — env + secrets
- [`21-logging.md`](./21-logging.md) — redaction
- [`17-pipelines-interceptors-guards.md`](./17-pipelines-interceptors-guards.md) — guard ordering
