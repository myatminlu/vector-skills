# 12 — Authentication Patterns

## TL;DR

- Two core patterns: **session cookie** (browsers) and **Bearer JWT** (mobile, server-to-server).
- Third pattern: **API keys** for programmatic / partner access. Treat as long-lived Bearer tokens with scopes.
- If the repo already uses an auth library (e.g. Better Auth, Auth.js, Lucia), follow its issuance / rotation / revocation primitives instead of re-rolling. Verify the library is present before referring to it.
- Otherwise: **Bearer JWT** with short-lived access (15–30 min) + rotating refresh (7–30 days) + server-side revocation by user.
- Every JWT carries `iat` (issued-at, unix seconds). A `jwt_revocations(user_id, revoked_before)` row invalidates all outstanding tokens issued before that instant.
- Session ids and refresh tokens are bearer secrets. The client sees the raw value once; the server stores only a hash (or HMAC with a pepper).
- Passwords use **Argon2id** (see `11-security.md`); never plain SHA / MD5 / bcrypt-with-low-cost.
- Errors throw `HttpException` subclasses with `{ code, message }` per `10-error-handling.md` — never bare strings or `code`-only payloads.
- Default-deny: every route guarded; `@Public()` is opt-in, not opt-out.

## Which pattern

| Client | Recommended |
|---|---|
| First-party web (SSR or same origin) | Session cookie |
| First-party SPA on the same site (same registrable domain, subdomains OK) | Session cookie with `SameSite=Lax` or `Strict` + CSRF protection on mutations |
| Browser app on a different site | Cookie with `SameSite=None; Secure` + CSRF token / origin checks; or Bearer only when the product accepts the XSS/storage trade-off |
| Mobile native | Bearer JWT (short-lived) + refresh rotation |
| Partner / server-to-server API | API key (Bearer with scopes) |
| Webhook consumer | Signed payload (see `11-security.md`), no auth in header |
| Admin / internal tools | Session cookie + MFA |

If an auth library is in use (detect by presence of `createAuth()` / `/api/auth/*` mount, or
`@auth/*` / `better-auth` / `lucia` in `package.json`), defer to the library's guards and
session handlers rather than the patterns below — but the error contract, default-deny, and
ownership-check rules in this file still apply.

## Session cookie

### Cookie configuration

```ts
// Set on sign-in. Prefer a __Host- cookie when the app does not need cross-subdomain sharing.
// The raw session token is sent to the client once; store only sessionTokenHash server-side.
res.cookie('__Host-session', sessionToken, {
  httpOnly: true,                // JS cannot read
  secure: true,                  // HTTPS only (in prod)
  sameSite: 'lax',               // 'strict' for pure first-party
  path: '/',
  maxAge: 7 * 24 * 60 * 60_000,  // 7 days
  // No Domain attribute on __Host- cookies.
  // If cross-subdomain sharing is required, use a non-__Host name + explicit domain deliberately.
});
```

### Server side

- `sessions(id, session_token_hash, user_id, created_at, last_seen_at, expires_at, revoked_at, ip, user_agent)`.
- Generate the session token with CSPRNG entropy (≥ 128 bits; 256 bits is a comfortable default).
- Each authenticated request: hash/HMAC the presented token, look it up by `session_token_hash`, reject if missing / expired / revoked.
- Never store raw session tokens. A database leak must not become an instant session replay leak.
- Sliding expiration: bump `last_seen_at` and re-extend `expires_at`. **Throttle** the write to ≥ 60 s (compare `last_seen_at` to `now()` in memory before issuing the `UPDATE`) so heavy traffic doesn't hot-row the table.
- Sign-out: set `revoked_at = now()` on the row; clear the cookie with `Max-Age=0`.
- Sign-out everywhere: revoke all non-revoked sessions for the user (also bump `jwt_revocations.revoked_before` if Bearer is also issued).

### CSRF protection

Cookies authenticate automatically. That is the problem. Mitigations:

- **SameSite=Strict or Lax** — blocks many cross-site submissions. `Strict` is safest but can break external-link login continuity; `Lax` is the usual first-party default.
- **SameSite=None; Secure** — only for true cross-site browser apps. Treat it as a high-CSRF surface, not a convenience flag.
- **CSRF token** — double-submit cookie or synchronizer pattern. Required for any state-changing route when `SameSite=None`, and recommended for `Lax` when the route can be reached via top-level navigation (`GET`/`POST` form).
- **Origin / Fetch Metadata checks** are good defense in depth, but they do not replace a CSRF token when cookie auth can mutate state.
- If using an auth library that ships CSRF (e.g. Better Auth), trust its middleware rather than re-rolling.

## Bearer JWT

### Token shape

```
Header: { "alg": "ES256", "kid": "2026-04" }
Payload: {
  "sub": "usr_abc",       // user id
  "iat": 1713792000,      // issued-at (seconds)
  "exp": 1713793800,      // expiry
  "jti": "uuid",          // token id for revocation tracking
  "scope": "read:payments write:payments"
}
```

- **`alg`: ES256 or RS256**, never `HS256` if distributing public keys to verifiers. (HS256 OK for a single-service setup.)
- **Short lifetime**: access = 15–30 min; refresh = 7–30 days.
- **`kid`** for key rotation. Serve JWKS at `/.well-known/jwks.json`.

### Refresh rotation

1. Client sends expired access + refresh.
2. Server validates refresh, issues **new access + new refresh**, invalidates old refresh.
3. If the old refresh is presented again → treat as stolen; revoke the whole chain + force re-auth.

**Refresh storage**: never `localStorage`. Browsers — `httpOnly; secure; sameSite=lax` cookie scoped to the refresh endpoint only. Mobile — OS keychain (iOS Keychain / Android Keystore). Server-to-server — process memory or a secret manager; not on disk.

**Server storage:** store only a refresh-token hash/HMAC, never the raw token. A typical table:

```sql
refresh_tokens (
  id uuid primary key,
  user_id uuid not null references users(id),
  token_hash text not null unique,
  family_id uuid not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  replaced_by_token_hash text
)
```

Rotate in a transaction: mark the old token `used_at`, insert the replacement, and revoke the
whole `family_id` if an already-used token appears again.

### Revocation

JWTs are stateless — you cannot "delete" one. Two approaches:

**A. Short-lived access + revocation list by token id (`jti`)**
- On sign-out, insert `jti` into `revoked_tokens` with TTL = access lifetime.
- Verifier checks `jti` against the list (Redis is a good fit; the list naturally expires).

**B. Revocation by user (preferred, cheaper at scale)**
- Table `jwt_revocations(user_id uuid PRIMARY KEY, revoked_before timestamptz NOT NULL)`.
- On sign-out everywhere:
  ```sql
  INSERT INTO jwt_revocations (user_id, revoked_before) VALUES ($1, now())
  ON CONFLICT (user_id) DO UPDATE SET revoked_before = EXCLUDED.revoked_before;
  ```
- Verifier rejects any token with `to_timestamp(iat) < revoked_before` for that user. Cache the row per user with a short TTL (e.g. 30 s) to avoid a DB hit on every request.

Combine with short access TTLs so the revocation window is bounded.

### NestJS guard (simplified)

```ts
@Injectable()
export class BearerGuard implements CanActivate {
  constructor(
    private readonly jwks: JwksService,
    private readonly revocations: TokenRevocationService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    if (!auth || !/^bearer\s+/i.test(auth)) {
      throw new UnauthorizedException({
        code: 'AUTH.MISSING_BEARER',
        message: 'Authorization header missing or not a Bearer token.',
      });
    }
    const token = auth.replace(/^bearer\s+/i, '').trim();

    let payload: JwtPayload;
    try {
      payload = await this.jwks.verify(token);                 // sig + exp + iss + aud
    } catch {
      throw new UnauthorizedException({
        code: 'AUTH.INVALID_TOKEN',
        message: 'Token signature, issuer, audience, or expiry is invalid.',
      });
    }

    if (await this.revocations.isRevoked(payload.sub, payload.iat)) {
      throw new UnauthorizedException({
        code: 'AUTH.TOKEN_REVOKED',
        message: 'Session was revoked. Please sign in again.',
      });
    }

    const scopes = typeof payload.scope === 'string'
      ? payload.scope.split(' ').filter(Boolean)
      : [];
    req.user = { id: payload.sub, scopes, authMethod: 'bearer' };
    return true;
  }
}
```

## Combined (cookie OR Bearer)

When both auth methods are supported, make **cookie win** (it is revocable instantly; a Bearer
token may stay valid until `exp` even after sign-out). Trying cookie first also blocks an
attacker who tries to inject an `Authorization` header into a browser request.

If a request includes a cookie and that cookie is invalid/expired, **fail closed** with `401`.
Do not silently fall back to Bearer on the same request; otherwise an injected header can change
which identity the browser request uses.

```ts
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly bearer: BearerGuard,        // delegate JWT path
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();

    // 1) Cookie takes precedence
    const sessionToken = req.cookies?.['__Host-session'] ?? req.cookies?.session;
    if (sessionToken) {
      const session = await this.sessions.findActiveByToken(sessionToken);
      if (!session) {
        throw new UnauthorizedException({
          code: 'AUTH.SESSION_EXPIRED',
          message: 'Session is expired or revoked.',
        });
      }
      req.user = { id: session.userId, scopes: session.scopes, authMethod: 'cookie' };
      return true;
    }

    // 2) Fall back to Bearer
    if (req.headers.authorization) {
      return this.bearer.canActivate(ctx);
    }

    throw new UnauthorizedException({
      code: 'AUTH.UNAUTHENTICATED',
      message: 'No session cookie or Bearer token on the request.',
    });
  }
}
```

The `@Public()` decorator is just `SetMetadata('isPublic', true)`; the guard reads it via
`Reflector` and short-circuits.

## API keys

- Format: `sk_live_<48 hex chars>` — `sk_live_` prefix for leak scanning + rotation tooling, followed by 24 random bytes (192 bits, hex-encoded).
- Store **hashed**. For high-entropy random keys (≥ 128 bits), unsalted SHA-256 (or HMAC-SHA-256 with a server-side pepper) is sufficient — offline brute-force is infeasible. **Argon2id is only needed for keys that contain user-typed entropy** (passphrase-style); it is overkill and slow for random keys.
- Index the hash for O(1) lookup; do not look up by `userId` and iterate.
- Show the plaintext once on creation; never retrievable again.
- Scopes: `payments:read`, `payments:write`, etc. Least privilege by default.
- Rotation: allow multiple active keys per account; mark one "primary"; expire gracefully (`expires_at`).
- Leak detection: scan logs and public sources for the `sk_live_` prefix.
- Rate limit per key (not just per IP) — see `11-security.md`.

### Issuance

```ts
async createApiKey(userId: string, name: string, scopes: string[]) {
  // 24 random bytes = 192 bits of entropy — collision and brute-force resistant.
  const raw = `sk_live_${crypto.randomBytes(24).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  await this.repo.insert({ userId, name, scopes, hash, createdAt: new Date() });
  return { apiKey: raw }; // only time the caller sees it
}
```

If you prefer HMAC with a server-side pepper (so a stolen DB cannot be hash-matched against
known-leaked keys), swap `createHash('sha256')` for `createHmac('sha256', PEPPER)` and store
the pepper in your secret manager.

### Guard

```ts
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly repo: ApiKeyRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    const fromBearer = auth && /^bearer\s+/i.test(auth)
      ? auth.replace(/^bearer\s+/i, '').trim()
      : undefined;
    const provided = (req.headers['x-api-key'] as string | undefined) ?? fromBearer;

    if (!provided) {
      throw new UnauthorizedException({
        code: 'AUTH.MISSING_API_KEY',
        message: 'Missing X-API-Key header or Bearer token.',
      });
    }

    const hash = crypto.createHash('sha256').update(provided).digest('hex');
    const row = await this.repo.findByHash(hash);
    if (!row || row.revokedAt || (row.expiresAt && row.expiresAt < new Date())) {
      throw new UnauthorizedException({
        code: 'AUTH.INVALID_API_KEY',
        message: 'API key is invalid, revoked, or expired.',
      });
    }

    req.user = { id: row.userId, scopes: row.scopes, authMethod: 'api_key' };
    return true;
  }
}
```

## Guards composition

Use **metadata + Reflector** for scope checks — never `new ScopeGuard(...)`, which bypasses
DI and breaks `JwksService` / repository injection inside the guard.

```ts
// common/auth/scopes.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const SCOPES_KEY = 'requiredScopes';
export const Scopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

// common/auth/scopes.guard.ts
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]) ?? [];
    if (required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const granted: string[] = req.user?.scopes ?? [];
    const ok = required.every((s) => granted.includes(s));
    if (!ok) {
      throw new ForbiddenException({
        code: 'AUTH.INSUFFICIENT_SCOPE',
        message: `Missing required scope(s): ${required.join(', ')}.`,
      });
    }
    return true;
  }
}
```

```ts
@Controller({ path: 'payments', version: '1' })
@UseGuards(AuthGuard, ScopesGuard)                         // base + scope, both DI-managed
@ApiBearerAuth('bearer') @ApiCookieAuth('cookie')         // names must match DocumentBuilder
export class PaymentController {
  @Get()
  list() {}

  @Post()
  @Scopes('payments:write')                                 // declarative
  create() {}

  @Public()                                                  // opt out of auth
  @Get('public-rates')
  rates() {}
}
```

`@Public()` is a custom decorator (`SetMetadata('isPublic', true)`) that `AuthGuard` reads via
`Reflector` and bypasses. Never omit the guard silently — opt out explicitly.

## Password hashing

- **Argon2id** with parameters from `11-security.md`: memory 64 MiB, time cost `t=3`, parallelism `p=2` (load-test before shipping; see `11-security.md` → Password hashing). Use `@node-rs/argon2` (prebuilt Rust binaries, no native compile pain) or `argon2` (Node-API). Both expose `hash`/`verify` and return a boolean from `verify` — never trust a misremembered "throws on wrong" comment.
- Never `bcrypt` cost < 12, never plain SHA-1/SHA-256/MD5.
- On login, run the same-cost verification path against a dummy Argon2 hash when the user is missing — otherwise the timing of "user not found" leaks email enumeration.
- Migration from bcrypt → Argon2id: verify with the legacy hasher; on success, rehash with Argon2id and update the row in the same transaction.

```ts
async verifyPassword(email: string, password: string) {
  const user = await this.users.findByEmail(email);
  // Same-cost verification path even when user is missing.
  const hash = user?.passwordHash ?? DUMMY_ARGON2_HASH;
  const ok = await argon2.verify(hash, password);
  if (!user || !ok) {
    throw new UnauthorizedException({
      code: 'AUTH.INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
  }
  return user;
}
```

## MFA (optional but recommended)

- TOTP (Google Authenticator, 1Password) as default second factor.
- WebAuthn for phishing-resistant sign-in.
- Backup codes generated on enrollment (10 codes, single-use, hashed at rest).
- Require MFA for admin accounts; opt-in for regular users.

If the chosen auth library ships an MFA plugin (e.g. Better Auth `twoFactor`), use it; do
not re-roll TOTP secret storage and code verification.

## Impersonation / admin access

- Separate admin users from regular users (`is_admin` flag or a roles table).
- Impersonation session carries **two ids**: `userId` is the impersonated user (the `sub` of any work performed), `actorId` is the original admin (RFC 8693 `act` claim semantics). Authorization checks see `userId`; audit log captures both.
- Every impersonated action writes one audit row with `{ userId, actorId, action, resourceId, ip, ua, ts }`. Without `actorId` you cannot answer "who actually did this?" during incident review.
- Destructive or money-moving actions require **step-up re-auth** (re-enter password / MFA), even mid-impersonation.
- End impersonation explicitly; never let a closed admin browser tab leave a live impersonation session behind.

## Password reset

- Token in `password_reset_tokens`: `id, user_id, token_hash, expires_at (15 min), used_at`.
- Email contains plaintext token in URL; server hashes + compares.
- Mark `used_at` on first use; reject subsequent.
- Enforce new password ≠ last N passwords (optional; requires hash history).
- On success, revoke all sessions and JWTs (`sign-out everywhere`).

## Email verification

- Send verification email on sign-up; user's `email_verified_at` null until clicked.
- Block sensitive actions until verified (sign-in can allow but flag).
- Resend throttled; link expires 24h.

## Good vs bad

### Good

```ts
@Controller({ path: 'orders', version: '1' })
@UseGuards(AuthGuard)                     // require auth by default
export class OrderController {
  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const order = await this.orders.findById(id);
    if (order.userId !== user.id) {       // object-level check
      throw new ForbiddenException({
        code: 'AUTH.INSUFFICIENT_PERMISSION',
        message: 'You do not own this resource.',
      });
    }
    return order;
  }
}
```

### Bad

```ts
@Controller('orders')
export class OrderController {            // ❌ no guard
  @Get(':id')
  async get(@Param('id') id: string) {    // ❌ no user context
    return this.db.query(`SELECT * FROM orders WHERE id = '${id}'`); // ❌❌❌
  }
}
```

## Anti-patterns

- Long-lived (`exp` months) access tokens without rotation.
- Raw session ids or refresh tokens stored in the database instead of hashes/HMACs.
- Storing JWT or refresh in `localStorage` — XSS reads it. Use `httpOnly` cookie or in-memory + secure-storage on mobile.
- Accepting JWT `alg: none`, or `HS256` when the verifier expects an asymmetric key (key-confusion attack).
- Hashing passwords with anything other than Argon2id / bcrypt(cost ≥ 12) / scrypt.
- API keys stored in plaintext, or compared with `==` (use a hashed lookup, no string comparison needed).
- CSRF-unprotected mutations on cookie-auth endpoints when `SameSite=None`.
- Using `SameSite=Strict` for a true cross-site SPA and wondering why auth breaks; use `None; Secure` plus CSRF, or change the deployment topology.
- Sign-out that only clears the cookie but leaves Bearer / refresh tokens valid for their full lifetime.
- Password reset tokens that do not expire (≤ 15 min) or are not single-use.
- CORS misconfiguration: `Access-Control-Allow-Origin: *` together with `Access-Control-Allow-Credentials: true` (browsers reject this; servers must echo a specific origin).
- Error bodies that omit `message` or use a non-`AUTH.*` code — clients cannot branch on them, see `10-error-handling.md`.

## Code review checklist

- [ ] Every route guarded; `@Public()` is explicit and rare
- [ ] Object-level ownership check after authN
- [ ] Cookies: `httpOnly`, `secure`, `sameSite`, `maxAge`
- [ ] Cookie SameSite value matches deployment topology (`Lax`/`Strict` for same-site; `None; Secure` only for true cross-site)
- [ ] Session ids and refresh tokens stored only as hashes/HMACs server-side
- [ ] JWTs: short `exp`, `kid` for rotation, revocation check on verify
- [ ] Refresh rotation with reuse detection; refresh stored in `httpOnly` cookie or OS keychain (never `localStorage`)
- [ ] Combined cookie + Bearer mode fails closed on an invalid cookie; no silent Bearer fallback on the same request
- [ ] Passwords hashed with Argon2id (or bcrypt cost ≥ 12); login uses the same-cost dummy-hash path when user is missing
- [ ] API keys hashed at rest; scoped; revocable; lookup by hash, not by user
- [ ] Rate limit on sign-in / sign-up / password reset
- [ ] MFA offered (at least TOTP); required for admin
- [ ] Audit log entries for sign-in, sign-out, password change, role change, impersonation
- [ ] Sign-out everywhere available (cookie + Bearer both invalidated via `revoked_before`)
- [ ] All auth errors throw `HttpException` with `{ code, message }` per `10-error-handling.md`

## See also

- [`10-error-handling.md`](./10-error-handling.md) — `{ code, message }` error contract used by every guard above
- [`11-security.md`](./11-security.md) — secrets, transport, password hashing parameters
- [`17-pipelines-interceptors-guards.md`](./17-pipelines-interceptors-guards.md) — where guards run in the request lifecycle
- [`25-documentation-swagger.md`](./25-documentation-swagger.md) — declaring `@ApiBearerAuth` / `@ApiCookieAuth` schemes
- [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md) — tenant id derivation from `request.user`
- [`38-decorators-scopes-dynamic-modules.md`](./38-decorators-scopes-dynamic-modules.md) — `@CurrentUser` and the auth-context decorator contract
- [`39-exception-filters.md`](./39-exception-filters.md) — how the global filter shapes the auth-error body
