# 12 — Authentication Patterns

## TL;DR

- Two core patterns: **session cookie (preferred for browsers)** and **Bearer JWT (for API/mobile)**.
- A third: **API keys** for programmatic / partner access. Treat as long-lived Bearer tokens with different scopes.
- If the project uses **Better Auth**, follow the repo's current pattern: cookie for browsers, Bearer for APIs, cookie wins when both are present. The Better Auth library manages issuance, rotation, and revocation.
- If not Better Auth, use **Bearer JWT** with short-lived access + rotating refresh + server-side revocation list.
- Every JWT carries `iat` (issued-at); a revocation table by user keyed on `revoked_before` invalidates outstanding tokens.
- Always guard every route. `@Public()` is opt-in, not opt-out.

## Which pattern

| Client | Recommended |
|---|---|
| First-party web (SSR or same origin) | Session cookie |
| First-party SPA (cross-origin OK) | Session cookie with `SameSite=Strict`; or Bearer with refresh rotation |
| Mobile native | Bearer JWT (short-lived) + refresh rotation |
| Partner / server-to-server API | API key (Bearer with scopes) |
| Webhook consumer | Signed payload (see `11-security.md`), no auth in header |
| Admin / internal tools | Session cookie + MFA |

If Better Auth is in use (has `createAuth()` factory, `/api/auth/*` mounted), follow the
repo's pattern as-is.

## Session cookie

### Cookie configuration

```ts
// set on sign-in
res.cookie('session', sessionId, {
  httpOnly: true,                // JS cannot read
  secure: true,                  // HTTPS only (in prod)
  sameSite: 'lax',               // 'strict' for pure first-party
  path: '/',
  maxAge: 7 * 24 * 60 * 60_000,  // 7 days
  // If cross-subdomain: domain: '.example.com'
});
```

### Server side

- `sessions(id, user_id, created_at, last_seen_at, expires_at, revoked_at, ip, user_agent)`.
- Each authenticated request: look up session id, reject if missing / expired / revoked.
- Sliding expiration: bump `last_seen_at` on each request; `expires_at` re-extended.
- Sign-out: set `revoked_at = now()`.
- Sign-out everywhere: revoke all sessions for user.

### CSRF protection

Cookies authenticate automatically. That's the problem. Mitigations:

- **SameSite=Strict or Lax** — blocks most cross-site submissions. Good for first-party-only.
- **CSRF token** — double-submit cookie or synchronizer pattern. Required for any POST that acts on user data when `SameSite=None`.
- Better Auth has built-in CSRF for state-changing requests; trust it.

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
3. If the old refresh is used again → treat as stolen; revoke the whole chain + force re-auth.

### Revocation

JWTs are stateless — you can't "delete" one. Two approaches:

**A. Short-lived access + revocation list by token id (`jti`)**
- On sign-out, insert `jti` into `revoked_tokens` with TTL = access lifetime.
- Verifier checks `jti` against the list.

**B. Revocation by user (preferred, cheaper)**
- Table `jwt_revocations(user_id, revoked_before timestamptz)`.
- On sign-out everywhere: `UPDATE revoked_before = now()`.
- Verifier rejects any token with `iat < revoked_before` for that user.

Combine with short access tokens so the revocation window is bounded.

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
    if (!auth?.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException({ code: 'AUTH.MISSING_BEARER' });
    }
    const token = auth.slice(7).trim();
    const payload = await this.jwks.verify(token);             // sig + exp + iss + aud
    if (await this.revocations.isRevoked(payload.sub, payload.iat)) {
      throw new UnauthorizedException({ code: 'AUTH.TOKEN_REVOKED' });
    }
    req.user = { id: payload.sub, scopes: payload.scope.split(' ') };
    return true;
  }
}
```

## Combined (cookie OR Bearer)

When both auth methods are supported, make cookie win (it's revocable instantly; Bearer may
have up to `exp` lifetime even after sign-out).

```ts
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(ctx) {
    const req = ctx.switchToHttp().getRequest();
    if (await this.tryCookie(req)) return true;
    if (await this.tryBearer(req)) return true;
    throw new UnauthorizedException({ code: 'AUTH.UNAUTHORIZED' });
  }
}
```

This is the Better Auth–friendly pattern.

## API keys

- Format: `sk_live_<40+ chars>` (prefix helps detection + rotation tooling).
- Store **hashed** (SHA-256 with salt, or Argon2id if low-volume).
- Show the plaintext once on creation; never retrievable again.
- Scopes: `payments:read`, `payments:write`, etc. Least privilege by default.
- Rotation: multiple keys per account; mark one "primary"; expire gracefully.
- Detection on leak: scan logs / github for `sk_live_` prefix.
- Rate limit per key (not just per IP).

### Issuance

```ts
async createApiKey(userId: string, name: string, scopes: string[]) {
  const raw = `sk_live_${crypto.randomBytes(24).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  await this.repo.insert({ userId, name, scopes, hash, createdAt: new Date() });
  return { apiKey: raw }; // only time user sees it
}
```

### Guard

```ts
@Injectable()
export class ApiKeyGuard implements CanActivate {
  async canActivate(ctx) {
    const req = ctx.switchToHttp().getRequest();
    const provided = req.headers['x-api-key'] || req.headers.authorization?.replace(/^Bearer /i, '');
    if (!provided) throw new UnauthorizedException({ code: 'AUTH.MISSING_API_KEY' });
    const hash = crypto.createHash('sha256').update(provided).digest('hex');
    const row = await this.repo.findByHash(hash);
    if (!row || row.revokedAt) throw new UnauthorizedException({ code: 'AUTH.INVALID_API_KEY' });
    req.user = { id: row.userId, scopes: row.scopes, authMethod: 'api_key' };
    return true;
  }
}
```

## Guards composition

```ts
@Controller({ path: 'payments', version: '1' })
@UseGuards(AuthGuard)                                      // base: cookie or Bearer
@ApiBearerAuth() @ApiCookieAuth('session')
export class PaymentController {
  @Get()
  list() {}

  @Post()
  @UseGuards(new ScopeGuard('payments:write'))              // scope check
  create() {}

  @Public()                                                  // opt out
  @Get('public-rates')
  rates() {}
}
```

`@Public()` is a custom decorator (metadata) that the `AuthGuard` checks and bypasses. Never
omit the guard silently — opt-out explicitly.

## MFA (optional but recommended)

- TOTP (Google Authenticator, 1Password) as default second factor.
- WebAuthn for phishing-resistant sign-in.
- Backup codes generated on enrollment (10 codes, single-use, hashed at rest).
- Require MFA for admin accounts; opt-in for regular users.

Better Auth ships a `twoFactor` plugin — use it; don't re-roll.

## Impersonation / admin access

- Separate admin users from regular users (`is_admin` or roles table).
- Impersonation: admin sets `actorUserId` in session, original admin id logged in audit log.
- Every impersonated action writes to audit log with both IDs.
- Destructive actions require re-auth (step-up).

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
      throw new ForbiddenException({ code: 'AUTH.INSUFFICIENT_PERMISSION' });
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
- Storing JWT in `localStorage` — XSS reads it. Use httpOnly cookie or in-memory.
- Accepting JWT `alg: none` or `alg: HS256` when JWKS says `RS256`.
- API keys stored in plaintext.
- CSRF-unprotected mutations on cookie-auth endpoints.
- Sign-out that only clears the cookie but leaves Bearer tokens valid for their full lifetime.
- Password reset tokens that don't expire or don't one-shot.
- Same-origin assumption broken: CORS `*` with `credentials: true`.

## Code review checklist

- [ ] Every route guarded; `@Public()` is explicit and rare
- [ ] Object-level ownership check after authN
- [ ] Cookies: `httpOnly`, `secure`, `sameSite`, `maxAge`
- [ ] JWTs: short `exp`, `kid` for rotation, revocation check on verify
- [ ] Refresh rotation with reuse detection
- [ ] API keys hashed at rest; scoped; revocable
- [ ] Rate limit on sign-in / sign-up / password reset
- [ ] MFA offered (at least TOTP); required for admin
- [ ] Audit log entries for sign-in, sign-out, password change, role change
- [ ] Sign-out everywhere available (cookie + Bearer both invalidated)

## See also

- [`11-security.md`](./11-security.md) — secrets, transport
- [`17-pipelines-interceptors-guards.md`](./17-pipelines-interceptors-guards.md) — where guards run
- [`25-documentation-swagger.md`](./25-documentation-swagger.md) — declaring auth schemes
- Better Auth skills: `better-auth-best-practices`, `better-auth-security-best-practices`
