# Duplication, Band-Aids, Wiring, and Dead Code

Phase 3 methods. These findings cannot be produced by reading files one at a time — they only
appear when you deliberately compare across the codebase and follow execution end to end. They
are also, typically, the most expensive problems in the system.

---

## 1. Duplication hunt

Duplication matters at three levels, in increasing order of cost.

### Level 1 — Duplicated code (blocks and functions)

Cheap to find, cheap to fix, and the divergences point at bugs.

**How to find it:**

- Run `scripts/repo_signals.py <path>` — it hashes normalized sliding line-windows and reports
  cross-file matches.
- Grep for distinctive literals: error message strings, regexes, URL paths, magic numbers,
  header names, SQL fragments. A distinctive string in three files is three copies of a rule.
- Grep for near-identical signatures: `def parse_`, `function format`, `validate*`, `*_helper`.
- Look at sibling directories: `services/`, `utils/`, `helpers/`, `common/`, `lib/` frequently
  hold competing versions of one utility.

**What to report:** the canonical copy, every duplicate, and — most importantly — **how they
differ**. The differences are the finding. When one copy handles an empty input and the others
do not, that is a latent bug in every other copy, and it is usually `CONFIRMED`.

```
Copy A: services/billing/tax.py:40-78
Copy B: api/checkout/tax_calc.py:112-149  — missing the negative-amount guard from A:56
Copy C: jobs/invoice_backfill.py:88-120   — rounds half-up; A and B round half-even
```

Three copies of a tax calculation that round differently is a data-integrity finding, not a
tidiness one.

### Level 2 — Duplicated features

The same user-visible capability implemented twice through different code paths: two ways to
create a user, two export pipelines, two notification senders, an admin path and an API path
with independently written validation.

**How to find it:**

- List entry points (routes, commands, jobs, event handlers) and group them by the *business
  outcome* they produce, not by their module. Two entries producing the same outcome need
  justification.
- Search for a core domain noun (`invoice`, `subscription`, `shipment`) across the repo and see
  how many distinct write paths touch it.
- Ask the user: "is there more than one way to do X in this product?" Their answer, checked
  against the code, is fast and reliable.

**Why it is expensive:** business rules drift. A fix applied to one path leaves the other
wrong, and the bug reappears through the second door months later.

### Level 3 — Duplicated services

Two modules, packages, or deployables that own the same responsibility: two caching layers, two
auth mechanisms, two job schedulers, two HTTP client wrappers, two config systems, a `legacy/`
tree beside a `core/` tree with both live.

**How to find it:**

- Map responsibilities from the code (not the folder names) and look for two owners of one
  responsibility.
- Check dependency lists for two libraries in the same category.
- Check for `v1`/`v2`, `old`/`new`, `legacy_`, `_deprecated`, `_temp` prefixes that are still
  imported.
- Ask "if I needed to change how X works, how many places would I have to change?" — the answer
  from tracing, not from intuition.

**What to report:** which one is authoritative, who still calls the other, what makes the
migration incomplete, and what it would take to finish it. An unfinished migration that nobody
plans to finish is a permanent tax; name it explicitly, because teams routinely believe a
migration completed years ago when half the callers still use the old path.

### When duplication is acceptable

Say so when it is. Two similar-looking blocks in different bounded contexts that change for
different reasons should *not* be merged — a premature shared abstraction couples two things
that will diverge and is worse than the duplication. The test is not "does this look alike" but
"will these two always have to change together?" If yes, merge. If no, leave it and note why.

---

## 2. Band-aid detection

A band-aid is a change that suppresses a symptom without addressing its cause. Each one is a
marker: somewhere upstream, a real defect is still live and now harder to see.

**Signatures to search for:**

| Pattern | What it usually hides |
|---|---|
| `try/except: pass`, `catch {}`, ignored error returns | A failure that happens routinely and nobody diagnosed |
| Retry loop around a non-flaky operation | A race condition or a state bug |
| `sleep(2)` before reading a result | A missing synchronization or await |
| Defensive `if x is None: return` deep in the stack | An upstream producer that should never emit null |
| `str(x).strip().lower()` applied repeatedly at many call sites | Normalization missing at the boundary |
| Special case for one caller/tenant/ID | A modeling gap being paid for in conditionals |
| Re-fetching or re-computing "to be safe" | Cache invalidation not understood |
| `# temporary`, `# quick fix`, `# revert after`, `# workaround` | Exactly what it says; check the date in git blame |
| Try/catch wrapping a whole handler and returning a default | Unknown failures now invisible |
| Manually recomputing a value the model should own | Duplicated business logic |
| A flag added to suppress an error message | The error was real |
| Config value tuned to make a symptom go away | Resource or concurrency bug |

**How to report one:**

State (a) the patch and its location, (b) the symptom it suppresses, (c) the suspected root
cause with evidence, (d) how to confirm the root cause, (e) what breaks if the band-aid is
removed before the cause is fixed. Never recommend simply deleting a band-aid — it may be the
only thing holding production together. The recommendation is: fix the cause, then remove the
patch, then verify.

**Use history when available:** `git log -S"<the patched line>"` and `git blame` reveal the
incident the patch responded to. A patch added the same week as a customer escalation, with no
accompanying test, is almost always a symptom fix.

---

## 3. Wiring verification — is the feature actually connected?

The most demoralizing defect class: code that exists, reads well, passes review, and never
runs. Or runs, and its result is discarded.

For each feature in scope, verify the whole chain **by reading code at each hop**, not by
assuming that the presence of one hop implies the next:

1. **Definition** — the handler/function/class exists.
2. **Registration** — it is actually registered: route table, DI container, CLI dispatcher,
   event subscription, cron entry, queue consumer binding, plugin manifest, framework
   decorator, export list.
3. **Reachability** — something can invoke that registration: the route is mounted under a
   router that is itself mounted; the consumer group is subscribed to a topic something
   publishes; the flag gating it is on in some environment.
4. **Input contract** — what the caller sends matches what the handler expects (field names,
   casing, types, envelope shape). Mismatch here is invisible until runtime.
5. **Execution** — no early return, no unhandled error, no unmet precondition that makes it a
   no-op in practice.
6. **Effect** — the result is persisted, returned, or emitted. Check the return value is used:
   `compute_discount(order)` whose result is never assigned is dead work.
7. **Consumption** — someone reads the effect: the UI reads the field, the downstream service
   subscribes to the event, the report queries the column.
8. **Round trip** — where possible, run it: hit the endpoint, publish the event, run the
   command, and observe the state change. One executed trace beats ten static inferences.

**Common breaks to look for specifically:** router included but not mounted; event published to
a topic with no subscriber (or subscriber on a differently-spelled topic); feature flag default
`false` everywhere; migration written but never applied; env var read with a default that masks
its absence; frontend calling an endpoint path that no longer exists; a scheduled job defined in
code but absent from the deployment manifest; a config key read from the wrong section.

**Report format:** state which hop breaks and how you know. "Wired end to end, verified by
running `X`" is a valuable positive finding — record it too, because the point of the exercise
is a truthful map of what works.

---

## 4. Dead code

**Candidates:** unreferenced functions/classes/modules, unreachable branches, permanently-off
feature flags, commented-out blocks, unused exports, unused config keys, orphaned migrations,
unused DB columns and tables, unused dependencies, unused CSS/assets, endpoints nothing calls.

**Before calling anything dead, check every way it could still be reached:**

- dynamic dispatch: `getattr`, `eval`, reflection, `Class.forName`, method lookup by string;
- string-registered routes, commands, tasks, and event names built by concatenation;
- DI containers and service locators that bind by interface or convention;
- serialization/ORM hooks, lifecycle callbacks, signal handlers, decorators run at import;
- templates, config files, IaC, and CI scripts referencing the symbol by name;
- code generation and build steps;
- consumers outside this repo: other services, mobile clients, partners, SQL dashboards;
- tests only — which means the code is dead in production but its removal breaks the suite;
- public API surface of a published library, where "unused here" is irrelevant.

Tag dead-code findings `LIKELY` unless you have checked all of the above, and always state the
verification the team should run (e.g., "add a log line and observe zero hits over one week")
before deletion. Deleting code that turned out to be reachable is a far worse outcome than
leaving it one more month.

---

## 5. Clone sweep — the same defect somewhere else

Duplication hunting looks for repeated *code*. A clone sweep looks for repeated *mistakes* —
code that is not textually similar at all, but wrong in the same way. Most defects come from a
habit, a copied block, or a misread API, and all three repeat. Reporting one instance while
three siblings stay live means the same incident returns from a different file next quarter.

**Run this for every finding you tag CONFIRMED, and for every Blocker or Major regardless of
tag.** Do it while the defect is fresh; you will never search this precisely again later.

**Method — build a search key from the *shape* of the defect, not its text:**

| Defect found | Search for |
|---|---|
| `requests.get()` with no timeout | every outbound call in the repo; list which ones set a timeout |
| Authorization missing on one route | every route in the same router/module; compare their guards |
| `Decimal` → `float` before rounding | every conversion between the two types near money |
| Unawaited async call | every call to that function, and every other `async def` used the same way |
| Wrong tenant/user filter in a query | every query against the same table |
| Cache key missing the user ID | every key built for that cache |
| Event published to a topic with no consumer | every publish call and its subscriber list |
| A misused library API | every call site of that API |

**Practical searches:** grep the function or API name for all call sites; grep the enclosing
module for sibling handlers; list every implementation of the interface the buggy class
implements; check the file's git history for other files changed in the same commits (they were
usually written by the same hand at the same time, with the same misunderstanding).

**Report the sweep result either way.** "Checked all 14 call sites of `fetch_json`; 3 others
have the same missing timeout (F-06)" and "checked all 14; this was the only one" are both
useful. The second one tells the team the defect is local and cheap — which changes both
severity and remediation.

**Severity note:** a defect with confirmed clones is usually one severity higher than the same
defect in isolation, because the fix is no longer a one-line change and any missed sibling
silently keeps the bug alive.

---

## 6. Consistency roll-up

Before writing the report, group findings by underlying cause. Twenty missing-timeout findings
across twenty files is one systemic finding: "no shared HTTP client with default timeouts;
twenty call sites each configure their own, seven omit timeouts entirely." The systemic framing
changes the remediation from twenty patches to one shared client — a different, better, and
cheaper piece of work. Presenting them as twenty items also buries every other issue in the
report.
