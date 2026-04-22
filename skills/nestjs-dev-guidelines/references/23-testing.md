# 23 — Testing

## TL;DR

- Three layers: **unit** (fast, mocked deps), **integration** (real DB, real Redis), **e2e** (HTTP through the whole app).
- Unit tests live **beside** the implementation (`user.service.spec.ts`). E2E tests in `test/` folder.
- Mock at **boundaries** (HTTP clients, external APIs, queues), not at internals. Never mock the code under test.
- Use a **real Postgres** for integration tests — a transaction rolled back after each test keeps them fast and isolated.
- Coverage target: meaningful tests on services + critical flows. Coverage % is a hint, not a gate.

## Why it matters

Tests are a second opinion on intent. They catch regressions, document behavior, and turn
"this is scary to change" into "I can refactor with confidence." Badly written tests give
false confidence worse than no tests.

## Test pyramid

```
       /\        E2E (few, slow, real stack)
      /  \
     /----\      Integration (some, medium, real DB)
    /      \
   /--------\    Unit (many, fast, mocked deps)
```

- **Many unit** — cover branches, algorithms, service logic.
- **Some integration** — DB queries, ORM quirks, transactions, migrations.
- **Few e2e** — smoke the happy path, critical flows (sign-up, payment, auth).

Don't invert the pyramid: mostly-e2e is slow, flaky, and hard to diagnose.

## Unit tests

### Location

Beside the implementation: `src/modules/user/user.service.spec.ts`.

### Framework

Jest is the NestJS default. `test`/`it`/`expect`.

### Pattern

```ts
// user.service.spec.ts
import { Test } from '@nestjs/testing';
import { UserService } from './user.service.js';
import { UserRepository } from './user.repository.js';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException } from '@nestjs/common';

describe('UserService', () => {
  let service: UserService;
  let repo: jest.Mocked<UserRepository>;
  let events: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useValue: { existsByEmail: jest.fn(), insert: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(UserService);
    repo = module.get(UserRepository) as any;
    events = module.get(EventEmitter2) as any;
  });

  describe('create', () => {
    it('throws ConflictException when email exists', async () => {
      repo.existsByEmail.mockResolvedValue(true);
      await expect(service.create({ email: 'a@b.c', name: 'A', password: 'x' }))
        .rejects.toThrow(ConflictException);
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('inserts user and emits user.created', async () => {
      repo.existsByEmail.mockResolvedValue(false);
      const user = { id: 'u1', email: 'a@b.c', name: 'A' };
      repo.insert.mockResolvedValue(user as any);

      const result = await service.create({ email: 'a@b.c', name: 'A', password: 'x' });

      expect(result).toBe(user);
      expect(events.emit).toHaveBeenCalledWith('user.created', expect.any(Object));
    });
  });
});
```

### What to unit-test

- Services with branching logic (if/else, try/catch, retry, validation).
- Pure utilities (algorithms, formatters, calculators).
- Custom pipes, guards, interceptors (with minimal ExecutionContext mock).
- Error-mapping in filters.

### What NOT to unit-test (or test lightly)

- Controllers — too thin; the e2e test covers them.
- Repositories with trivial queries — integration tests better.
- DTOs, types — the compiler is the test.
- Nest wiring (`@Module` imports) — the app boot is the test.

### Mock strategy

```ts
// Boundary: repository, HTTP client, event emitter, queue, cache, external service
{ provide: StripeClient, useValue: { charge: jest.fn(), refund: jest.fn() } }

// NOT: own helpers in same module (extract and test separately instead)
```

If you find yourself mocking something in the module under test, that something should be a
separate class injected in.

## Integration tests

### Purpose

- Verify repository + DB queries work as intended.
- Verify multi-service flows (with real events / real queue where feasible).

### Setup: dedicated test DB

```bash
docker run -d --name pg-test -p 5433:5432 -e POSTGRES_PASSWORD=test postgres:17
```

`DATABASE_URL=postgresql://postgres:test@localhost:5433/test` in `.env.test`.

### Run migrations before tests

```ts
// test/global-setup.ts
import { runMigrations } from '../src/core/database/migrations.js';
export default async () => {
  await runMigrations(process.env.DATABASE_URL!);
};
```

### Isolation: transaction-per-test

```ts
// test/db-isolation.ts
export function useTransactionIsolation(pool: Pool) {
  let client: PoolClient;
  beforeEach(async () => {
    client = await pool.connect();
    await client.query('BEGIN');
  });
  afterEach(async () => {
    await client.query('ROLLBACK');
    client.release();
  });
}
```

Every test runs inside a transaction rolled back at the end — isolation without truncation.

### Example

```ts
describe('UserRepository (integration)', () => {
  let repo: UserRepository;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [DatabaseModule] }).compile();
    repo = module.get(UserRepository);
  });

  useTransactionIsolation(pool);

  it('inserts and finds by email', async () => {
    await repo.insert({ email: 'x@y.z', name: 'X', passwordHash: 'h' });
    const u = await repo.findByEmail('x@y.z');
    expect(u?.name).toBe('X');
  });
});
```

## E2E tests

### Location

`test/` folder with `*.e2e-spec.ts`. Separate Jest config (`test/jest-e2e.json`).

### Pattern

```ts
// test/user.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('POST /v1/users (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(() => app.close());

  it('creates a user', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/users')
      .send({ email: 'e2e@example.com', name: 'E', password: 'Password1234' })
      .expect(201);

    expect(res.body.data).toMatchObject({ email: 'e2e@example.com' });
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('returns 422 for invalid email', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/users')
      .send({ email: 'not-an-email', name: 'E', password: 'Password1234' })
      .expect(422);

    expect(res.body.error.code).toBe('VALIDATION.FAILED');
  });
});
```

### What to e2e-test

- Happy path of each endpoint (once).
- Authorization (both "no auth → 401" and "wrong user → 403").
- Validation (at least one failure case per endpoint).
- Envelope shape (success + error).

### What NOT to e2e-test

- Every branch of a service — use unit tests.
- External provider behavior — mock at the HTTP boundary.

## ESM-only deps (Better Auth, jose, etc.)

Jest is CJS. ESM-only packages break with `require()`. Options:

1. **Module name mapper** → lightweight stubs in `test/stubs/`:

```json
// package.json / jest config
"moduleNameMapper": {
  "^better-auth$": "<rootDir>/test/stubs/better-auth.ts",
  "^better-auth/(.*)$": "<rootDir>/test/stubs/better-auth.ts",
  "^jose$": "<rootDir>/test/stubs/jose.ts",
  "^(\\.\\.?/.+)\\.js$": "$1"
}
```

2. **`--experimental-vm-modules`** — native ESM in Jest; slower, rougher.

Pattern: use stubs for unit tests; bypass for true e2e where behavior matters.

## Test naming

- Describe blocks nest: `ClassName > methodName`.
- It blocks read as sentences: `'inserts and returns user'`, `'throws ConflictException when email exists'`.
- Avoid "should" ("it should insert") — implied.

## Assertions

- `toBe(x)` — strict equality.
- `toEqual({...})` — deep equality.
- `toMatchObject({...})` — partial deep match (preferred for API responses).
- `toHaveBeenCalledWith(...)` — mock assertions.
- Prefer a few precise assertions over many weak ones.

## Flaky tests

Flaky = non-deterministic. Root causes:
- Shared mutable state (DB not isolated, module-level mocks not reset).
- Timing (`setTimeout`-based tests without fake timers).
- Async / parallel interference.

Fix flaky immediately (skip is not a fix). Never merge flakes to main.

## Coverage

- Aim for **meaningful** tests, not a number. 100% coverage can still miss edge cases.
- CI gate at, e.g., 70% lines — low enough to not force useless tests, high enough to catch neglect.
- Track coverage trend. Don't let it drop.

## Snapshots

Use sparingly:
- Small, meaningful snapshots (e.g., the error envelope shape).
- Review snapshot diffs carefully — CI passes often "because snapshot updated."
- Avoid snapshots of large payloads (entity rows, HTML) — they become untrusted blobs.

## Golden tests for LLM output

LLM responses are non-deterministic. For LLM features:
- Test **shape** (JSON matches Zod schema) not exact content.
- Run a small eval set in CI with an allowed regression tolerance.
- See `26-ai-product-patterns.md`.

## Good vs bad

### Good

```ts
it('refunds only when payment is captured', async () => {
  repo.findById.mockResolvedValue({ id: 'p1', status: 'captured' } as any);
  await service.refund('p1');
  expect(stripe.refund).toHaveBeenCalledWith('p1');
});

it('throws InvalidStateError when payment is pending', async () => {
  repo.findById.mockResolvedValue({ id: 'p1', status: 'pending' } as any);
  await expect(service.refund('p1')).rejects.toThrow(InvalidStateError);
  expect(stripe.refund).not.toHaveBeenCalled();
});
```

### Bad

```ts
it('works', async () => {
  const service = new PaymentService(new StripeClient('real-key'));  // ❌ real external
  const result = await service.refund('p1');
  expect(result).toBeTruthy();                                        // ❌ vacuous assertion
});
```

## Anti-patterns

- Mocking the class under test.
- Tests that depend on test-ordering.
- Tests that sleep.
- Shared state between tests (static vars, global mocks).
- Asserting on private methods or internals.
- Tests without a clear arrange/act/assert structure.
- Copy-pasted setup across many tests (extract helpers).
- Skipping flaky tests ("I'll fix it later").
- Snapshots of large opaque blobs.
- E2E tests hitting real third-party APIs (mock the HTTP boundary).

## Code review checklist

- [ ] New code has unit tests for branching logic
- [ ] New endpoints have at least a happy-path + one error-path e2e test
- [ ] Mocks at module boundaries, not internals
- [ ] Integration tests use transaction isolation against a real DB
- [ ] Flaky tests identified and fixed
- [ ] Coverage maintained or improved
- [ ] Test names describe behavior (read like sentences)
- [ ] No tests sleeping or depending on timing
- [ ] No `only`, `skip`, or `xdescribe` committed

## See also

- [`04-code-quality.md`](./04-code-quality.md) — what to test vs skip
- [`05-thinking-decision-trees.md`](./05-thinking-decision-trees.md) — when a test is optional
- [`10-error-handling.md`](./10-error-handling.md) — asserting on error envelope
- [`14-database-orm-patterns.md`](./14-database-orm-patterns.md) — repository integration tests
