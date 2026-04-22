# 04 — Code Quality

## TL;DR

- Controllers are thin; services hold business logic; repositories hold DB access.
- Constructor DI only. No `new Service()`, no static `Service.method()`.
- Small, single-purpose functions. If a function spans two screens, split it.
- No `any` without a justifying comment. Prefer `unknown` at boundaries + narrowing.
- Immutability by default. `readonly`, `const`, `as const`. Don't mutate function args.
- Pure utilities in `utils/`. If it needs DI, it's a service, not a util.
- Fail loudly at boundaries, fail soft internally. Let errors bubble unless you can meaningfully recover.

## Why it matters

Code quality is not aesthetics; it's how long it takes the next person (or you in six months,
or an LLM) to safely change the code. Every cleverness you add today is a 10× debugging tax
tomorrow. Boring code wins.

## Layering

```
HTTP request
  ↓
[Guard]               auth, throttle, permission
  ↓
[Interceptor — pre]   logging, tracing, timeout
  ↓
[Pipe]                validation, transformation (DTO in, entity out)
  ↓
[Controller]          thin: delegate to service, shape response
  ↓
[Service]             business logic, orchestration, transactions
  ↓
[Repository / ORM]    DB access, queries
  ↓
Database
```

- **Controller:** parse input → call service → return. No branching on domain rules.
- **Service:** all business rules. Returns domain objects or throws domain errors.
- **Repository:** DB only. Does not know about HTTP or DTOs.

### Good

```ts
// user.controller.ts — thin
@Post()
async create(@Body() dto: CreateUserDto): Promise<UserResponse> {
  const user = await this.users.create(dto);
  return UserResponse.from(user);
}

// user.service.ts — logic
async create(dto: CreateUserDto): Promise<User> {
  await this.assertEmailAvailable(dto.email);
  const passwordHash = await this.hasher.hash(dto.password);
  const user = await this.repo.insert({ ...dto, passwordHash });
  await this.events.emit(new UserCreatedEvent(user));
  return user;
}

private async assertEmailAvailable(email: string) {
  if (await this.repo.existsByEmail(email)) {
    throw new ConflictException({ code: 'USER.EMAIL_TAKEN' });
  }
}
```

### Bad

```ts
// user.controller.ts — fat controller, DB in HTTP layer
@Post()
async create(@Body() dto: CreateUserDto, @Req() req) {
  if (await this.db.query('SELECT 1 FROM users WHERE email=$1', [dto.email])) {
    return res.status(409).json({ error: 'email taken' });
  }
  const hash = await bcrypt.hash(dto.password, 10);
  const id = randomUUID();
  await this.db.query('INSERT INTO users ...');
  // ... everything mashed together
}
```

## SOLID, applied

- **S — Single Responsibility.** One reason to change. A service that both sends email AND
  processes payment has two reasons.
- **O — Open/Closed.** Extend via DI (new strategy class), not by editing a switch.
- **L — Liskov.** If two classes implement the same interface, they should be swappable. No
  throwing "not supported" in a subclass.
- **I — Interface Segregation.** Small interfaces. A service needing only `findById` shouldn't
  take a god-object repo.
- **D — Dependency Inversion.** Depend on interfaces (or DI tokens), not concrete classes
  when the impl might change (e.g. payment provider).

## Constructor DI only

```ts
// Good
@Injectable()
export class OrderService {
  constructor(
    private readonly payments: PaymentService,
    private readonly users: UserService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}
}

// Bad
export class OrderService {
  private payments = new PaymentService();            // ❌ no DI
  static instance = new OrderService();                // ❌ singleton
  async x() { return await PaymentService.charge(); } // ❌ static service
}
```

DI gives you: testability (swap for mock), lifecycle (NestJS manages `onModuleInit`/destroy),
request scoping when needed.

## Small functions

- Target ≤ 30 lines per function. If you're scrolling, split.
- Extract subtasks into private methods with names that describe **what** they do, not **how**.
- Flat is better than nested. Early return instead of deep `if/else`.

### Good
```ts
async register(dto: RegisterDto): Promise<User> {
  await this.assertEmailAvailable(dto.email);
  const user = await this.createUserRow(dto);
  await this.sendVerificationEmail(user);
  return user;
}
```

### Bad
```ts
async register(dto: RegisterDto): Promise<User> {
  if (await this.repo.existsByEmail(dto.email)) {
    throw new ConflictException();
  } else {
    const hash = await bcrypt.hash(dto.password, 10);
    const user = { id: randomUUID(), email: dto.email, password: hash, ... };
    try {
      await this.repo.insert(user);
      try {
        const token = jwt.sign({ sub: user.id }, 'secret');
        await this.mailer.send(user.email, `verify at /verify?t=${token}`);
      } catch (e) {
        // what now? rollback? ignore?
      }
      return user;
    } catch (e) {
      throw e;
    }
  }
}
```

## Types

### Prefer `unknown` over `any`

```ts
// Good — unknown forces you to narrow before use
function parseJson(raw: string): unknown {
  return JSON.parse(raw);
}
const data = parseJson(x);
if (isUserDto(data)) { ... }

// Bad — any disables the type system
function parseJson(raw: string): any {
  return JSON.parse(raw);
}
const data = parseJson(x);
data.whatever.youWant(); // no error, will crash at runtime
```

### `readonly` by default

```ts
// Good
interface User {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
}

// And mark service-held state
@Injectable()
export class PaymentService {
  constructor(private readonly stripe: StripeClient) {}
}
```

### Narrow enums

Use string literal unions or `as const` objects instead of TS enums:

```ts
// Good
export const PaymentStatus = {
  Pending: 'pending',
  Paid: 'paid',
  Refunded: 'refunded',
} as const;
export type PaymentStatus = typeof PaymentStatus[keyof typeof PaymentStatus];

// Avoid — TS enums emit runtime code and are harder to serialize
export enum PaymentStatus { Pending, Paid, Refunded }
```

### Discriminated unions for variants

```ts
type CheckoutResult =
  | { kind: 'success'; orderId: string }
  | { kind: 'declined'; reason: string }
  | { kind: 'pending_3ds'; redirectUrl: string };

switch (result.kind) {
  case 'success':     // result.orderId is typed
  case 'declined':    // result.reason is typed
  case 'pending_3ds': // result.redirectUrl is typed
}
```

## Immutability

- `const` over `let`. `let` is a signal you're mutating; re-read the code first.
- Don't mutate function arguments. Return a new value.
- Prefer `.map/.filter/.reduce` over `push` in loops when building arrays.

```ts
// Good
const withTotals = orders.map(o => ({ ...o, total: o.items.reduce((s, i) => s + i.price, 0) }));

// Bad — mutates input
for (const o of orders) { o.total = o.items.reduce(...); }
```

## Null / undefined

- Distinguish them: `null` = "we checked and there's nothing"; `undefined` = "not yet loaded / not provided."
- Prefer one style per codebase. Commonly: `null` in DB rows, `undefined` in optional inputs.
- Use `??` for defaults (not `||` which treats `0`/`''`/`false` as missing).
- Non-null assertion `!` is a smell — prove non-null with a check or refactor the types.

## Pure utilities

A "util" function:
- Takes only arguments, returns a value.
- No I/O, no DB, no clock, no randomness (inject those).
- Deterministic — same input, same output.
- Lives in `common/utils/` or `modules/<feature>/utils/`.

```ts
// Good — pure
export function calculateFee(amount: number, rate: number): number {
  return Math.round(amount * rate);
}

// Bad — not pure (uses clock, DB)
export async function calculateFee(paymentId: string): Promise<number> {
  const row = await db.query('SELECT ...');
  const now = Date.now();
  // ...
}
// This should be a service method, not a util.
```

## Error handling

- Throw at the boundary when you can't recover. Let NestJS's global filter handle it.
- Domain errors: extend `HttpException` or a base `DomainError` with a stable `code`.
- Don't swallow errors with bare `catch { }`. If you catch, you handle — log + rethrow or transform.
- `try/catch` around the specific line that throws, not the whole function.

See `10-error-handling.md`.

## Async

- Always `await` a Promise or explicitly handle it with `.catch(...)`. Floating promises crash the process.
- ESLint rule `@typescript-eslint/no-floating-promises` catches this.
- Use `Promise.all` for independent operations; don't serialize needlessly.
- Use `Promise.allSettled` when one failing shouldn't stop the others.

## Comments

- Default: no comment. The code and name say it.
- Write a comment for **why**, not **what** — a hidden invariant, a weird workaround, a reference to a ticket.
- Update or delete stale comments. A wrong comment is worse than none.
- Delete commented-out code. Use git history.

## Performance defaults

- Don't premature-optimize. Correctness first; profile second; optimize third.
- But: avoid N+1 queries, unbounded `SELECT *`, and synchronous hashing on the event loop.
- See `24-performance.md`.

## Anti-patterns

- **Business logic in controllers.** Even "just this one check."
- **Services that know about HTTP.** `res.status(404).json()` in a service — no.
- **Mutating function arguments.** Especially arrays / objects.
- **`any` to make TS happy.** Narrow the type instead.
- **Giant god services with 50+ methods.** Split by sub-responsibility.
- **Abstract base classes for "framework" code.** Prefer composition + DI.
- **"Manager", "Handler", "Util" classes with no verb.** What does it actually do?
- **Premature abstractions.** Three similar lines is fine; wait for four before extracting.
- **Flags / booleans driving divergent behavior in one method.** Polymorphism or split the method.

## Code review checklist

- [ ] Controller is thin (≤15 lines per handler); no branching on domain rules
- [ ] Service has the business logic; repository has DB only
- [ ] Constructor DI; no `new` on services; no static service methods
- [ ] Functions are focused (≤30 lines); flat control flow; early returns
- [ ] No `any` without a comment explaining why
- [ ] `readonly` on fields and interface props where possible
- [ ] Enums are `as const` string unions, not TS enums
- [ ] No floating promises; all async handled
- [ ] Pure utilities in `utils/`; side effects in services
- [ ] No commented-out code; no stale comments
- [ ] No mutation of function arguments

## See also

- [`03-module-design.md`](./03-module-design.md) — where services and controllers live
- [`10-error-handling.md`](./10-error-handling.md) — throwing and catching
- [`17-pipelines-interceptors-guards.md`](./17-pipelines-interceptors-guards.md) — what belongs in each layer
- [`23-testing.md`](./23-testing.md) — testing at the service layer
