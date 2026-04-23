# 02 — Naming Conventions

## TL;DR

- `camelCase` — variables, functions, methods, object keys in JSON responses
- `PascalCase` — classes, types, interfaces, enums, decorators
- `snake_case` — database tables, columns, JSON keys in DB JSONB fields
- `kebab-case` — file names, folder names, URL paths, DNS records
- `SCREAMING_SNAKE_CASE` — environment variables, module-level constants
- Domain folders are **singular** (`user/`), utility folders are **plural** (`pipes/`)
- Files follow `<name>.<kind>.ts`: `user.service.ts`, `create-user.dto.ts`, `jwt.guard.ts`

## Why it matters

Naming is one of two hard problems. Establish the rule once and it disappears — review comments
stop being about naming, onboarding speeds up, and grep becomes reliable. Inconsistent naming
creates implicit exceptions that accumulate into tech debt.

## Code (TypeScript)

| Thing | Convention | Example |
|---|---|---|
| Local variable | `camelCase` | `const userId = ...` |
| Function / method | `camelCase` | `function createUser()` |
| Class | `PascalCase` | `class UserService` |
| Interface / type | `PascalCase` | `interface UserProfile` |
| Enum | `PascalCase` + `PascalCase` members | `enum PaymentStatus { Pending, Paid }` |
| Constant | `SCREAMING_SNAKE` | `const MAX_RETRIES = 3` |
| Symbol / DI token | `SCREAMING_SNAKE` | `export const PG_POOL = Symbol('PG_POOL')` |
| Private field | `camelCase` with `private` | `private readonly pool: Pool` |
| Generic type param | Single uppercase | `function map<T>(...)` |
| Boolean var / prop | `isX` / `hasX` / `canX` | `isActive`, `hasPermission` |

**No Hungarian prefixes.** `IUserService`, `TPayment`, `E_Status` — all wrong.

## Files

### Pattern

`<subject>.<kind>.ts` — kebab-case subject, dot-separated kind.

| Kind | Suffix | Example |
|---|---|---|
| Module | `.module.ts` | `auth.module.ts` |
| Controller | `.controller.ts` | `user.controller.ts` |
| Service | `.service.ts` | `payment.service.ts` |
| Repository | `.repository.ts` | `user.repository.ts` |
| DTO | `.dto.ts` | `create-user.dto.ts` |
| Query DTO (GET params) | `.query.dto.ts` | `list-users.query.dto.ts` |
| Entity / ORM model | `.entity.ts` | `user.entity.ts` |
| Type | `.type.ts` | `user-profile.type.ts` |
| Interface | `.interface.ts` | `payment-provider.interface.ts` |
| Guard | `.guard.ts` | `jwt.guard.ts` |
| Pipe | `.pipe.ts` | `parse-cuid.pipe.ts` |
| Interceptor | `.interceptor.ts` | `logging.interceptor.ts` |
| Filter | `.filter.ts` | `all-exceptions.filter.ts` |
| Decorator | `.decorator.ts` | `current-user.decorator.ts` |
| Event | `.event.ts` | `user-created.event.ts` |
| Listener | `.listener.ts` | `send-welcome-email.listener.ts` |
| External client | `.client.ts` | `stripe-payment.client.ts` |
| CLI command | `.command.ts` | `process-invoices.command.ts` |
| Spec (unit test) | `.spec.ts` | `user.service.spec.ts` |
| E2E test | `.e2e-spec.ts` | `user.e2e-spec.ts` |

### DTO naming

- Create: `create-<entity>.dto.ts` → `CreateUserDto`
- Update: `update-<entity>.dto.ts` → `UpdateUserDto`
- Query params: `list-<entities>.query.dto.ts` → `ListUsersQueryDto`
- Response (only if explicit): `<entity>-response.dto.ts` → `UserResponseDto`

### Client naming

`<provider>-<entity>.client.ts` — groups multiple clients per provider cleanly.

- `stripe-payment.client.ts`
- `stripe-webhook.client.ts`
- `aws-s3.client.ts`
- `anthropic-messages.client.ts`

## Folders

### Domain (business feature) — singular

- `modules/user/`, `modules/payment/`, `modules/conversation/`

### Utility (collection of like things) — plural

- `common/pipes/`, `common/utils/`, `modules/user/dto/`, `modules/user/utils/`

### Infra / integration — singular

- `core/auth/`, `core/database/`, `integrations/stripe/`

## Database

- Tables: `snake_case`, **plural** — `users`, `payment_intents`, `api_keys`
- Columns: `snake_case` — `created_at`, `user_id`, `email_verified_at`
- Primary key: always `id`
- Foreign key: `<referenced_table_singular>_id` — `user_id`, `organization_id`
- Junction tables: `<a>_<b>` alphabetized — `organizations_users`, `posts_tags`
- Indexes: `idx_<table>_<cols>` — `idx_users_email`
- Unique constraints: `uq_<table>_<cols>` — `uq_users_email`
- Foreign keys: `fk_<table>_<col>` — `fk_posts_user_id`
- Boolean columns: `is_active`, `has_verified_email` (match code convention)
- Timestamp columns: `created_at`, `updated_at`, `deleted_at`, `<verb>_at`

See `13-database-design.md` for the full DB guide.

## URLs

- `kebab-case` — `/api/v1/organization-members`, never `/api/v1/organizationMembers`
- Resource nouns in **plural** — `/users`, `/payments`, `/conversations/:id/messages`
- Action endpoints (rare): `/v1/payments/:id/refund` (verb segment after the resource)

See `06-api-design.md`.

## JSON responses

- `camelCase` keys in response bodies — `{ "userId": "...", "createdAt": "..." }`
- Map from DB `snake_case` in the service/serializer layer.
- Exception: when a third-party contract requires snake_case (webhooks), match their contract.

## Environment variables

- `SCREAMING_SNAKE_CASE` — `DATABASE_URL`, `ANTHROPIC_API_KEY`
- Group by prefix — `DB_HOST`, `DB_PORT`, `DB_NAME`
- Boolean: `ENABLE_X` or `X_ENABLED` — `ENABLE_METRICS`, `RATE_LIMIT_ENABLED`

See `20-configuration.md`.

## Good vs bad

### Good
```ts
// user.service.ts
export class UserService {
  private readonly defaultPageSize = 20;
  async findById(userId: string): Promise<UserProfile> { ... }
}

// users table
CREATE TABLE users (
  id uuid PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Bad
```ts
// UserService.ts          ← PascalCase file
export class User_Service {  // ← snake_case class
  private DEFAULT_PAGE_SIZE = 20; // ← constant style on mutable field
  async find_by_id(UserID: string): Promise<IUserProfile> { ... }
  // ↑ snake_case fn, PascalCase param, "I" prefix on interface
}

CREATE TABLE User (         -- singular, PascalCase table
  ID uuid PRIMARY KEY,      -- uppercase column
  Email varchar(255),       -- PascalCase column
  createdAt timestamptz     -- camelCase column
);
```

## Anti-patterns

- **Hungarian or type-prefixed names** — `IUserService`, `TPayment`, `CPaymentService`
- **`utils.ts` or `helpers.ts` as dumping grounds** — split by topic (`date.utils.ts`, `string.utils.ts`)
- **`index.ts` re-exporting everything** — only export the public API; private files stay private
- **Plural domain folders** — `users/` suggests the folder represents a collection, not a bounded context
- **Mixing snake_case and camelCase in JSON** — pick one per surface (code = camelCase, DB = snake_case)
- **Abbreviations** — `usrSvc`, `pymt`, `cfg`. Spell it out: `userService`, `payment`, `config`
- **`Manager`, `Handler`, `Helper`, `Util` as class suffixes without meaning** — use a verb or concrete role: `UserRegistrar`, `PaymentCaptor`, `EmailDispatcher`

## Code review checklist

- [ ] All file names are kebab-case with the correct `.kind.ts` suffix
- [ ] Classes are `PascalCase`, functions and variables are `camelCase`
- [ ] No `I`-prefix on interfaces, no `T`-prefix on types
- [ ] DB tables are plural and `snake_case`; columns are `snake_case`
- [ ] URLs are `kebab-case` and plural for resources
- [ ] JSON response keys are `camelCase`
- [ ] Env vars are `SCREAMING_SNAKE_CASE`
- [ ] Domain folders singular, utility folders plural
- [ ] No abbreviations; no "misc"/"utils"/"helpers" without a subject

## See also

- [`01-folder-structure.md`](./01-folder-structure.md) — where each kind of file lives
- [`13-database-design.md`](./13-database-design.md) — DB naming in depth
- [`06-api-design.md`](./06-api-design.md) — URL naming and versioning
