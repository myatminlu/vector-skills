# 14 — Database ORM Patterns

## TL;DR

- Four common stacks: **raw pg**, **TypeORM**, **Prisma**, **Drizzle**. Each has trade-offs; pick one per project.
- Whatever the stack, follow `13-database-design.md` conventions (snake_case DB, camelCase app).
- Parameterize every query. Never string-concat user input.
- A repository / data-access layer hides the ORM behind stable interfaces. Services depend on the repository, not the ORM directly.
- Transactions are explicit; avoid "auto-transactions" except for single queries.

## Quick comparison

| | raw pg | TypeORM | Prisma | Drizzle |
|---|---|---|---|---|
| Type safety | manual | decorators (runtime-ish) | generated | ORM types via schema |
| Migrations | external tool | built-in (imperative + auto) | `prisma migrate` | `drizzle-kit` |
| Relations | manual SQL | entity decorators | schema-first | schema-first |
| Raw SQL escape hatch | 100% | `createQueryBuilder` / `query` | `$queryRaw` / `$executeRaw` | `sql` tagged template |
| Runtime overhead | none | moderate | moderate | low |
| Best for | full control, simple | traditional OOP, decorators | rapid dev, strong types | modern TS, SQL-close |

## Raw pg pattern (current repo style)

### Setup

```ts
// core/database/database.module.ts
import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = Symbol('PG_POOL');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (env: Env) => {
        const pool = new Pool({
          connectionString: env.DATABASE_URL,
          max: env.DATABASE_POOL_MAX,
        });
        pool.on('error', (e) => console.error('pg pool error', e));
        return pool;
      },
      inject: [ENV],
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
```

### Repository

```ts
// modules/user/user.repository.ts
@Injectable()
export class UserRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findById(id: string): Promise<User | null> {
    const { rows } = await this.pool.query<UserRow>(
      `SELECT id, email, name, created_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async insert(data: CreateUserData): Promise<User> {
    const { rows } = await this.pool.query<UserRow>(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [data.email, data.name, data.passwordHash],
    );
    return toDomain(rows[0]);
  }
}

// domain / row mapping lives beside the repo
interface UserRow { id: string; email: string; name: string; created_at: Date; }
function toDomain(r: UserRow): User {
  return { id: r.id, email: r.email, name: r.name, createdAt: r.created_at };
}
```

### Transactions

```ts
async createOrderWithItems(userId: string, items: Item[]): Promise<Order> {
  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (user_id) VALUES ($1) RETURNING *`, [userId],
    );
    for (const it of items) {
      await client.query(
        `INSERT INTO order_items (order_id, sku, qty) VALUES ($1, $2, $3)`,
        [order.id, it.sku, it.qty],
      );
    }
    await client.query('COMMIT');
    return toDomain(order);
  } catch (e) {
    await client.query('ROLLBACK'); throw e;
  } finally {
    client.release();
  }
}
```

### Migrations — external tool

Use `node-pg-migrate` or `dbmate`. See `15-migrations.md`.

## TypeORM

### Entity

```ts
// modules/user/entities/user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index } from 'typeorm';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true, where: 'deleted_at IS NULL' })
  @Column({ type: 'citext' })
  email!: string;

  @Column({ length: 200 })
  name!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt?: Date;
}
```

### Module wiring

```ts
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UserService],
})
export class UserModule {}

// service
@Injectable()
export class UserService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findById(id: string) {
    return this.users.findOne({ where: { id } });
  }
}
```

### Transactions

```ts
await this.dataSource.transaction(async (manager) => {
  const user = await manager.save(User, { email, name });
  await manager.save(Membership, { userId: user.id, ... });
});
```

### TypeORM pitfalls

- Eager relations by default fetch everything. Always opt-in per query.
- `synchronize: true` — **never in production.** Only migrations.
- Column `snake_case` requires `name:` override — default is camelCase.
- Default `cascade: false` — set per relation as needed.

## Prisma

### Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String    @id @default(uuid()) @db.Uuid
  email        String    @unique @db.Citext
  name         String    @db.VarChar(200)
  passwordHash String    @map("password_hash")
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt    DateTime? @map("deleted_at") @db.Timestamptz
  memberships  Membership[]

  @@map("users")
}
```

### Module

```ts
// core/database/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}

// service
@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}
  findById(id: string) {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }
}
```

### Transactions

```ts
await this.prisma.$transaction(async (tx) => {
  const user = await tx.user.create({ data: { email, name, passwordHash } });
  await tx.membership.create({ data: { userId: user.id, organizationId } });
});
```

### Prisma pitfalls

- Soft delete is not built-in — use `where: { deletedAt: null }` manually or Prisma middleware.
- Migrations lock the table — plan for large data. See `15`.
- `$queryRaw` requires the tagged-template form for safety: `$queryRaw\`SELECT ... ${id}\`\`.
- Prisma generates types on schema change — commit the generated client or run `prisma generate` in CI.

## Drizzle

### Schema

```ts
// modules/user/schema.ts
import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    emailUq: uniqueIndex('uq_users_email_active').on(t.email).where(sql`${t.deletedAt} IS NULL`),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### Service

```ts
@Injectable()
export class UserService {
  constructor(@Inject(DRIZZLE) private readonly db: NodePgDatabase) {}

  async findById(id: string): Promise<User | null> {
    const [row] = await this.db
      .select().from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
    return row ? toDomain(row) : null;
  }
}
```

### Transactions

```ts
await this.db.transaction(async (tx) => {
  const [user] = await tx.insert(users).values({ email, name, passwordHash }).returning();
  await tx.insert(memberships).values({ userId: user.id, organizationId });
});
```

### Drizzle pitfalls

- No built-in soft delete — manually add `isNull(deletedAt)` or define helper.
- Schema-first means `.ts` is source of truth; `drizzle-kit` generates migrations.
- Query builder is SQL-close — easy to misuse if you don't know SQL.

## Common rules across ORMs

### Always use a repository / data-access layer

```ts
// ❌ service uses ORM directly, leaks schema details
@Injectable()
export class OrderService {
  constructor(@InjectRepository(Order) private readonly orders: Repository<Order>) {}
  create(dto: CreateOrderDto) {
    return this.orders.save({ ...dto, customerJoinedThingy: ... });
  }
}

// ✅ repository hides the ORM
@Injectable()
export class OrderRepository {
  constructor(@InjectRepository(Order) private readonly repo: Repository<Order>) {}
  async insert(data: CreateOrderData): Promise<Order> { ... }
  async findById(id: string): Promise<Order | null> { ... }
}

@Injectable()
export class OrderService {
  constructor(private readonly orders: OrderRepository) {}
  create(dto: CreateOrderDto) {
    return this.orders.insert(toOrderData(dto));
  }
}
```

Repository can be mocked in tests; the ORM choice can change later.

### Domain model vs row model

- **Row model** — matches DB columns (snake_case, `Date` timestamps).
- **Domain model** — camelCase, richer types, business methods.
- Map in the repository. Never leak row types into services or controllers.

### N+1 avoidance

- Prefer a single query with JOINs over multiple sequential queries.
- TypeORM `relations: ['membership', 'membership.organization']` or query builder.
- Prisma `include: { memberships: { include: { organization: true } } }`.
- Drizzle: explicit join + selectFields.
- Measure with your logger timing + occasional `EXPLAIN`.

### Connection pooling

- Always through a pool (`pg.Pool`, `DataSource`, `PrismaClient` internal pool).
- Size: start with `CPU × 2` per instance; measure. Too many connections hurts Postgres.
- Release connections promptly; use try/finally around `client.release()` in raw pg.

### Logging SQL

- In dev, log all SQL.
- In prod, log **slow** queries (> 100 ms) with parameter redaction.
- Never log parameter values of PII / secrets.

## Good vs bad

### Good (repository pattern)

```ts
const user = await this.users.findById(id);
if (!user) throw new NotFoundException({ code: 'USER.NOT_FOUND' });
```

### Bad (service reaching into ORM)

```ts
const user = await this.userRepo.findOne({
  where: { id, is_active: true },                       // ❌ leaking column semantics
  relations: ['payments', 'memberships', 'profile'],    // ❌ N+1 or over-fetch
});
if (!user) return { error: 'not found' };               // ❌ not throwing
```

## Anti-patterns

- Service directly using ORM query API (couples service to ORM).
- Entity classes with business logic methods ("active record"): mix of concerns.
- Multi-ORM in one project.
- `synchronize: true` in TypeORM against prod.
- Raw string SQL with template literals instead of parameters.
- Transactions spanning HTTP boundaries (long-held connections).
- Mutable `updatedAt` maintained by app instead of DB trigger.

## Code review checklist

- [ ] Repository layer exists; services don't use ORM query API directly
- [ ] DB rows mapped to domain types in repository
- [ ] All queries parameterized; no string concatenation
- [ ] Soft-delete filter applied consistently
- [ ] Transactions wrap multi-row / multi-table writes
- [ ] Relations fetched explicitly (no silent N+1)
- [ ] Connection released in every code path (finally)
- [ ] ORM choice is consistent across the project

## See also

- [`13-database-design.md`](./13-database-design.md) — schema conventions
- [`15-migrations.md`](./15-migrations.md) — ORM-specific migrations
- [`16-cascade-rules.md`](./16-cascade-rules.md) — ON DELETE semantics
- [`24-performance.md`](./24-performance.md) — N+1, pool sizing
