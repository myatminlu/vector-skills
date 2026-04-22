# 08 — Pagination, Filters, Sorting

## TL;DR

- Every list endpoint paginates. No exceptions. Default `limit=20`, max `limit=100`.
- **Cursor-based** by default (feeds, infinite scroll, scale). **Offset-based** only when the product needs numbered pages (admin, reports).
- Filters: `?filter[field]=value` with a **whitelist** of allowed fields.
- Sorts: `?sort=field` (asc) or `?sort=-field` (desc). Whitelist allowed fields.
- Shape under `data` is always an array; `meta.pagination` carries navigation.

## Why it matters

Unpaginated list endpoints OOM the server the first time a table grows past ~10k rows.
Unwhitelisted filters are a SQL injection vector and an accidental index-miss disaster.
Inconsistent pagination shapes break every client.

## Cursor vs offset — which when?

### Cursor (default)

- Scales: O(log n) per page regardless of depth.
- Safe under concurrent inserts (no duplicate/skip).
- Only "next" / "prev" navigation — **cannot jump to page N**.
- Use for: feeds, conversation messages, activity logs, infinite scroll, API exports.

### Offset

- Slow at depth: O(skip) rows scanned.
- Can jump to arbitrary page.
- Shows `total` count naturally (at cost of another query).
- Use for: admin tables, reports, search results with page numbers.

**Rule:** default cursor. Add offset only when the product literally needs page N.

## Cursor — implementation

### Contract

```
GET /v1/messages?limit=50&cursor=eyJpZCI6...
```

- `limit` — int, 1..100, default 20.
- `cursor` — opaque base64 string (clients must treat it as a black box).
- Sort is implicit and stable. For most lists, this is `(created_at DESC, id DESC)`.

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

A cursor is `base64url(JSON.stringify({ id, createdAt }))` — the keys used by the stable sort.

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
export class ListPaymentsQueryDto extends CursorPaginationQueryDto {
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

Always use parameterized placeholders. Never string-concatenate user input into SQL.

## Sorting

### URL

```
?sort=-createdAt           # desc by createdAt
?sort=status,-createdAt    # multi-field: status asc, then createdAt desc
```

### DTO with whitelist

```ts
const allowedSortFields = ['createdAt', 'amount', 'status'] as const;
type AllowedSortField = typeof allowedSortFields[number];

export class ListPaymentsQueryDto extends CursorPaginationQueryDto {
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

```ts
@Get()
@ApiOperation({ summary: 'List payments' })
async list(@Query() q: ListPaymentsQueryDto): Promise<Envelope<Payment[]>> {
  const { rows, nextCursor, hasMore } = await this.payments.list(q);
  return {
    data: rows,
    meta: {
      pagination: { nextCursor, hasMore, limit: q.limit },
    },
  };
}
```

## Indexes

Any filterable field needs an index. Cursor sort key needs a composite index:

```sql
CREATE INDEX idx_messages_conv_created ON messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX idx_payments_user_status_created ON payments (user_id, status, created_at DESC);
```

Rule: any `WHERE` + `ORDER BY` combination that's in a DTO must have a matching index. Measure
with `EXPLAIN ANALYZE` on representative data. See `13-database-design.md`.

## Edge cases

- **Empty page:** `data: []`, `meta.pagination.hasMore: false`.
- **Cursor pointing past the end:** treat as empty page; don't 404.
- **Cursor for a deleted row:** tuple comparison still works (other rows are before/after regardless).
- **Changing sort between pages:** don't. Cursor is only valid for the sort it was issued with. Document this.
- **Backward pagination (prev):** harder; use a separate `prevCursor` if really needed. Most apps only need forward.

## Good vs bad

### Good

```
GET /v1/payments?filter[status]=paid&sort=-createdAt&limit=50

{ "data": [...],
  "meta": { "pagination": { "nextCursor": "eyJ...", "hasMore": true, "limit": 50 } } }
```

### Bad

```
GET /v1/payments?status=paid&sortBy=createdAt DESC&page=50

{ "results": [...], "total": 1000, "currentPage": 50 }
```

Issues: no filter namespacing, sort format passes SQL fragment, custom envelope, offset on what
should be cursor, no limit bound.

## Anti-patterns

- No pagination at all (`SELECT *` then return the array).
- Ridiculous max limit (`limit=10000`).
- Filter param names matching DB columns without whitelist.
- `ORDER BY` on user-supplied column without whitelist.
- `total` count on cursor endpoints — expensive; unnecessary; omit.
- Breaking cursors on schema change without a migration plan.
- Offset on a feed (slow and buggy under writes).

## Code review checklist

- [ ] All list endpoints paginate; default + max limit enforced
- [ ] Cursor-based unless admin/report feature explicitly needs offset
- [ ] Filters whitelisted via DTO with `@IsEnum`, `@IsDateString`, etc.
- [ ] Sort fields whitelisted; direction parsed safely
- [ ] Composite indexes exist for the sort + common filters
- [ ] `meta.pagination` always present on list responses
- [ ] No raw SQL concatenation of query params

## See also

- [`06-api-design.md`](./06-api-design.md) — list endpoint URLs
- [`07-standard-responses.md`](./07-standard-responses.md) — envelope shape
- [`13-database-design.md`](./13-database-design.md) — indexes
- [`09-validation.md`](./09-validation.md) — DTO setup
