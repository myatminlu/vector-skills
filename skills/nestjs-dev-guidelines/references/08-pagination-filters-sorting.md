# 08 — Pagination, Filters, Sorting

## TL;DR

- Every list endpoint paginates. No exceptions. Default `limit=20`, max `limit=100`.
- Choose pagination by navigation semantics, consistency needs, and data shape — not by endpoint label.
- **Cursor/keyset** is usually right for sequential browsing over large or frequently changing data.
- **Offset** is right when the UX truly needs page-number navigation, random access, or exact totals.
- Filters: `?filter[field]=value` with a **whitelist** of allowed fields.
- When sort is user-configurable, use `?sort=field` (asc) or `?sort=-field` (desc). Whitelist allowed fields.
- Shape under `data` is always an array; `meta.pagination` carries navigation.

## Why it matters

Unpaginated list endpoints OOM the server the first time a table grows past ~10k rows.
Unwhitelisted filters are a SQL injection vector and an accidental index-miss disaster.
Inconsistent pagination shapes break every client.

## Cursor vs offset — how to choose

Do not choose by endpoint category alone (`admin`, `feed`, `catalog`, `report`). Choose by the
actual requirements and constraints of the endpoint.

### Start with these questions

1. Does the UX truly need page-number navigation or jump-to-page behavior?
2. Does the client need an exact `total` / `totalPages`, or is `hasMore` enough?
3. Is the user browsing sequentially, or jumping around arbitrarily?
4. Is the data large, hot, or changing while the user paginates?
5. Do you have a stable, unique sort key (or tuple) that can anchor keyset pagination?
6. Is this an interactive list, or should it really be an async export / report job instead?

### Prefer cursor/keyset when

- Navigation is sequential (`next` / `prev`, infinite scroll, "load more").
- The list is large or can become large.
- Inserts/deletes happen while the user is paging.
- Deep pagination is expected.
- You can define a stable, unique ordering such as `(created_at DESC, id DESC)`.

### Prefer offset when

- The UX genuinely needs page numbers or jump-to-page.
- Exact `total` / `totalPages` matters to the product.
- Browsing depth is expected to stay shallow.
- The list is relatively stable while users page through it.
- The cost of `OFFSET` + `COUNT(*)` is acceptable on representative data.

### Prefer neither when

- The user wants a full export or large report: use an async job, file export, or streaming.
- The backend is a search engine with its own pagination model: use the engine-native approach
  (`search_after`, cursor token, etc.) rather than forcing SQL-style rules onto it.

### Rule of thumb

Cursor/keyset is the safer default for sequential browsing over mutable or large datasets. Offset
is the right choice when page numbers, random access, or exact totals are real requirements and
the depth/performance tradeoff is acceptable.

## What the database is doing

### Offset

- Database work grows with depth: the engine still walks past skipped rows before returning the
  requested page.
- Exact totals usually require a separate `COUNT(*)` query.
- Deep offsets get slower as data grows, even when the page size stays small.

### Cursor/keyset

- Database uses the index to seek to the next slice based on the last seen sort key.
- Work is roughly `index seek + next page`, not "scan all skipped pages first".
- More stable under concurrent inserts/deletes, as long as the ordering is stable and unique.
- Not magic: if the sort key itself changes between requests, you can still get confusing results.

## Cursor / keyset — implementation

### Contract

```
GET /v1/messages?limit=50&cursor=eyJpZCI6...
```

- `limit` — int, 1..100, default 20.
- `cursor` — opaque base64 string (clients must treat it as a black box).
- Sort is implicit and stable. For most lists, this is `(created_at DESC, id DESC)`.
- The ordering must be stable and unique. Use a tie-breaker (`id`) when the primary sort key is
  not unique.

Response:

```json
{
  "data": [
    { "id": "msg_100", "createdAt": "2026-04-22T10:00:00Z", ... },
    ...
  ],
  "meta": {
    "pagination": {
      "nextCursor": "eyJpZCI6Im1zZ185MCIsImNyIjoiMjAyNi0wNC0yMlQwOTo1OTowMFoifQ==",
      "hasMore": true,
      "limit": 50
    }
  }
}
```

### Cursor encoding

A cursor is usually `base64url(JSON.stringify({ id, createdAt }))` — the keys used by the stable
sort. The exact encoding is an implementation detail; clients must treat it as opaque.

```ts
interface CursorPayload { id: string; createdAt: string; }

function encodeCursor(p: CursorPayload): string {
  return Buffer.from(JSON.stringify(p)).toString('base64url');
}
function decodeCursor(c: string): CursorPayload {
  return JSON.parse(Buffer.from(c, 'base64url').toString());
}
```

### Query (tuple comparison)

```sql
-- first page
SELECT id, created_at, ...
FROM messages
WHERE conversation_id = $1 AND deleted_at IS NULL
ORDER BY created_at DESC, id DESC
LIMIT 51; -- fetch limit+1 to know if there's more

-- next page with cursor
SELECT id, created_at, ...
FROM messages
WHERE conversation_id = $1 AND deleted_at IS NULL
  AND (created_at, id) < ($2::timestamptz, $3::text)
ORDER BY created_at DESC, id DESC
LIMIT 51;
```

Fetch `limit+1` rows. If you got `limit+1`, `hasMore=true`; drop the extra; the last row of
the kept set becomes the cursor.

### Pagination DTO

```ts
// common/dto/cursor-pagination.query.dto.ts
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CursorPaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Opaque cursor from previous response' })
  @IsOptional() @IsString()
  cursor?: string;
}
```

Controllers extend this with endpoint-specific filters.

## Offset — implementation

### Contract

```
GET /v1/admin/users?page=3&limit=50
```

- `page` — int, starts at 1.
- `limit` — int, 1..100, default 20.
- Offset is appropriate only when page-number navigation is an actual product requirement.

Response:

```json
{
  "data": [ ... ],
  "meta": {
    "pagination": { "page": 3, "limit": 50, "total": 1274, "totalPages": 26 }
  }
}
```

### Query

```sql
SELECT id, ... FROM users
WHERE deleted_at IS NULL AND ...
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- in a second query (or parallel)
SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND ...;
```

Always add `ORDER BY` — offset without ORDER BY returns rows in undefined order.

If the list is large or high-write, benchmark this query shape at realistic depth before adopting
offset as the contract.

### Offset DTO

```ts
export class OffsetPaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;
}
```

## Filtering

### URL syntax

```
?filter[status]=paid
?filter[createdAfter]=2026-01-01&filter[createdBefore]=2026-04-01
?filter[amount][gte]=1000&filter[amount][lte]=5000
```

- Bracket notation `filter[field]=value` for simple equality.
- Range operators: `filter[field][gte|lte|gt|lt|ne]=value`.
- Arrays (IN): repeat or comma — `filter[status]=paid,refunded`.
- Free-text search: `search=<text>` (separate from `filter`).

### DTO + whitelist

Never trust the client to pick which columns are filterable. Whitelist via DTO:

```ts
export class ListPaymentsCursorQueryDto extends CursorPaginationQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional() @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  createdAfter?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  createdBefore?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  minAmount?: number;
}
```

With `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, any unknown query param
is rejected. No surprise filters.

### Service-side query building

```ts
const where: string[] = ['deleted_at IS NULL'];
const params: unknown[] = [];

if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
if (q.createdAfter) { params.push(q.createdAfter); where.push(`created_at >= $${params.length}`); }
if (q.createdBefore) { params.push(q.createdBefore); where.push(`created_at <= $${params.length}`); }
if (q.minAmount !== undefined) { params.push(q.minAmount); where.push(`amount_cents >= $${params.length}`); }

const sql = `SELECT ... WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1}`;
params.push(q.limit + 1);
```

This example assumes a cursor endpoint with a fixed keyset-safe ordering: `created_at DESC, id DESC`.

Always use parameterized placeholders. Never string-concatenate user input into SQL.

## Sorting

### Cursor/keyset sorting

For keyset pagination, the safest design is a fixed sort per endpoint.

- Good: one stable ordering such as `created_at DESC, id DESC`
- Acceptable: a small, explicit set of keyset-safe sorts
- Risky: fully user-configurable multi-field sort without changing the cursor payload and seek predicate

If a cursor endpoint supports configurable sort, the cursor must encode the active sort tuple plus
a unique tie-breaker, and the `WHERE (...) < (...)` predicate must match that exact tuple.

If that sounds too complex for the endpoint, use offset instead.

### Offset sorting

Offset pagination is usually the simpler choice when the user really needs flexible, user-driven
sort fields together with page numbers.

### URL

```
?sort=-createdAt           # desc by createdAt
?sort=status,-createdAt    # multi-field: status asc, then createdAt desc
```

### DTO with whitelist

```ts
const allowedSortFields = ['createdAt', 'amount', 'status'] as const;
type AllowedSortField = typeof allowedSortFields[number];

export class AdminListPaymentsOffsetQueryDto extends OffsetPaginationQueryDto {
  @ApiPropertyOptional({ description: 'Sort field, prefix with - for desc' })
  @IsOptional() @IsString()
  sort?: string;
}

// service
function parseSort(input?: string): { field: AllowedSortField; dir: 'ASC' | 'DESC' }[] {
  if (!input) return [{ field: 'createdAt', dir: 'DESC' }];
  return input.split(',').map(s => {
    const dir = s.startsWith('-') ? 'DESC' : 'ASC';
    const field = s.replace(/^-/, '') as AllowedSortField;
    if (!allowedSortFields.includes(field)) {
      throw new BadRequestException({ code: 'QUERY.INVALID_SORT_FIELD', message: `Cannot sort by "${field}"` });
    }
    return { field, dir };
  });
}
```

Whitelist is mandatory — otherwise `?sort=password_hash` becomes a data exfiltration vector
and arbitrary fields cause full table scans.

## Combined: filter + sort + paginate

### Cursor endpoint with fixed sort

```ts
@Get()
@ApiOperation({ summary: 'List payments' })
async list(@Query() q: ListPaymentsCursorQueryDto): Promise<CursorListResponse<Payment>> {
  const { rows, nextCursor, hasMore } = await this.payments.list(q);
  return {
    data: rows,
    meta: {
      pagination: { nextCursor, hasMore, limit: q.limit },
    },
  };
}
```

### Offset endpoint with flexible sort

```ts
@Get('/admin/payments')
@ApiOperation({ summary: 'Admin list payments' })
async adminList(@Query() q: AdminListPaymentsOffsetQueryDto): Promise<OffsetListResponse<Payment>> {
  const { rows, total } = await this.payments.adminList(q);
  return {
    data: rows,
    meta: {
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.ceil(total / q.limit),
      },
    },
  };
}
```

## Indexes

Any filterable field needs an index. Cursor sort keys need composite indexes that match the seek
tuple exactly:

```sql
CREATE INDEX idx_messages_conv_created ON messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX idx_payments_user_status_created ON payments (user_id, status, created_at DESC, id DESC);
```

Rule: any `WHERE` + `ORDER BY` combination that's in a DTO must have a matching index. Measure
with `EXPLAIN ANALYZE` on representative data. See `13-database-design.md`.

## Edge cases

- **Empty cursor page:** `data: []`, `meta.pagination = { nextCursor: null, hasMore: false, limit }`.
- **Empty offset page:** `data: []`, `meta.pagination = { page, limit, total, totalPages }`.
- **Cursor pointing past the end:** treat as empty page; don't 404.
- **Cursor for a deleted row:** tuple comparison still works (other rows are before/after regardless).
- **Changing sort between pages:** don't. Cursor is only valid for the sort it was issued with. Document this.
- **Backward pagination (prev):** harder; use a separate `prevCursor` if really needed. Most apps only need forward.
- **Exact totals on cursor endpoints:** usually omit them. If the product truly needs totals, measure the extra query cost and justify it.
- **Large reports/exports:** avoid pretending they are normal paginated browsing if users really need a complete downloadable result.

## Good vs bad

### Good

```
GET /v1/payments?filter[status]=paid&limit=50

{ "data": [...],
  "meta": { "pagination": { "nextCursor": "eyJ...", "hasMore": true, "limit": 50 } } }
```

### Bad

```
GET /v1/payments?status=paid&sortBy=createdAt DESC&page=50

{ "results": [...], "total": 1000, "currentPage": 50 }
```

Issues: no filter namespacing, sort format passes SQL fragment, custom response contract, offset
used without proving page-number UX is needed, no limit bound.

## Anti-patterns

- No pagination at all (`SELECT *` then return the array).
- Ridiculous max limit (`limit=10000`).
- Filter param names matching DB columns without whitelist.
- `ORDER BY` on user-supplied column without whitelist.
- `total` count on cursor endpoints — expensive; unnecessary; omit.
- Breaking cursors on schema change without a migration plan.
- Cursor payload and seek predicate not matching the active sort tuple.
- Offset on a high-write sequential list where users do not need page numbers.
- Choosing pagination style by endpoint stereotype (`admin`, `catalog`, `feed`) instead of real requirements.

## Code review checklist

- [ ] All list endpoints paginate; default + max limit enforced
- [ ] Pagination choice is justified by UX + consistency + scale requirements, not endpoint label alone
- [ ] Cursor/keyset lists have a stable unique sort key (with tie-breaker where needed)
- [ ] If cursor/keyset sorting is configurable, cursor payload, seek predicate, and index all match the active sort tuple
- [ ] Offset endpoints really need page-number/random-access UX, and the query cost is acceptable at realistic depth
- [ ] Filters whitelisted via DTO with `@IsEnum`, `@IsDateString`, etc.
- [ ] Sort fields whitelisted; direction parsed safely
- [ ] Composite indexes exist for the sort + common filters
- [ ] `meta.pagination` always present on list responses
- [ ] No raw SQL concatenation of query params

## See also

- [`06-api-design.md`](./06-api-design.md) — list endpoint URLs
- [`07-standard-responses.md`](./07-standard-responses.md) — response contract
- [`13-database-design.md`](./13-database-design.md) — indexes
- [`09-validation.md`](./09-validation.md) — DTO setup
