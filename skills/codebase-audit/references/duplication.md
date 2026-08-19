# PHASE 2 reference — Duplication audit

Find every place the same thing exists more than once, at four levels. Report **clusters**, not
individual lines. For each cluster, the most valuable output is *what differs between the copies* —
identical copies are a maintenance cost, but diverged copies are active bugs, because one of them
is wrong and someone is depending on it.

## Level 1 — Literal / near-literal clones

Identical or trivially different blocks: renamed variables, reordered independent lines, different
formatting or comments. Report each cluster once with all locations.

Detection: look hardest inside modules created by copy-paste — sibling CRUD controllers, parallel
test files, per-entity services. Where you find one clone, expect a family.

## Level 2 — Semantic duplicates (different code, same job)

Two implementations that compute the same result by different means. These survive grep-based
cleanups, so hunt them by concept:

- date/time formatters, slugifiers, currency and number formatters, ID generators;
- validation of the same rule (email, phone, password policy) in more than one place;
- retry/backoff, pagination, sorting, filtering, caching helpers;
- HTTP clients / fetch wrappers, each with its own headers, auth, timeout, error handling;
- logging and error-formatting utilities;
- mappers/DTO converters between the same two shapes;
- hand-rolled versions of something the framework or an already-installed dependency provides.

## Level 3 — Duplicated features & services (highest value)

- **Two modules owning the same domain concept** (two "user", "notification", or "billing"
  paths). Compare them field by field and list every behavioural divergence.
- **The same business rule in multiple layers** — frontend, backend, DB constraint — with
  different thresholds or edge cases. Every mismatch is a bug report, not a style note.
- **Old and new implementations coexisting** (`v1`/`v2`, `legacy*`, `*Old`, `*Impl2`). State which
  is live per call site, and whether *both* are live for different callers — that is the dangerous
  case, because fixes land in only one.
- **Copy-pasted CRUD modules that drifted apart.**
- **Duplicate configuration and constants**: the same URL, timeout, limit, tax rate, or magic
  number hardcoded in several places. List every occurrence *and every differing value*.
- **Duplicate type/schema definitions** for one entity (TS interface + validation schema + ORM
  entity + OpenAPI spec) that are out of sync. List the exact field-level differences: an optional
  field on one side and required on the other is a production incident waiting for the right input.

## Level 4 — Structural duplication

Repeated boilerplate — identical try/catch/log/rethrow, identical auth checks, identical
pagination wiring — that should be middleware, a decorator, a base class, or a generic helper.
Note the count; ten copies of a five-line pattern is a bigger risk than one long duplicate,
because a fix must find all ten.

## Cluster output format

| Field | Content |
|---|---|
| Cluster ID | `DUP-01` |
| Concept | what this code is for, in plain words |
| Locations | every `file:line-range` |
| Divergences | exactly how the copies differ in behaviour |
| Most correct copy | which one, and the evidence for it |
| Live vs dead | which copies are reachable, per caller |
| Consolidation target | where the single canonical version should live |
| Risk | low / med / high, with the reason |
| Payoff | approx. LOC removed, bug classes eliminated |

Cross-check finished clusters against PHASE 4: copy-paste errors (the second block using a
variable from the first) hide inside near-identical code and are easy to miss when reading each
copy in isolation.
