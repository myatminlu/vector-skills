# 30 — Code Review Anti-Patterns (Catalog)

A grep-able list of common anti-patterns with good-vs-bad code. Use this during reviews: if
you spot the "bad", quote the "good" in your comment.

---

## A1 — Business logic in controller

**Bad**
```ts
@Post()
async create(@Body() body: any, @Req() req) {
  if (await this.db.query(`SELECT 1 FROM users WHERE email='${body.email}'`)) {
    return res.status(409).json({ error: 'email taken' });
  }
  const hash = await bcrypt.hash(body.password, 10);
  await this.db.query('INSERT INTO users ...');
  // ...
}
```

**Good**
```ts
@Post()
async create(@Body() dto: CreateUserDto): Promise<User> {
  return this.users.create(dto);
}
```

See `04`.

---

## A2 — Missing DTO / validation

**Bad**
```ts
@Post()
async create(@Body() body: object) { ... }
```

**Good**
```ts
@Post()
async create(@Body() dto: CreateUserDto) { ... }  // DTO with @IsEmail, @Length, etc.
```

See `09`.

---

## A3 — SQL string concatenation

**Bad**
```ts
await this.db.query(`SELECT * FROM users WHERE email = '${email}'`);
```

**Good**
```ts
await this.db.query('SELECT * FROM users WHERE email = $1', [email]);
```

See `11`, `14`.

---

## A4 — Returning `{ success: false }` with HTTP 200

**Bad**
```ts
return res.status(200).json({ success: false, error: 'bad' });
```

**Good**
```ts
throw new BadRequestException({ code: 'REQUEST.BAD', message: 'Invalid input' });
// filter renders { error: { code, message, traceId } } with HTTP 400
```

See `07`, `10`.

---

## A5 — Mass-assignment

**Bad**
```ts
@Put(':id')
update(@Param('id') id: string, @Body() body: any) {
  return this.users.update(id, body);  // "role":"admin" sneaks in
}
```

**Good**
```ts
@Put(':id')
update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
  return this.users.update(id, dto);  // DTO excludes role + other privileged fields
}
// with global ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })
```

See `09`, `11`.

---

## A6 — Missing auth guard

**Bad**
```ts
@Controller('payments')
export class PaymentController {
  @Get(':id')
  get(@Param('id') id: string) { return this.repo.findById(id); }
}
```

**Good**
```ts
@UseGuards(AuthGuard)
@Controller({ path: 'payments', version: '1' })
export class PaymentController {
  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const p = await this.repo.findById(id);
    if (p.userId !== user.id) throw new ForbiddenException({ code: 'AUTH.INSUFFICIENT_PERMISSION' });
    return p;
  }
}
```

See `11`, `12`, `17`.

---

## A7 — Unbounded list endpoint

**Bad**
```ts
@Get()
async list() { return this.repo.findAll(); }
```

**Good**
```ts
@Get()
async list(@Query() q: ListPaymentsQueryDto): Promise<Envelope<Payment[]>> {
  const { rows, nextCursor, hasMore } = await this.repo.list(q);
  return { data: rows, meta: { pagination: { nextCursor, hasMore, limit: q.limit } } };
}
```

See `08`.

---

## A8 — User-supplied sort / filter on raw column

**Bad**
```ts
const sql = `SELECT * FROM payments ORDER BY ${req.query.sortBy} LIMIT 50`;
```

**Good**
```ts
const allowed = new Set(['createdAt', 'amount', 'status']);
if (!allowed.has(q.sort)) throw new BadRequestException({ code: 'QUERY.INVALID_SORT_FIELD' });
const sql = `SELECT * FROM payments ORDER BY ${q.sort} LIMIT 50`;
```

See `08`.

---

## A9 — Naked fetch without timeout

**Bad**
```ts
const resp = await fetch('https://api.stripe.com/...');
```

**Good**
```ts
const resp = await fetch('https://api.stripe.com/...', {
  signal: AbortSignal.timeout(5000),
});
```

See `10`, `24`.

---

## A10 — Silent catch

**Bad**
```ts
try { await risky(); } catch { /* ignore */ }
```

**Good**
```ts
try {
  await risky();
} catch (e) {
  this.logger.warn({ err: e }, 'risky failed; falling back');
  await fallback();
}
```

See `10`.

---

## A11 — Bare `throw e` or no-op try/catch

**Bad**
```ts
try { return await a(); } catch (e) { throw e; }
```

**Good** (remove the try/catch, or add context)
```ts
return await a();
// or
try {
  return await a();
} catch (e) {
  throw new AppException(500, { code: 'A.FAILED', message: 'A failed', details: { cause: String(e) } });
}
```

See `10`.

---

## A12 — `console.log` in app code

**Bad**
```ts
console.log('user created', user);
```

**Good**
```ts
this.logger.info({ userId: user.id }, 'user created');
```

See `21`.

---

## A13 — Logging PII / secrets

**Bad**
```ts
this.logger.info({ email, password, authHeader }, 'signing in');
```

**Good**
```ts
this.logger.info({ userId: user.id }, 'sign-in succeeded');  // no PII / no secret
// pino redact config strips any remaining password / authorization fields
```

See `21`, `11`.

---

## A14 — Float money

**Bad**
```sql
amount numeric(10,2) NOT NULL
```
```ts
total = items.reduce((s, i) => s + i.price, 0)  // float accumulation bug
```

**Good**
```sql
amount_cents bigint NOT NULL CHECK (amount_cents >= 0)
```
```ts
const total = items.reduce((s, i) => s + i.amountCents, 0); // integer, safe
```

See `13`, `24`.

---

## A15 — Timestamp without tz

**Bad**
```sql
created_at timestamp NOT NULL DEFAULT now()
```

**Good**
```sql
created_at timestamptz NOT NULL DEFAULT now()
```

See `13`.

---

## A16 — Missing FK index

**Bad**
```sql
CREATE TABLE orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id)
);
-- no index on user_id
```

**Good**
```sql
CREATE INDEX idx_orders_user ON orders (user_id);
```

See `13`.

---

## A17 — Cross-module DB read

**Bad**
```ts
// orders module reading payments.* directly
await this.db.query('SELECT * FROM payments WHERE id = $1', [id]);
```

**Good**
```ts
// orders module uses PaymentService
await this.payments.findById(id);
```

See `03`.

---

## A18 — Editing a shipped migration

**Bad**
Edit `20260301_add_users_table.sql` to add a column.

**Good**
Add a new migration `20260422_add_users_phone_column.sql`.

See `15`.

---

## A19 — `synchronize: true` in production

**Bad**
```ts
TypeOrmModule.forRoot({ synchronize: true })
```

**Good**
```ts
TypeOrmModule.forRoot({ synchronize: env.NODE_ENV === 'development' })
// and run `typeorm migration:run` in prod
```

See `14`, `15`.

---

## A20 — Cascading into a huge child table

**Bad**
```sql
ALTER TABLE users DROP COLUMN id CASCADE;  -- cascades into billions of rows
```

**Good**
Plan a scheduled, chunked backfill + a non-cascading migration sequence.

See `15`, `16`.

---

## A21 — Non-idempotent queue handler

**Bad**
```ts
async handle(job) { await this.mail.send(job.data.email); }   // double-send on retry
```

**Good**
```ts
async handle(job) {
  if (await this.sent.wasSent(job.data.userId, 'welcome')) return;
  await this.mail.send(job.data.email);
  await this.sent.mark(job.data.userId, 'welcome');
}
```

See `19`.

---

## A22 — Direct LLM SDK from a feature

**Bad**
```ts
import Anthropic from '@anthropic-ai/sdk';
async summarize(text: string) {
  const a = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return a.messages.create({ model: 'claude-latest', ... });
}
```

**Good**
```ts
async summarize(text: string) {
  return this.llm.call({ model: 'claude-sonnet-4-6', messages: [...] });
}
```

See `26`.

---

## A23 — Unvalidated LLM JSON

**Bad**
```ts
const data = JSON.parse(llmResult.text);
return { title: data.title, tone: data.tone };  // trusts unknown
```

**Good**
```ts
const data = SummarySchema.parse(JSON.parse(llmResult.text));  // Zod
return data;
```

See `26`.

---

## A24 — Mock of the class under test

**Bad**
```ts
const service = new PaymentService(...);
jest.spyOn(service as any, 'calculateFee').mockReturnValue(100);  // mocking impl of the service
await service.charge(...);
```

**Good**
```ts
// extract calculateFee into a util or injected dep, then replace the dep in test
```

See `23`.

---

## A25 — Vacuous test

**Bad**
```ts
it('works', async () => { expect(await service.do()).toBeTruthy(); });
```

**Good**
```ts
it('rejects refund when payment is not captured', async () => {
  repo.findById.mockResolvedValue({ id: 'p1', status: 'pending' });
  await expect(service.refund('p1')).rejects.toThrow(InvalidStateError);
});
```

See `23`.

---

## A26 — N+1 query

**Bad**
```ts
const orders = await this.orders.findAll();
for (const o of orders) o.items = await this.items.findByOrder(o.id);
```

**Good**
```ts
const orders = await this.orders.findAllWithItems();  // one query with JOIN / include
```

See `24`, `14`.

---

## A27 — `SELECT *`

**Bad**
```ts
await this.db.query('SELECT * FROM users WHERE id = $1', [id]);
// leaks password_hash, deleted_at, internal columns to serializer
```

**Good**
```ts
await this.db.query(
  'SELECT id, email, name, created_at FROM users WHERE id = $1 AND deleted_at IS NULL',
  [id],
);
```

See `13`, `24`.

---

## A28 — Response envelope per endpoint

**Bad**
```ts
@Get()  return { users: [...] };           // endpoint 1
@Get()  return { result: { ... } };         // endpoint 2
@Get()  return [ ... ];                     // endpoint 3
```

**Good**
```ts
// global interceptor envelopes to { data }; controllers return domain objects / arrays
@Get()  return users;
```

See `07`.

---

## A29 — Missing `headersSent` guard in global filter

**Bad**
```ts
@Catch()
catch(e, host) {
  host.switchToHttp().getResponse().status(500).json({ ... });  // crash mid-stream
}
```

**Good**
```ts
const res = host.switchToHttp().getResponse();
if (res.headersSent) return;
res.status(status).json({ error: ... });
```

See `10`, `27`.

---

## A30 — `@Global()` on a feature module

**Bad**
```ts
@Global()
@Module({ providers: [PaymentService], exports: [PaymentService] })
export class PaymentModule {}
```

**Good**
```ts
@Module({ providers: [PaymentService], exports: [PaymentService] })
export class PaymentModule {}
// consumers explicitly import { PaymentModule } — dependency is visible
```

See `03`.

---

## A31 — Unbounded `Promise.all` over user-controlled input

**Bad**
```ts
await Promise.all(userItems.map(i => this.process(i)));  // 10k items → 10k concurrent calls
```

**Good**
```ts
import pLimit from 'p-limit';
const limit = pLimit(10);
await Promise.all(userItems.map(i => limit(() => this.process(i))));
```

See `24`.

---

## A32 — LLM call without cost/quota accounting

**Bad**
Service calls provider directly; no row is written to `llm_usage_events`.

**Good**
Gateway records every call with tokens + cost + outcome (`28`).

---

## A33 — Webhook without signature verification

**Bad**
```ts
@Post('webhook')
async handle(@Body() body: any) {
  if (body.type === 'charge.succeeded') await this.recordPayment(body);
}
```

**Good**
```ts
@Post('webhook')
async handle(@Req() req: Request) {
  const event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], secret);
  if (await this.events.wasProcessed(event.id)) return;  // dedupe
  // ... handle + mark
}
```

See `11`, `18`.

---

## A34 — Env read scattered across the codebase

**Bad**
```ts
const size = parseInt(process.env.POOL_SIZE) || 10;  // NaN fallback; no validation
```

**Good**
Zod schema at boot; typed `env.DATABASE_POOL_MAX` everywhere.

See `20`.

---

## A35 — Hand-coded validation in service

**Bad**
```ts
if (!dto.email.includes('@')) throw new BadRequestException('bad email');
if (dto.name.length < 1) throw new BadRequestException('name required');
```

**Good**
DTO with `@IsEmail`, `@Length(1, 100)` — validation runs in the pipe.

See `09`.

---

## See also

- [`29-code-review-checklist.md`](./29-code-review-checklist.md) — checklist to run through
- [`31-rules-rationale-examples.md`](./31-rules-rationale-examples.md) — rule + reasoning
- Each anti-pattern links back to the reference file with the full rule.
