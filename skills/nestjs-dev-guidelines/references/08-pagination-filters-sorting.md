# 08 — Pagination, Filters, Sorting

## TL;DR

- Every list endpoint paginates. No exceptions. Default `limit=20`, max `limit=100`.
- Choose pagination by navigation semantics, consistency needs, and data shape — not by endpoint label.
- **Cursor/keyset** is usually right for sequential browsing over large or frequently changing data.
- **Offset** is right when the UX truly needs page-number navigation, random access, or exact totals.
- Filters use bracket notation: `?filter[field]=value`. The DTO is a **nested `filter` object** validated with `@ValidateNested` + `@Type`, with every field whitelisted.
- Free-text search is a separate top-level param (`?search=...`), not a filter.
- When sort is user-configurable, use `?sort=field` (asc) or `?sort=-field` (desc). Validate format with `@Matches` at the DTO; validate fields against an allowlist in the service; map API names → SQL columns through a static table.
- Cursors are opaque base64url payloads. Malformed cursors → `400 QUERY.INVALID_CURSOR`. Out-of-range offset pages → `200` with `data: []` and the requested `page` echoed back (echo, not clamp).
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
import { BadRequestException } from '@nestjs/common';

// Verify the target Node runtime supports the 'base64url' encoding before copying.
interface CursorPayload { id: string; createdAt: string; }

function encodeCursor(p: CursorPayload): string {
  return Buffer.from(JSON.stringify(p)).toString('base64url');
}
function decodeCursor(c: string): CursorPayload {
  try {
    return JSON.parse(Buffer.from(c, 'base64url').toString());
  } catch {
    throw new BadRequestException({ code: 'QUERY.INVALID_CURSOR', message: 'Cursor is malformed' });
  }
}
```

Treat decode failures as `400` (`QUERY.INVALID_CURSOR`), not `500` — a malformed cursor is bad
client input, not a server bug.

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

The `(created_at, id) < ($2, $3)` row-comparison shorthand only works because every column in
the `ORDER BY` sorts in the same direction. For mixed-direction sorts, expand the predicate
manually — see the **Cursor/keyset sorting** section below.

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
?filter[status]=paid,refunded                              # IN — comma-separated
?filter[status]=paid&filter[status]=refunded               # IN — repeated key (also valid)
?filter[createdAfter]=2026-01-01&filter[createdBefore]=2026-04-01
?filter[amount][gte]=1000&filter[amount][lte]=5000
?search=alice                                              # free-text, separate from filter
```

- Bracket notation `filter[field]=value` for simple equality. The default Express query parser
  used by NestJS parses brackets into nested objects, so `filter[amount][gte]=1000` arrives at the
  controller as `{ filter: { amount: { gte: '1000' } } }`. The DTO must mirror that shape.
- Range operators live under the field: `filter[field][gte|lte|gt|lt|ne]=value`.
- Arrays (IN): repeat the key, or comma-separate. The DTO normalizes both into an array.
- Free-text search: `search=<text>` is a top-level query param, not a filter.

### DTO + whitelist

Never trust the client to pick which columns are filterable. Whitelist with a nested `filter`
DTO that mirrors the URL shape, plus `@ValidateNested` + `@Type` so class-transformer can
hydrate it from the parsed query object:

```ts
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString,
  MaxLength, Min, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Range operators for a numeric field. Add only the operators the endpoint actually supports.
class AmountRangeFilterDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  gte?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  lte?: number;
}

// Per-endpoint filter shape — only fields listed here are accepted.
class PaymentFilterDto {
  // Accept either ?filter[status]=paid,refunded OR ?filter[status]=paid&filter[status]=refunded.
  // Normalize to string[] before @IsEnum runs.
  @ApiPropertyOptional({ enum: PaymentStatus, enumName: 'PaymentStatus', isArray: true })
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @IsEnum(PaymentStatus, { each: true })
  status?: PaymentStatus[];

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional() @IsDateString()
  createdAfter?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional() @IsDateString()
  createdBefore?: string;

  @ApiPropertyOptional({ type: AmountRangeFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AmountRangeFilterDto)
  amount?: AmountRangeFilterDto;
}

export class ListPaymentsCursorQueryDto extends CursorPaginationQueryDto {
  @ApiPropertyOptional({ type: PaymentFilterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentFilterDto)
  filter?: PaymentFilterDto;

  @ApiPropertyOptional({ description: 'Free-text search; trimmed; max 200 chars' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  search?: string;
}
```

Required ValidationPipe configuration (typically global):

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false }, // keep @Type explicit
}));
```

With this setup, any unknown query param — including unknown keys inside `filter[...]` — is
rejected with `400`. No surprise filters, no accidental column exposure.

The same `filter` + `search` pattern applies to offset query DTOs; only the pagination base class
differs (`extends OffsetPaginationQueryDto`).

### Service-side query building (cursor + filter + search)

```ts
const where: string[] = ['deleted_at IS NULL'];
const params: unknown[] = [];

if (q.filter?.status?.length) {
  params.push(q.filter.status);
  where.push(`status = ANY($${params.length}::text[])`);
}
if (q.filter?.createdAfter) {
  params.push(q.filter.createdAfter);
  where.push(`created_at >= $${params.length}`);
}
if (q.filter?.createdBefore) {
  params.push(q.filter.createdBefore);
  where.push(`created_at <= $${params.length}`);
}
if (q.filter?.amount?.gte !== undefined) {
  params.push(q.filter.amount.gte);
  where.push(`amount_cents >= $${params.length}`);
}
if (q.filter?.amount?.lte !== undefined) {
  params.push(q.filter.amount.lte);
  where.push(`amount_cents <= $${params.length}`);
}
if (q.search) {
  // Production: prefer a tsvector / FTS index over ILIKE for non-trivial corpora.
  params.push(`%${q.search}%`);
  where.push(`description ILIKE $${params.length}`);
}

// Cursor seek predicate — must match the ORDER BY tuple exactly (created_at DESC, id DESC).
if (q.cursor) {
  const c = decodeCursor(q.cursor);
  params.push(c.createdAt, c.id);
  where.push(
    `(created_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::text)`,
  );
}

params.push(q.limit + 1);
const sql = `
  SELECT id, created_at, status, amount_cents, description
  FROM payments
  WHERE ${where.join(' AND ')}
  ORDER BY created_at DESC, id DESC
  LIMIT $${params.length}
`;
```

This assumes a cursor endpoint with a fixed keyset-safe ordering: `created_at DESC, id DESC`.

Always use parameterized placeholders. Never string-concatenate user input into SQL — including
sort field names and direction tokens (whitelist them; do not interpolate raw input).

## Sorting

### Cursor/keyset sorting

For keyset pagination, the safest design is a fixed sort per endpoint.

- Good: one stable ordering such as `created_at DESC, id DESC`
- Acceptable: a small, explicit set of keyset-safe sorts (each one bound to its own cursor payload shape)
- Risky: fully user-configurable multi-field sort without changing the cursor payload and seek predicate

If a cursor endpoint supports configurable sort, the cursor must encode the active sort tuple plus
a unique tie-breaker, and the `WHERE (...) < (...)` predicate must match that exact tuple.

**Mixed sort directions break naive tuple comparison.** PostgreSQL's row-comparison operator
(`(a, b) < (x, y)`) only behaves like a keyset seek when *every* column sorts in the same
direction. For `ORDER BY created_at DESC, id ASC` you must expand the predicate manually:

```sql
WHERE created_at < $1
   OR (created_at = $1 AND id > $2)
```

Either pin every cursor endpoint to uniform direction (`DESC, DESC` or `ASC, ASC`), or expand
the predicate per active sort. Never copy the `(a, b) < (x, y)` shorthand onto a mixed-direction
sort — pages will skip or duplicate rows silently.

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

Validate the *format* at the DTO boundary, then validate the *fields* in the service against an
allowlist. The two checks are complementary: the regex stops obvious garbage (`?sort=' OR 1=1`),
and the allowlist stops anything that parses but isn't a sortable column.

```ts
import { BadRequestException } from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Format: one or more comma-separated tokens, each an optional `-` then an identifier.
const SORT_PARAM_REGEX = /^-?[a-zA-Z][a-zA-Z0-9_]*(?:,-?[a-zA-Z][a-zA-Z0-9_]*)*$/;

const allowedSortFields = ['createdAt', 'amount', 'status'] as const;
type AllowedSortField = typeof allowedSortFields[number];

// Map API field → SQL column. Never let the API field name reach SQL directly.
const sortColumn: Record<AllowedSortField, string> = {
  createdAt: 'created_at',
  amount: 'amount_cents',
  status: 'status',
};

export class AdminListPaymentsOffsetQueryDto extends OffsetPaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Sort fields, comma-separated; prefix with - for desc. Example: -createdAt,status',
  })
  @IsOptional()
  @IsString()
  @Matches(SORT_PARAM_REGEX, { message: 'sort must be like "field" or "-field,field"' })
  sort?: string;
}

// service
function parseSort(input?: string): { field: AllowedSortField; dir: 'ASC' | 'DESC' }[] {
  if (!input) return [{ field: 'createdAt', dir: 'DESC' }];
  return input.split(',').map(token => {
    const dir = token.startsWith('-') ? 'DESC' : 'ASC';
    const field = token.replace(/^-/, '') as AllowedSortField;
    if (!allowedSortFields.includes(field)) {
      throw new BadRequestException({
        code: 'QUERY.INVALID_SORT_FIELD',
        message: `Cannot sort by "${field}"`,
      });
    }
    return { field, dir };
  });
}

// Build ORDER BY safely — column names come from the static map, direction is one of two literals.
function buildOrderBy(sorts: ReturnType<typeof parseSort>): string {
  const clauses = sorts.map(s => `${sortColumn[s.field]} ${s.dir}`);
  // Always append a unique tie-breaker so order is deterministic across pages.
  if (!sorts.some(s => s.field === 'createdAt')) clauses.push('created_at DESC');
  clauses.push('id DESC');
  return `ORDER BY ${clauses.join(', ')}`;
}
```

Whitelist is mandatory — otherwise `?sort=password_hash` becomes a data exfiltration vector and
arbitrary fields cause full table scans. Direction must come from a fixed set of literals
(`'ASC' | 'DESC'`); never interpolate raw input.

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
- **Empty offset page (in-range):** `data: []`, `meta.pagination = { page, limit, total, totalPages }`.
- **Cursor pointing past the end:** treat as empty page; don't 404. Return `nextCursor: null`, `hasMore: false`.
- **Malformed / undecodable cursor:** return `400` with `{ code: 'QUERY.INVALID_CURSOR' }`. Do not silently fall back to "first page" — that masks client bugs.
- **Offset page beyond `totalPages`:** return `200` with `data: []` and **echo** the requested `page` in `meta.pagination` (do not clamp). Echo is the chosen default across this skill — it lets the client see exactly why the slice is empty and stays consistent with the contract in [`07-standard-responses.md`](./07-standard-responses.md). Do not 404; out-of-range is an empty slice, not a missing resource.
- **Cursor for a deleted row:** tuple comparison still works (other rows are before/after regardless).
- **Changing sort between pages:** don't. A cursor is only valid for the sort it was issued with. If a client sends a cursor with a different `sort` than the one it was issued for, return `400` (`QUERY.CURSOR_SORT_MISMATCH`).
- **Backward pagination (prev):** harder; use a separate `prevCursor` if really needed. Most apps only need forward.
- **Exact totals on cursor endpoints:** usually omit them. If the product truly needs totals, measure the extra query cost and justify it; consider an estimated count (`pg_class.reltuples`, `EXPLAIN`-derived) when "approximate" is acceptable.
- **Large reports/exports:** avoid pretending they are normal paginated browsing if users really need a complete downloadable result. Use an async export job instead.

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
- Flat filter params without `filter[]` namespacing — collides with `limit`, `cursor`, `sort`, `search`.
- Filter param names matching DB columns without whitelist.
- `ORDER BY` on user-supplied column without whitelist; or interpolating direction from raw input.
- `total` count on cursor endpoints — expensive; unnecessary; omit.
- Breaking cursors on schema change without a migration plan.
- Cursor payload and seek predicate not matching the active sort tuple.
- Tuple-comparison shorthand (`(a, b) < (x, y)`) on a mixed-direction sort.
- Silently treating an undecodable cursor as "first page" instead of returning `400`.
- Offset on a high-write sequential list where users do not need page numbers.
- Choosing pagination style by endpoint stereotype (`admin`, `catalog`, `feed`) instead of real requirements.
- Disabling `forbidNonWhitelisted` so the API tolerates unknown query params.

## Code review checklist

- [ ] All list endpoints paginate; default + max limit enforced
- [ ] Pagination choice is justified by UX + consistency + scale requirements, not endpoint label alone
- [ ] Cursor/keyset lists have a stable unique sort key (with tie-breaker where needed)
- [ ] If cursor/keyset sorting is configurable, cursor payload, seek predicate, and index all match the active sort tuple
- [ ] Mixed-direction sorts use the OR-expanded seek predicate (or are forbidden by the DTO)
- [ ] Offset endpoints really need page-number/random-access UX, and the query cost is acceptable at realistic depth
- [ ] Filters live under a nested `filter` DTO with `@ValidateNested` + `@Type`; each field is whitelisted (`@IsEnum`, `@IsDateString`, etc.)
- [ ] `ValidationPipe` is configured with `whitelist: true` and `forbidNonWhitelisted: true`
- [ ] Sort param has a format `@Matches` regex at the DTO boundary AND a field allowlist in the service
- [ ] API → SQL column name mapping goes through a static map; direction is one of two literals
- [ ] Composite indexes exist for the sort + common filters
- [ ] `meta.pagination` always present on list responses
- [ ] Malformed cursor returns `400` (`QUERY.INVALID_CURSOR`), not a silent reset
- [ ] Out-of-range offset page returns `200` with `data: []` and echoes the requested `page`
- [ ] No raw SQL concatenation of query params

## See also

- [`06-api-design.md`](./06-api-design.md) — list endpoint URLs
- [`07-standard-responses.md`](./07-standard-responses.md) — response contract
- [`13-database-design.md`](./13-database-design.md) — indexes
- [`09-validation.md`](./09-validation.md) — DTO setup
