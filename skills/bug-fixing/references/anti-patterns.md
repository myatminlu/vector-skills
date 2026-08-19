# Band-Aid Anti-Patterns

Two uses for this file:

1. **Before writing a fix** — check that your change is not one of these in disguise.
2. **While reading existing code** — these are the symptom-level patches already in the codebase. Flag every one you encounter with its location and the root fix it is standing in for, even if fixing it is out of scope.

The test for a band-aid: *if the underlying cause were fixed, would this line become unnecessary?* If yes, and you are adding it anyway, you are patching a symptom.

---

## 1. The silent catch

```js
try {
  syncInventory(order);
} catch (e) {
  // ignore - was crashing in prod
}
```

Hides: a real failure, now invisible, with inventory silently wrong.

Root fix: determine why it throws. Then either handle it meaningfully (compensate, queue for retry, surface to the user) or let it propagate. If a failure genuinely is tolerable, say so explicitly and log at the right level with context — `catch (e) { log.warn("inventory sync failed, will reconcile nightly", e) }` is a decision; an empty catch is a cover-up.

## 2. The default that swallows bad data

```js
const total = items.reduce((s, i) => s + (Number(i.price) || 0), 0);
```

Hides: prices that fail to parse. The report now shows a plausible, wrong number — worse than a crash, because nobody notices.

Root fix: validate and convert at the boundary where prices enter the system; make the domain type unable to hold an unparsed price. Let the failure be loud where the data is wrong, not silent where it is used.

## 3. The null check at the crash site

```python
if user is None:
    return          # added because of the NPE in the ticket
send_receipt(user, order)
```

Hides: why `user` is `None` here at all. The receipt is now silently never sent.

Root fix: trace the producer. Either the lookup should have failed loudly (missing record = a broken invariant), or nullability is legitimate and must be modeled explicitly in the type/contract and handled deliberately at every call site.

## 4. Sleep and retry as synchronization

```js
await createRecord(id);
await sleep(200);          // give the DB a moment
const rec = await fetchRecord(id);
```

Hides: a race, a missing await, replica lag, or an eventually-consistent read.

Root fix: await the actual condition — the transaction's completion, a read-your-writes guarantee, a primary read, or an event that signals readiness. Sleeps are timing bombs: they fail under load and waste time when they don't.

## 5. The constant tuned until green

```python
TIMEOUT = 30   # was 5, then 10, then 20
```

Hides: an unbounded operation, an N+1 query, a retry storm, or a genuinely wrong algorithm.

Root fix: measure why the operation takes that long and fix the cost. If the higher timeout is genuinely correct, justify it with measured numbers in the report — a constant with a reason is fine; a constant that drifts upward over commits is a symptom trail.

## 6. The special case

```js
if (accountId === "acct_88213") {
  return legacyRate;
}
```

Hides: a general rule the model does not express (grandfathered pricing, a migration state, a tenant-specific configuration).

Root fix: model the rule — a field, a policy object, a configuration record. Special cases multiply; each one makes the next bug harder to find.

## 7. The wrapper that corrects the output

```js
function getUser(id) {
  const u = repo.getUser(id);
  return { ...u, email: u.email?.trim().toLowerCase() };  // repo returns dirty emails
}
```

Hides: dirty data at the source, and only for callers who go through this wrapper.

Root fix: normalize where the data is written or where it enters the system, then delete the wrapper. Correcting downstream guarantees the next caller gets it wrong.

## 8. The re-fetch that dodges a stale cache

```js
let profile = cache.get(id);
profile = await api.getProfile(id);   // cache was wrong sometimes
```

Hides: broken invalidation. Also silently discards the cache's purpose.

Root fix: fix ownership and invalidation — who writes this key, who must invalidate it, what the TTL means. If the cache cannot be made correct, remove it deliberately and say why.

## 9. The disabled test

```python
@pytest.mark.skip(reason="flaky")
def test_concurrent_checkout(): ...
```

Hides: usually a genuine race in the production code.

Root fix: diagnose the flake (see `root-cause-techniques.md` §5). Deleting or skipping the test removes the alarm, not the fire. If the test itself is wrong, prove it and fix the test with an explanation.

## 10. The assertion loosened to fit

```js
- expect(total).toBe(119.99);
+ expect(total).toBeGreaterThan(0);
```

Hides: an incorrect calculation, permanently, behind a test that can no longer fail.

Root fix: derive the correct expected value from the specification and fix the code. Weakening an assertion converts a test into decoration.

## 11. Defensive checks that cannot trigger

```java
if (list != null && !list.isEmpty() && list.get(0) != null) { ... }
```

Hides: nothing — but it signals that the author did not know the invariants, and it teaches the next reader that these states are possible. It also suppresses future failures that should be loud.

Root fix: establish the invariant at the boundary (non-null guarantees, an empty-safe type) and let the code state its assumptions plainly.

## 12. The flag that routes around the bug

```js
if (featureFlags.useNewPricing) { newPath() } else { oldPath() }  // old path still broken
```

Hides: the defect on the path still serving some users, plus a permanent branch nobody dares delete.

Root fix: flags are for controlled rollout, not for abandoning broken code in place. Fix the path or remove it, and set a deletion date for the flag.

## 13. Copy-paste "fix" of a duplicated implementation

Fixing one of three copies of the same logic. The other two will regress and the divergence makes the eventual consolidation harder.

Root fix: fix all copies in the same change, or consolidate to one implementation. Always report the duplication with all locations — duplicated code, duplicated features, and duplicated services are structural defects even when no single one is failing today.

## 14. Broadening a catch to keep the process alive

```python
except Exception:      # was: except TimeoutError
    return cached_result
```

Hides: every other error class, including programming errors, behind a stale-data path.

Root fix: catch the narrowest exception you can justify, map it to a domain-level error, and let unexpected classes surface.

## 15. Mutating shared state to force the right answer

Resetting a global, clearing a cache, re-initializing a singleton, or re-registering a listener as part of a request path — because otherwise it is wrong.

Root fix: the state should not be shared, or its lifecycle should not be implicit. Correct ownership; do not add rituals that everyone must remember to perform.

---

## Reporting band-aids you find but should not fix

Fixing everything you find turns a bug fix into an unreviewable change. Instead, list findings like this:

```
### Related findings (not fixed in this change)

1. `payments/refund.py:88` — empty `except Exception` swallows gateway errors;
   refunds can silently fail. Suggest: narrow to `GatewayError`, propagate the rest.
   Severity: high (money, silent).
2. `import/csv_parser.py:31` and `admin/upload.py:74` — two implementations of
   price parsing that disagree on decimal separators. Suggest: consolidate on the
   validated parser at the ingestion boundary. Severity: high (this bug's clone).
3. `orders/service.py:210` — comment claims the list is pre-sorted; the code does
   not sort and no caller guarantees it. Suggest: enforce or drop the assumption.
   Severity: medium.
```

Give each finding a location, the risk it carries, a suggested direction, and a severity — so a human can prioritize instead of re-investigating.
