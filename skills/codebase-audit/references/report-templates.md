# Report templates

Consistent shapes make findings comparable across phases and let the summary be assembled
mechanically. Use these; extend a table only when this codebase genuinely needs a column.

## `reports/00-map.md`

```markdown
# Repository map
## Structure          | area | real purpose (from code) | notes |
## Entry points       | type | location | what it exposes | reachable? |
## External deps      | system | client location | failure handling |
## Config surface     | key | read at | defined in | status (ok / read-undefined / defined-unread / alias) |
## Data model         | table/collection | model | migration | drift |
## Hot spots          | file | LOC | importers | importees |
```

## `reports/01-wiring.md`

```markdown
## Orphans            | unit | location | evidence of non-reachability | dynamic-dispatch risk |
## Broken wiring      | expected connection | where it breaks | consequence | confidence |
## Layering violations| from | to | rule broken |
## Import cycles      | cycle (A → B → C → A) | files |
```

## `reports/02-duplication.md`
Cluster table from `references/duplication.md`.

## `reports/03-bandaids.md`
Finding table from `references/bandaids.md`.

## `reports/04-bugs.md`
Bug table plus the `COMMENT_LIE` table from `references/bug-hunt.md`.

## `reports/05-features.md`

```markdown
### <Feature name>
Path: client `file:line` → route `file:line` → guard `file:line` → controller `file:line`
      → service `file:line` → repository `file:line` → DB/external `file:line` → response `file:line`
| Hop | Status (CONNECTED / MISSING / DIVERGENT / UNVERIFIABLE) | Evidence | Note |
Checks: happy path | error paths (≥2) | empty result | authz on every entry | validation vs DB
        constraints | client/server shape match | persistence observable on next read
```

Then the roll-up: `| Feature | Entry points | Status | Broken hops | Blocking bugs |`

## `reports/06-tests.md`

```markdown
## Critical-path coverage      | path | covered by | real assertion? |
## Hollow tests                | test | why it proves nothing |
## Skipped / quarantined       | test | what it guarded | still broken? |
## Required characterization tests before refactor
| # | Target | Input | Expected output | Why it's needed |
```

## `reports/07-refactor-plan.md`

```markdown
## Target architecture         (module map before → after, allowed dependency directions)
## Consolidation decisions     | cluster | canonical choice | why | behaviour to preserve | callers to migrate |
## Steps
| Step | Goal | Files | Preconditions | Change | Verify | Rollback | Risk | Depends on |
## Do not touch                | code | why it's load-bearing |
## Intentional behaviour changes (needs human sign-off)
| Change | Current behaviour | New behaviour | Who might depend on the old one |
```

## `reports/SUMMARY.md`

```markdown
# Audit summary
## Verdict            (2–3 sentences, plain language, no hedging)
## Top 10 findings    | # | finding | location | impact | confidence |
## Counts             clusters / band-aids / P0–P3 / orphans / broken hops
## Defect classes     | class | instances | worst severity | root cause that lets it recur |
## Module health      | module | Solid / Fragile / Broken | one-sentence evidence |
## Open questions     | question | why it can't be settled statically | command or answer needed |
```

## Severity scale

- **P0** — data loss, corruption, security exposure, or a crash on a common path.
- **P1** — a core feature is broken or wrong for real inputs; no safe workaround.
- **P2** — wrong behaviour on edge cases, or a fragility that will break under load or change.
- **P3** — cosmetic, stylistic, or purely maintenance cost.

## Confidence scale

- **CONFIRMED** — traced end to end, or reproduced by running it.
- **LIKELY** — strong static evidence with a single inference step.
- **SUSPECTED** — pattern noticed, verification still needed; name the verification.
