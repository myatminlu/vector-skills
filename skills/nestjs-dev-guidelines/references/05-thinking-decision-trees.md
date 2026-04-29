# 05 — Thinking & Decision Trees

## TL;DR

Senior engineers make decisions from principles, not checklists. These trees encode the
principles you need when a rule doesn't explicitly apply. When two rules conflict, the one
higher in this file wins.

## Priority order (when rules conflict)

1. **Correctness** — does it do what it claims?
2. **Security** — can it leak, escalate, or be abused?
3. **Data integrity** — can it corrupt or lose data?
4. **Reversibility** — can we undo or fix this later if wrong?
5. **Consistency** — does it match the rest of the codebase?
6. **Readability** — can the next person understand it?
7. **Performance** — is it fast enough for the real load?
8. **Cleverness** — is it elegant? (Lowest priority. Elegance that costs any of the above loses.)

## Where does this file go?

```
Is it a business feature (owns DB tables, has domain rules)?
├── Yes → modules/<feature>/
└── No →
    Is it app-wide infra (auth, DB, cache, mail, logger)?
    ├── Yes → core/<name>/
    └── No →
        Is it a wrapper around an external API (Stripe, S3, Anthropic)?
        ├── Yes → integrations/<provider>/
        └── No →
            Is it a CLI/cron job?
            ├── Yes → commands/<name>.command.ts
            └── No →
                Is it a domain event publisher/listener?
                ├── Yes → events/<event-name>/
                └── No →
                    Is it a pipe/decorator/interceptor/filter/guard/util/type/generic-DTO?
                    ├── Yes, used by 2+ modules → common/<kind>/
                    ├── Yes, used by 1 module  → modules/<that-module>/<kind>/
                    └── (rare) Does not fit any of the above → reconsider the design
```

## Should I create a new module?

```
Does the concept own one or more DB tables?
├── Yes → new module
└── No →
    Does the concept have its own domain rules or lifecycle?
    ├── Yes → new module
    └── No →
        Is it used by multiple modules, but owns no data?
        ├── Yes → common/ utility or core/ infra (depending on scope)
        └── No →
            Is it a helper for ONE module only?
            └── Yes → that module's internal utils/
```

**Red flags that you're creating a module too early:**
- Only one file in it after a week.
- No controller, no service — just constants or types.
- You had to invent a name like "SharedThingsModule".

**Red flags that you should have created a module:**
- A single service is 1000+ lines and touches four different concerns.
- A controller imports from five deep paths across `modules/`.
- Multiple teams keep merging into the same file.

## Should I refactor this now?

```
Am I already editing this file for a different reason?
├── Yes → clean small things as you go (Boy Scout rule)
└── No →
    Is the code blocking my current task?
    ├── Yes → refactor minimally to unblock
    └── No →
        Is the code actively producing bugs or security issues?
        ├── Yes → new task / ticket; plan the refactor
        └── No →
            Is the code merely "ugly" or "not how I'd do it"?
            └── Yes → leave it. Note it. Move on.
```

**Small refactors** (rename a variable, extract a function, inline a wrapper) — do as you
go. **Large refactors** (restructure a module, change a contract) — always a separate PR
with reviewers and tests.

## Should I write a test?

Match the kind of code, top to bottom — the first row that fits decides the test strategy.

| Kind of code                                              | Test strategy                                |
|-----------------------------------------------------------|----------------------------------------------|
| Controller                                                | e2e test always (covers the full chain)      |
| Service with branching / conditional logic                | unit test always                             |
| Service that's pure pass-through (`findById`, delegation) | skip unit; e2e covers it                     |
| Repository with a non-trivial query (joins, CTEs, window) | integration test with a real DB              |
| Repository doing simple CRUD                              | skip; e2e covers it                          |
| Pure utility                                              | unit test (cheap, high value)                |
| DTO, type, interface                                      | no test (the compiler is the test)           |

**Skip tests when:**
- It's a one-line delegation (`async findById(id) { return this.repo.findById(id); }`)
- It's trivially type-checked (DTOs, types)
- The logic is tested via e2e already, and unit test would duplicate coverage

**Never skip tests when:**
- Branching on user role / permissions / security
- Money calculations
- External side effects (email, webhook, payment)
- Reproducing a bug (regression test)

## Should I add this abstraction?

```
Do I have a concrete, repeated use case RIGHT NOW?
├── No → don't abstract. Write concrete code. Wait for the third case.
└── Yes →
    Would a small helper function suffice?
    ├── Yes → helper function in utils/
    └── No →
        Is the varying behavior along one axis (strategy)?
        ├── Yes (one axis) → interface + 2+ implementations (DI strategy pattern)
        └── No (many axes) → reconsider. Often the concept is two separate things.
```

**"YAGNI" rule:** three similar lines is fine. Wait until the fourth before extracting.
Premature abstractions are harder to remove than duplicate code.

## Should I swallow this error?

```
Can I meaningfully recover from it?
├── Yes (retry, fallback, use default) → catch, log context, recover
└── No →
    Is it a domain-meaningful error (e.g. InvalidInput, Forbidden)?
    ├── Yes → rethrow as a typed HttpException with a stable code
    └── No (unknown / infra error) →
        Let it bubble. The global filter logs and returns 500.
```

**Never do:**
- `try { ... } catch { /* swallow */ }`
- `catch (e) { console.log(e); }` and continue as if nothing happened
- `catch (e) { throw e; }` (no-op, delete the try/catch)

## Should I add this env var?

```
Is it a secret (API key, DB password)?
├── Yes → env var, never in code
└── No →
    Does it vary by environment (dev/staging/prod)?
    ├── Yes → env var, validated at boot
    └── No →
        Does it vary between deployments of the same environment?
        ├── Yes → env var
        └── No → it's a constant. Put it in code as a `const`.
```

Every env var must appear in `.env.example` and be validated by the Zod schema at boot.
See [`20-configuration.md`](./20-configuration.md).

## Should I return null or throw?

```
Is the caller asking a question ("does X exist?")?
├── Yes → return null / undefined / boolean
└── No →
    Is the absence a domain error (item expected but missing)?
    ├── Yes → throw NotFoundException (or typed DomainError)
    └── No →
        Is it optional by contract?
        ├── Yes → return null / undefined
        └── No → throw
```

Rule of thumb: `findByIdOrNull` returns nullable; `findById` throws. Be consistent in naming.

## Should I use a transaction?

```
Do two or more writes need to succeed together (or fail together)?
├── Yes → transaction (BEGIN ... COMMIT)
└── No →
    Does a later write depend on a read being unchanged?
    ├── Yes → SELECT ... FOR UPDATE inside a transaction
    └── No → single statement; no transaction needed
```

Any mutation that spans 2+ tables or 2+ rows that must stay consistent → transaction.
Examples: create order + decrement inventory; charge payment + insert invoice.

## Should I run this async (queue it)?

```
Can the user's HTTP response wait for this work?
├── Yes (< 200ms, reliable) → inline
└── No →
    Is it safe to lose this work if the process crashes?
    ├── Yes → fire-and-forget with a catch
    └── No → queue it (BullMQ) with retries and DLQ
```

Rules of thumb: always queue email, webhook delivery, LLM calls longer than a few seconds,
expensive reports. Never queue auth / payment capture / anything the user is waiting on.

## Should I add a migration, or edit in place?

```
Is the code already deployed to any environment?
├── Yes → new migration. Never edit a shipped migration.
└── No (fresh local change, not in a review yet) →
    Is the migration already in a PR that others are reviewing?
    ├── Yes → new migration on top
    └── No → edit in place (but double-check before pushing)
```

See [`15-migrations.md`](./15-migrations.md). Once a migration has run anywhere (including a
teammate's local DB that synced from your branch), it's immutable.

## Should I cache this?

```
Is the read rate >> the write rate, and is the underlying read expensive?
├── No → don't cache. Premature cache = stale data bugs.
└── Yes →
    Do I have a clear invalidation trigger (write-through, TTL, event)?
    ├── No → don't cache. Invalidation is the hard part.
    └── Yes → cache with explicit TTL + invalidation key strategy.
```

Cache only the hot read paths. Never cache auth decisions, quotas, or money.

## Should I write a feature flag?

```
Is the rollout risky or per-user variable?
├── Yes → feature flag (GrowthBook, Unleash, or simple env + user allowlist).
│         Add it only if you'll remove it within ~2 weeks of full rollout —
│         unremoved flags become config that nobody remembers.
└── No → no flag. Ship the change directly.
```

## Red flags — if you see these, stop and reconsider

- "Temporary" workarounds that have been there > 2 weeks.
- `// TODO: remove this hack` without a ticket.
- Multiple places in code that must be edited together ("if you change A, also change B").
- A function that takes a boolean flag to "turn on" radically different behavior.
- Names like `Manager`, `Handler`, `Util`, `Service`, `Helper` with no more specific role.
- Copy-pasted code across modules (vs intentional duplication with a different shape).
- Magic numbers without names.
- Mocks in integration/e2e tests of the code under test.
- Mutations of shared state across async boundaries.

## Green flags — signs the code is healthy

- You can delete a module and only its consumers break (not half the app).
- Adding a new feature doesn't require editing > 2–3 existing files (open/closed).
- Tests fail when behavior changes, not when implementation changes.
- Error messages tell you exactly what went wrong and what to do.
- A new engineer can find where a given feature lives in < 60 seconds by folder name alone.

## See also

- [`04-code-quality.md`](./04-code-quality.md) — what "clean" means in practice
- [`03-module-design.md`](./03-module-design.md) — module boundary rules
- [`29-code-review-checklist.md`](./29-code-review-checklist.md) — applying these at review time
