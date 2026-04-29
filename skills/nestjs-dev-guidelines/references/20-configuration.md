# 20 — Configuration

## TL;DR

- Validate env with **Zod** at boot (`loadEnv()` called **before** `NestFactory.create`). Exit non-zero on invalid.
- Inject the frozen `Env` object via a typed `Symbol` token. **Do not read `process.env` outside the config module.**
- Every env var appears in `.env.example` with a realistic-but-safe placeholder, grouped by prefix (`DB_*`, `REDIS_*`, `AUTH_*`, `LLM_*`).
- Never commit `.env`. Never log env values. Rotate secrets on schedule and on offboarding.
- For booleans/numbers/arrays from env: use explicit `z.string().transform(...)`, **not** `z.coerce.boolean()` (it treats `"false"` as `true`).

## Why it matters

Bad config is the most common production outage — missing var, wrong URL, surprise default.
Fail-fast boot validation converts "crashes at 3am" into "container refuses to start on deploy."

## Schema (Zod)

```ts
// src/core/config/env.ts
import { z } from 'zod';

// Booleans from env strings — z.coerce.boolean() is unsafe (treats "false" as true).
const envBool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

// CSV → array of trimmed non-empty strings.
const csv = z
  .string()
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

    // Database
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),

    // Auth
    AUTH_SECRET: z.string().min(32),
    SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),

    // Redis (optional in dev, required in prod — see refine below)
    REDIS_URL: z.string().url().optional(),

    // External providers
    STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
    ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),

    // CORS — comma-separated list
    ALLOWED_ORIGINS: csv.pipe(z.array(z.string().url()).min(1)),

    // Feature flag (boot-time only) — explicit boolean parsing
    ENABLE_NEW_CHECKOUT: envBool.default('false'),
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || !!env.REDIS_URL,
    { path: ['REDIS_URL'], message: 'REDIS_URL is required in production' },
  );

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Logger is not bootstrapped yet — plain console + non-zero exit is intentional.
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return Object.freeze(parsed.data);
}
```

### Use in `main.ts` BEFORE `NestFactory.create`

Validate at module load (ESM evaluates each module exactly once, so `loadEnv()` runs once even if multiple files import it):

```ts
// src/core/config/env.singleton.ts
import { loadEnv } from './env.js';
export const env = loadEnv();   // validated + frozen at first import
```

```ts
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { env } from './core/config/env.singleton.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(env.PORT);
}

void bootstrap();
```

Failing here prevents a broken container from serving traffic.

## Recommended: inject the frozen `Env` via a typed token

This is the **primary pattern** for this skill. It is fully type-safe, requires no string keys, and avoids `process.env` reads scattered across the codebase.

```ts
// src/core/config/env.token.ts
export const ENV = Symbol('ENV');
```

```ts
// src/core/config/config.module.ts
import { DynamicModule, Global, Module } from '@nestjs/common';
import { ENV } from './env.token.js';
import type { Env } from './env.js';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
```

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from './core/config/config.module.js';
import { env } from './core/config/env.singleton.js';

@Module({
  imports: [ConfigModule.forRoot(env), /* ... */],
})
export class AppModule {}
```

```ts
// consumer — fully typed, no string keys
import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../core/config/env.token.js';
import type { Env } from '../core/config/env.js';

@Injectable()
export class BillingService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  charge() {
    if (!this.env.STRIPE_SECRET_KEY) throw new Error('Stripe not configured');
    // this.env.DATABASE_URL is fully typed as string
  }
}
```

### Alternative: `@nestjs/config`'s `ConfigService<Env, true>`

If the team already uses `@nestjs/config`, you can wrap it instead. The trade-off: typing is generic-based and requires `{ infer: true }`, and string keys reappear at call sites.

```ts
import { ConfigService } from '@nestjs/config';
constructor(private readonly cfg: ConfigService<Env, true>) {}
this.cfg.get('DATABASE_URL', { infer: true }); // typed string
```

**Pick one pattern per repo and stick with it.** Do not mix.

## `.env.example`

Every variable lives here. Real `.env` is gitignored.

```bash
# .env.example
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/myapp
DATABASE_POOL_MAX=20

# Auth — generate with: openssl rand -base64 48
AUTH_SECRET=replace-with-openssl-rand-base64-48
SESSION_TTL_SECONDS=604800

# Redis — required in production
REDIS_URL=redis://localhost:6379

# External providers
STRIPE_SECRET_KEY=sk_test_...
ANTHROPIC_API_KEY=sk-ant-...

# CORS — comma-separated origins
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Feature flags (boot-time)
ENABLE_NEW_CHECKOUT=false
```

- Group by prefix with blank-line separators.
- Comment generators (`# openssl rand -base64 48`) above secrets.
- Never put real values in `.env.example`.

## Coercion gotchas

Env values are always strings. Coerce explicitly — silent coercion is the most common config bug.

| Bad | Why it fails | Use instead |
|---|---|---|
| `z.coerce.boolean()` | Any non-empty string → `true`, including `"false"` | `z.enum(['true','false','1','0']).transform(v => v === 'true' \|\| v === '1')` |
| `Number(process.env.X)` | Empty string → 0; bad input → `NaN` | `z.coerce.number().int()` with bounds |
| `process.env.X.split(',')` | Throws if undefined | `z.string().transform(s => s.split(',').map(x => x.trim()).filter(Boolean))` |
| `process.env.X === 'true'` ad-hoc | Silently wrong if `X` is `"True"` or `" true "` | Centralise in the Zod schema (`envBool` helper) |

## Environments

- **Local**: `.env` (copied from `.env.example`, edited).
- **CI**: env set on the runner; run `loadEnv()` once in a smoke test.
- **Staging / Prod**: env injected by deployment platform (ECS task def, k8s secret, Fly secret, Railway variable).
- **Per-service**: one `.env` per service; don't share across services.

## Per-environment overrides

If you need environment-specific defaults, apply them **before** Zod parsing — don't branch on `NODE_ENV` throughout the code.

```ts
// src/core/config/env.ts
const perEnvDefaults: Record<string, Record<string, string>> = {
  development: { LOG_LEVEL: 'debug', DATABASE_POOL_MAX: '5' },
  production:  { LOG_LEVEL: 'info',  DATABASE_POOL_MAX: '50' },
};

export function loadEnv(): Env {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const overlaid = { ...perEnvDefaults[nodeEnv], ...process.env };
  const parsed = envSchema.safeParse(overlaid);
  // ... same error handling as above
  return Object.freeze(parsed.data);
}
```

Or use Zod's `.default()` per var when one default fits all environments. Reach for `perEnvDefaults` only when defaults legitimately differ.

## Secrets management in production

- Source from a secret manager (AWS Secrets Manager, GCP Secret Manager, Hashicorp Vault) at deploy time.
- Inject as env (12-factor); the app never reads the secret manager directly.
- Rotate on schedule **and** on staff offboarding. Track rotations in `docs/OPERATIONS.md`.
- Do not store secrets in container images or registries.

## Feature flags

Not config. Feature flags are **runtime-changeable**; env is **boot-time**.

- Use a flag provider (GrowthBook, Unleash, LaunchDarkly) for gradual rollouts and per-user targeting.
- Simple boolean toggles can live in env (`ENABLE_NEW_CHECKOUT=true`) — but the value is fixed until redeploy.
- Clean up flags after full rollout. Stale flags become bugs.

## Config versioning

- **Add** a new optional var with a safe default — non-breaking.
- **Rename**: add the new var, keep the old one reading the same value, deprecate, remove in a later release.
- **Remove**: announce in `CHANGELOG.md`; fail loudly (don't silently ignore the old name).

## Secrets hygiene

- `.env` in `.gitignore`. Verify before every commit.
- Pre-commit scanner (`gitleaks` or `git-secrets`) for `AKIA`, `sk_live_`, `sk-ant-`, `ghp_`, etc.
- If a secret is ever committed: rotate immediately; treat as leaked even after force-push.

## Good vs bad

### Good

```ts
// src/core/config/env.singleton.ts
export const env = loadEnv();                // validated + frozen on first import

// src/app.module.ts
@Module({ imports: [ConfigModule.forRoot(env)] })
export class AppModule {}

// src/billing/billing.service.ts
constructor(@Inject(ENV) private readonly env: Env) {}
this.env.DATABASE_URL;                       // fully typed string
```

### Bad

```ts
// scattered process.env reads
const url = process.env.DATABASE_URL || 'postgresql://localhost/default'; // fallback hides missing config
const poolSize = parseInt(process.env.POOL_SIZE) || 10;                   // NaN fallback, no validation
const debug = !!process.env.DEBUG;                                        // "false" → true
// no boot-time validation anywhere
```

## Anti-patterns

- Reading `process.env` directly outside the config module.
- Default fallbacks for required secrets (`process.env.JWT || 'dev-secret'`).
- Different `.env.example` structures across services that share the same env.
- Silent coercion: `Number(process.env.X)` → `NaN`; `Boolean(process.env.X)` → always `true` for any non-empty string.
- Config that depends on the call site (e.g., different pool sizes in different files).
- Logging env values "for debugging" at boot.
- Mixing the `ENV` value-provider pattern and `@nestjs/config`'s `ConfigService` in the same repo.

## Code review checklist

- [ ] New env var added to Zod schema with correct type and bounds
- [ ] Added to `.env.example` with placeholder + comment (and generator command for secrets)
- [ ] No `process.env.X` reads outside `src/core/config/`
- [ ] No `|| 'default'` fallback for secrets or required URLs
- [ ] `loadEnv()` called before `NestFactory.create`
- [ ] No env values logged
- [ ] Booleans use the `envBool` helper (or equivalent), **never** `z.coerce.boolean()`
- [ ] Numbers use `z.coerce.number().int()` with `.min()` / `.max()` bounds
- [ ] Production-only requirements expressed via `.refine(...)` (e.g., `REDIS_URL` in prod)
- [ ] Feature flag added or removed → checklist entry in PR description

## See also

- [`09-validation.md`](./09-validation.md) — Zod patterns (request DTOs, runtime JSON)
- [`11-security.md`](./11-security.md) — secrets in production, rotation
- [`21-logging.md`](./21-logging.md) — don't log env values; redaction patterns
