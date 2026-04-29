# 37 — File Uploads

## TL;DR

- Prefer direct-to-object-storage uploads (S3/GCS presigned URLs). Your app issues a short-lived URL; the client uploads to the bucket.
- Cap size, count, and MIME type at the boundary. Reject unauthenticated, oversized, or wrong-typed requests before any processing.
- Sniff the content; don't trust the client's filename, `Content-Type`, or any client-supplied hash/size/mime.
- Store an opaque, tenant-prefixed key. Keep user-supplied filenames out of the path entirely.
- Scan for malware before you serve, link, or process the bytes anywhere a human will see them.
- Rate-limit upload-initiation and finalize endpoints per user/tenant — without it, one leaked token fills the bucket.

## Why it matters

Uploads are the most common path for unbounded growth, RCE via malicious content, and stored XSS.
Every file received is hostile until proven otherwise. The cheapest defense is to never let the
file pass through your app at all.

## Prefer presigned uploads

- Server endpoint: validates the user, asserts quota, issues a presigned URL with a short TTL (≤ 5 minutes), capped size, fixed prefix, and required content type.
- Use presigned `PUT` for single-object uploads from mobile/server clients. Use presigned `POST` (form policy) when a browser must upload directly and you need form-field constraints (size range, prefix lock, required headers) enforced by the bucket. Don't expose raw bucket credentials to the client either way.
- Client uploads directly to the bucket; your app never holds the bytes.
- Server confirms the upload in a separate call (HEAD the object) and records metadata in the DB. Compute `sha256` server-side from the stored object — never trust a client-supplied hash.

## When you must accept the bytes (Multer / multipart)

- Set `limits`: `fileSize` (per file), `files` (count), `fields` (form fields), `parts`.
- Reject anything that exceeds the limit at the parser, not in the controller.
- Keep memory storage off for anything larger than a few KB; stream to a temp file or directly to object storage.
- Do not write into a path that includes any user-supplied string.

## Validate

- Allow-list MIME types. Reject by default.
- Sniff the magic bytes; do not trust the `Content-Type` header or filename extension.
- Reject zip bombs and overlong/recursive archives explicitly when you accept archives.
- Image processing libs are common RCE surfaces — apply the same trust posture as for arbitrary input. Disable risky decoders (e.g., ImageMagick's MSL/MVG via `policy.xml`) and pin/patch `libvips`/`sharp` versions promptly.
- Strip image EXIF metadata (especially GPS) before exposing user uploads to other users.
- SVG is hostile by default — it can carry `<script>`, external entities, and CSS-based exfiltration. Either disallow it, or sanitize server-side (e.g., DOMPurify in SVG mode) and serve only with `Content-Disposition: attachment` from a separate sandboxed domain.

## Rate-limit and quota

- Rate-limit the upload-initiation and finalize endpoints per user and per tenant. Without it, a single account can drive unbounded storage cost or fill the AV scan queue.
- Enforce a per-tenant storage quota when issuing the presigned URL — checking after the bytes land is too late.
- For batch/multipart uploads, count the in-flight reservation against the quota until either finalize or TTL expiry releases it.

## Storage layout

- Store under an opaque, tenant-prefixed key: `s3://bucket/tenants/<tenant_id>/<entity>/<uuid>/<filename-hash>.<ext>`. The `tenant_id` segment is mandatory in multi-tenant systems — see [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md).
- Persist DB metadata: `id, owner_id, tenant_id, original_name, mime, size_bytes, sha256, storage_key, scan_status, created_at, deleted_at`. Compute `mime`, `size_bytes`, and `sha256` server-side from the stored object after upload — do not record values supplied by the client.
- Never serve files from a path that mirrors user input.
- Tenancy: always filter by `tenant_id` on read; reject any request whose resolved storage key does not start with the caller's tenant prefix.

## Serving

- Default to authenticated, time-limited download URLs (presigned `GET`) rather than streaming through your app.
- For assets shown in the browser, set `Content-Disposition: attachment` unless rendering inline is a deliberate product decision. Encode the filename with RFC 5987 (`filename*=UTF-8''...`) so non-ASCII names cannot break the header or smuggle directives.
- Set `X-Content-Type-Options: nosniff` and a strict `Content-Type`.
- Hosts that serve user content live on a separate domain from the app to prevent cookie-based attacks against your origin.

## Scan

- Run AV on every upload before it's listed, linked, or rendered. Use ClamAV (self-hosted) or a managed equivalent (e.g., AWS GuardDuty Malware Protection for S3, or your cloud's equivalent malware-scanning service) — pick whichever fits the platform; the requirement is "scanned before exposure," not the specific tool.
- Keep `scan_status` (`pending` / `clean` / `infected` / `error`) in the metadata row. Don't expose unscanned files via any API; readers must filter on `scan_status = 'clean'`.
- Quarantine on positive scans — copy to a quarantine prefix, audit, and notify owner per policy.

## Anti-patterns

- Streaming uploads through the API, then storing on the same disk as the app.
- Using the user-supplied filename in the storage path.
- Trusting `Content-Type`, the `.ext`, or a client-supplied `sha256`/`size` for anything more than a hint.
- Serving uploaded HTML/SVG inline from the app's primary domain. SVG running on your origin can read cookies, call your API, and exfiltrate session data.
- Skipping AV "for now" because uploads are private — internal users phish each other; B2B tenants share spaces.
- No rate limit on the upload-initiation endpoint. One leaked token then fills the bucket.

## Review checklist

- [ ] Direct-to-object-storage path used where possible (presigned `PUT` for clients, `POST` policy when a browser needs form-level constraints).
- [ ] Size, count, MIME limits enforced at the parser.
- [ ] Magic-byte sniffing on accepted types; allow-list MIME.
- [ ] `sha256`, `size_bytes`, and `mime` are computed server-side; client values are not trusted.
- [ ] EXIF metadata stripped from images before exposure; SVG either disallowed or sanitized + served from a sandboxed domain.
- [ ] Storage key is opaque, tenant-prefixed; user filename is never part of the path.
- [ ] DB row tracks owner, tenant, hash, scan status.
- [ ] Files served via presigned URLs or from a separate domain; `Content-Disposition: attachment` with RFC 5987 filename encoding for downloads.
- [ ] Strict `Content-Type` and `X-Content-Type-Options: nosniff` set on every served response (object metadata for presigned, header config for proxied).
- [ ] AV scan runs before exposure; readers filter on `scan_status = 'clean'`.
- [ ] Tenancy enforced on read and write; resolved storage key validated against the caller's tenant prefix.
- [ ] Upload-initiation and finalize endpoints rate-limited per user/tenant.
- [ ] Per-tenant storage quota enforced at presigned-URL issuance (not after the bytes land); in-flight reservations counted until finalize or TTL expiry.

## See also

- [`11-security.md`](./11-security.md) — input trust posture, OWASP file-upload guidance
- [`13-database-design.md`](./13-database-design.md) — metadata table shape
- [`24-performance.md`](./24-performance.md) — streaming vs buffering trade-offs
- [`33-multi-tenancy-patterns.md`](./33-multi-tenancy-patterns.md) — tenant-scoped storage
