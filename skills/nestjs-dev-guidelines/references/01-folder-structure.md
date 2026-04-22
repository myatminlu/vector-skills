# 01 — Folder Structure

## TL;DR

- `src/` has exactly six top-level buckets: `core/`, `common/`, `integrations/`, `modules/`, `events/`, `commands/`.
- Every file belongs in exactly one bucket. If you're unsure, you're probably creating a new module.
- Domain folders are **singular** (`user/`, `payment/`). Shared-utility folders are **plural** (`pipes/`, `utils/`).
- Do not put business logic in `common/`. Do not put generic utilities in `modules/`.

## Why it matters

Folder layout is the first thing a new engineer sees. A consistent layout makes onboarding
fast, code review predictable, and LLM-assisted refactors safe. Without a layout rule,
developers invent their own — and in six months you have twelve ways to do the same thing.

## Canonical layout

```
src/
├── main.ts                      # bootstrap, global pipes/filters/interceptors
├── app.module.ts                # root module — imports feature + core modules only
│
├── core/                        # app-wide infrastructure, usually @Global()
│   ├── auth/
│   ├── database/
│   ├── cache/
│   ├── logger/
│   └── mail/
│
├── common/                      # generic, domain-less utilities
│   ├── decorators/
│   ├── dto/                     # e.g. PaginationQueryDto
│   ├── filters/                 # AllExceptionsFilter
│   ├── guards/                  # generic guards (not auth-specific)
│   ├── interceptors/            # ResponseEnvelopeInterceptor, TimeoutInterceptor
│   ├── pipes/                   # ParseCuidPipe, TrimPipe
│   ├── types/                   # shared type definitions
│   └── utils/                   # pure functions only
│
├── integrations/                # external service clients (thin wrappers)
│   ├── stripe/
│   ├── aws-s3/
│   ├── sendgrid/
│   └── anthropic/               # (AI products)
│
├── modules/                     # business feature modules
│   ├── user/
│   ├── organization/
│   ├── billing/
│   ├── conversation/            # (AI products)
│   └── ...
│
├── events/                      # domain event publishers/listeners
│   ├── user-created/
│   ├── payment-failed/
│   └── ...
│
└── commands/                    # CLI jobs, cron tasks
    ├── process-invoices.command.ts
    ├── backfill-usage.command.ts
    └── ...
```

## Bucket-by-bucket rules

### `core/` — app-wide infrastructure

- Modules that every feature needs: auth, database, cache, logger, mail.
- Usually `@Global()` so features don't have to re-import them.
- One subfolder per concern. Each has its own `*.module.ts`.
- If you find yourself re-importing a module in every feature, consider moving it to `core/`.

**Does not belong in `core/`:** business logic, domain models, feature-specific services.

### `common/` — generic utilities

- Domain-less. Works for any app.
- `pipes/`, `decorators/`, `interceptors/`, `filters/`, `guards/`, `utils/`, `types/`, `dto/` (only
  generic DTOs like `PaginationQueryDto`).
- Pure functions in `utils/` — no DI, no side effects.

**Does not belong in `common/`:** anything that imports from `modules/` or `integrations/`.
That is a circular-dependency trap.

### `integrations/` — external service clients

- One subfolder per provider.
- Each exports a `*.client.ts` (e.g. `stripe-payment.client.ts`) and a `*.module.ts`.
- The client is a thin wrapper: it knows how to talk to the vendor, nothing more.
- Business logic that uses the client lives in `modules/` — never here.

**Example structure:**
```
integrations/stripe/
├── stripe.module.ts
├── stripe-payment.client.ts      # thin wrapper around Stripe SDK
├── stripe-webhook.client.ts      # webhook signature verification
└── types/
    └── stripe-event.type.ts
```

### `modules/` — business features

- One subfolder per bounded context. Folder name is **singular** (`user/`, not `users/`).
- Owns its own DB tables.
- See `03-module-design.md` for full internal layout.

### `events/` — domain events

- One subfolder per event, kebab-case, past tense (`user-created/`, `payment-failed/`).
- Each has a publisher, one or more listeners, and a payload type.
- Use for **cross-module** events. In-module events can stay in the module.
- See `18-events.md`.

### `commands/` — CLI / CRON

- One file per command: `<name>.command.ts`.
- Commands can import from `modules/` to invoke business logic, but never contain business logic themselves.
- Use `nest-commander` or NestJS standalone app pattern.

## File-placement decision tree

```
You have a new file. Ask:

1. Is it a business feature (owns DB tables, has domain rules)?
   → modules/<feature>/
   
2. Is it app-wide infra (auth, redis, mail, cache, logger)?
   → core/<name>/
   
3. Is it a wrapper for an external API?
   → integrations/<provider>/
   
4. Is it a CLI/cron job?
   → commands/<name>.command.ts
   
5. Is it a domain event publisher/listener?
   → events/<event-name>/
   
6. Is it a pipe, decorator, interceptor, filter, guard, util, type, or generic DTO?
   → common/<kind>/
   
7. Is it specific to ONE module only?
   → modules/<that-module>/<kind>/   (e.g. modules/user/utils/)
```

## Good vs bad

### Good
```
src/modules/payment/
├── payment.module.ts
├── payment.controller.ts
├── payment.service.ts
├── dto/
│   ├── create-payment.dto.ts
│   └── list-payments.query.dto.ts
├── entities/
│   └── payment.entity.ts
└── index.ts
```

### Bad
```
src/payment/                        # wrong: not under modules/
├── PaymentModule.ts                # wrong: file name not kebab-case
├── PaymentController.ts
├── PaymentService.ts
├── dto.ts                          # wrong: DTOs bundled, not in dto/
├── helpers.ts                      # wrong: belongs in utils/
└── stripe.ts                       # wrong: integration in feature module
```

## Anti-patterns

- **"shared/" or "utils/" at the top level.** Use `common/` — the name is the rule.
- **Cross-module imports from deep paths.** Import from `modules/user` via its barrel `index.ts`, not from `modules/user/dto/create-user.dto.ts`.
- **Integrations in `core/`.** Stripe is not infrastructure; it's an external dependency. `integrations/`.
- **Business logic in `common/`.** If it references a user or a payment, it's not common.
- **"misc/" bucket.** No. If you don't know where it goes, re-read rules 1–7 above.

## Code review checklist

- [ ] Is the file under one of the six top-level buckets?
- [ ] Does the folder name match convention (singular for domain, plural for util)?
- [ ] Does a feature-specific file sit inside a feature module (not in `common/`)?
- [ ] Does an external-service wrapper sit in `integrations/` (not in a feature module)?
- [ ] Is there a barrel `index.ts` for any module that other modules import from?
- [ ] Is there zero cross-module deep-path import?

## See also

- [`02-naming-conventions.md`](./02-naming-conventions.md) — how files inside each folder are named
- [`03-module-design.md`](./03-module-design.md) — internal layout of a `modules/<feature>/`
- [`18-events.md`](./18-events.md) — when to put code in `events/` vs in a module
