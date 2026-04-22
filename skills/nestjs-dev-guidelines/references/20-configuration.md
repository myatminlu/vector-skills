# 20 — Configuration

## TL;DR

- `ConfigModule.forRoot({ isGlobal: true, cache: true })` — load `.env` once.
- Validate with **Zod** at boot (`loadEnv()` in `main.ts`). Exit non-zero on invalid.
- Every env var appears in `.env.example`, with a realistic-but-safe placeholder.
- Group by prefix: `DB_*`, `REDIS_*`, `AUTH_*`, `LLM_*`.
- Never commit `.env`. Never log env values. Rotate secrets; document the process.

## Why it matters

Bad config is the most common production outage — missing var, wrong URL, surprise default.
Fail-fast boot validation converts "crashes at 3am" into "container refuses to start on deploy."

## Schema (Zod)

```ts
// core/config/env.ts
import { z } from 'zod';

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

    // Redis (optional)
    REDIS_URL: z.string().url().optional(),

    // External providers
    STRIPE_SECRET_KEY: z.string().startsWith('sk_').optional(),
    ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),

    // CORS
    ALLOWED_ORIGINS: z
      .string()
      .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.REDIS_URL,
    { message: 'REDIS_URL required in production' },
  );

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors;
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', issues);
    process.exit(1);
  }
  return parsed.data;
}
```

### Use in `main.ts` BEFORE NestFactory

```ts
// main.ts
import { loadEnv } from './core/config/env.js';

const env = loadEnv();

const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
// ...
await app.listen(env.PORT);
```

Failing here prevents a broken container from serving traffic.

## `ConfigService` wrapper

Expose typed access inside the app:

```ts
// core/config/config.module.ts
import { Global, Module } from '@nestjs/common';
import { ConfigService as NestConfigService, ConfigModule as NestConfigModule } from '@nestjs/config';
import type { Env } from './env.js';

@Global()
@Module({
  imports: [NestConfigModule.forRoot({ isGlobal: true, cache: true })],
  providers: [
    {
      provide: 'APP_CONFIG',
      useFactory: (cfg: NestConfigService) => cfg as NestConfigService<Env, true>,
      inject: [NestConfigService],
    },
  ],
  exports: ['APP_CONFIG'],
})
export class ConfigModule {}

// consumer
constructor(@Inject('APP_CONFIG') private readonly config: NestConfigService<Env, true>) {}

this.config.get('DATABASE_URL', { infer: true }); // fully typed
```

Or just use your `loadEnv()` return value and inject it as a value provider — same effect,
less ceremony.

## `.env.example`

Every variable lives here. Real `.env` is gitignored.

```bash
# .env.example
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/myapp
DATABASE_POOL_MAX=20

AUTH_SECRET=replace-with-openssl-rand-base64-48
SESSION_TTL_SECONDS=604800

REDIS_URL=redis://localhost:6379

STRIPE_SECRET_KEY=sk_test_...
ANTHROPIC_API_KEY=sk-ant-...

ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

- Group by prefix with blank-line separators.
- Comment generators (`# openssl rand -base64 48`) above secrets.
- Never put real values in `.env.example`.

## Environments

- **Local**: `.env` (copied from `.env.example`, edited).
- **CI**: env set on the runner; repeat Zod validation as a test.
- **Staging / Prod**: env injected by deployment platform (ECS task def, k8s secret, Fly secret, Railway variable).
- **Per-service**: one `.env` per service; don't share across services.

## Secrets management in production

- Source from secret manager (AWS SM, GCP SM, Hashicorp Vault) at deploy time.
- Inject as env (12-factor); app never reads the SM directly.
- Rotate on schedule + on staff offboarding. Track rotations in `docs/OPERATIONS.md`.
- Do not store secrets in container images or ECR.

## Feature flags

Not config. Feature flags are runtime-changeable; env is boot-time.

- Use a flag provider (GrowthBook, Unleash, LaunchDarkly) for gradual rollouts.
- For simple boolean flags, env (`ENABLE_NEW_CHECKOUT=true`) is fine — but the value is
  fixed until redeploy.
- Clean up flags after full rollout. Stale flags become bugs.

## Config versioning

- Add new optional vars with safe defaults — non-breaking.
- Rename → add new; keep old reading the same value; deprecate; remove in a later release.
- Document breaking changes in `CHANGELOG.md`.

## Secrets hygiene

- `.env` in `.gitignore`. Check before every commit.
- Git pre-commit hook to scan for `AKIA`, `sk_live_`, `sk-ant-`, etc. (e.g., `git-secrets` or `gitleaks`).
- If a secret is ever committed: rotate immediately; treat as leaked.

## Typed access pattern

```ts
// Avoid string-based gets everywhere
const databaseUrl = this.config.get('DATABASE_URL'); // ❌ typed as string | undefined

// Prefer strongly-typed via custom Env:
const db = this.env.DATABASE_URL; // ✅ typed
```

Passing the frozen `Env` object into modules that need it is cleaner than `ConfigService.get()`
scattered across the codebase.

## Per-environment overrides

If you need environment-specific defaults:

```ts
const defaults = {
  development: { LOG_LEVEL: 'debug', DATABASE_POOL_MAX: 5 },
  production: { LOG_LEVEL: 'info', DATABASE_POOL_MAX: 50 },
};
```

Apply defaults **before** Zod parsing, or use `.default()` per var. Avoid branching all over
the code on `NODE_ENV`.

## Good vs bad

### Good

```ts
// validate at boot
const env = loadEnv();
// fail fast if bad
// pass typed env where needed
@Module({ providers: [{ provide: ENV, useValue: env }] })
```

### Bad

```ts
// scattered process.env reads
const url = process.env.DATABASE_URL || 'postgresql://localhost/default';  // fallback hides missing config
const poolSize = parseInt(process.env.POOL_SIZE) || 10;                    // NaN fallback, no validation
// no boot-time validation anywhere
```

## Anti-patterns

- Reading `process.env` directly outside the config module.
- Default fallbacks for required secrets (`process.env.JWT || 'dev-secret'`).
- Different codebases with different `.env.example` structures for the same env.
- Silent coercion: `Number(process.env.X)` where X is malformed → NaN propagates.
- Config that depends on the call site (e.g., different pool sizes in different files).
- Secrets logged at boot "for debugging".

## Code review checklist

- [ ] New env var added to Zod schema with correct type and bounds
- [ ] Added to `.env.example` with placeholder + comment
- [ ] No `process.env.X` reads outside the config module
- [ ] No `|| 'default'` fallback for secrets
- [ ] `loadEnv()` called before `NestFactory.create`
- [ ] No env values logged
- [ ] Boolean coercion explicit (`z.coerce.boolean()` or string compare, not truthy)
- [ ] Production requires what production needs (refine rules)

## See also

- [`11-security.md`](./11-security.md) — secrets in production
- [`09-validation.md`](./09-validation.md) — Zod patterns
- [`21-logging.md`](./21-logging.md) — don't log env values
