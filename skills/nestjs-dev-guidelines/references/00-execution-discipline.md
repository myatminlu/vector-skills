# 00 — Execution Discipline

## TL;DR

- Think before coding. State assumptions; don't silently guess.
- Verify volatile facts (versions, package APIs, model IDs, command flags) against official docs and the repo — don't recall from memory.
- Search for existing code before writing new code.
- Fix root causes, not one observed phrase, prompt, or trigger string.
- Prefer the smallest correct change. Don't build for hypothetical futures.
- Make surgical edits. Touch only what the task requires.
- Search and update the full impact surface before claiming the fix is done.
- Ask before changing shared behavior or reusable contracts.
- Turn requests into verifiable outcomes. Don't stop at "looks right".
- When uncertain, ask early instead of implementing the wrong thing confidently.
- Don't claim done until the impact surface, verification, and edge cases are closed out.

## Why this file exists

Most bad backend changes are not caused by weak NestJS knowledge. They come from generic
execution mistakes:

- choosing one interpretation of an ambiguous request without saying so
- writing a new helper/service when the repo already has one
- recommending a version, package API, model ID, or install command from memory without verifying it against current docs or the repo
- patching one observed input with a regex or hardcoded rule instead of fixing the class of bug
- adding abstractions, config, or helpers before they are justified
- fixing one local call site while leaving the rest of the impact surface inconsistent
- changing shared behavior without acknowledging the blast radius
- refactoring neighboring code that was not part of the task
- claiming a fix without a meaningful check

This file is the behavioral layer that sits above every other reference in this skill.

## Priority order

When the task creates tension between "move fast" and "be correct", use this order:

1. Correctness
2. Security
3. Data integrity
4. Reversibility
5. Repo consistency
6. Simplicity
7. Speed

If a faster approach makes the change harder to reason about, harder to review, or harder to
undo, it usually loses.

## 1. Think before coding

Before implementing, answer these questions explicitly in your own reasoning, and surface them to
the user when they affect the direction:

1. What is the user actually asking for?
2. What assumptions am I making?
3. Is there more than one valid interpretation?
4. What is the smallest change that satisfies the request?
5. What evidence will prove the work is correct?

### Rules

- Do not assume hidden requirements.
- Do not hide confusion behind confident code.
- If there are multiple plausible interpretations, list them or ask.
- If one approach is clearly simpler, prefer it and say why.
- If the task wording conflicts with the existing codebase pattern, call that out before coding.
- If any assumption is about a volatile fact (framework/runtime version, package API shape,
  model ID, install command, CLI flag), verify it against official docs and the repo before
  acting on it. See [`35-source-of-truth-freshness.md`](./35-source-of-truth-freshness.md).

### Good

"This could mean either adding validation to the DTO only, or also returning a new error code
from the controller. The current API already uses standard validation errors, so I'll keep the
change DTO-only unless you want a custom error contract."

### Bad

"Added a validation framework, custom error mapper, and config flag" when the request was
"validate email input".

## 2. Simplicity first

Write the minimum code that solves the actual problem.

### Rules

- No features beyond the request.
- No abstraction for one call site.
- No configurability without a concrete second use case.
- No defensive code for impossible states unless the codebase already requires it.
- No 200-line solution when 50 lines will do.

### Heuristics

- Prefer one straightforward function over a mini-framework.
- Prefer one DTO or one query change over introducing a reusable layer that is only used once.
- Prefer duplication over premature abstraction when the pattern is not stable yet.
- Prefer existing repo patterns over "cleaner" new patterns.

### Stop-and-check question

Would a senior reviewer say, "this works, but it's more complicated than the problem"?

If yes, simplify before moving on.

## 3. Search before writing new code

Before adding a new util, service, helper, DTO, guard, interceptor, repository method, or query
shape, first inspect the existing codebase for something close enough to reuse.

### Search order

1. The same module or feature folder
2. Module-local `utils/`, DTOs, repositories, services, guards, interceptors
3. `common/`, `core/`, `integrations/`, or other repo-wide shared code
4. `events/` for an existing publisher/listener before adding a new event
5. `commands/` for an existing CLI/cron task before adding a new one
6. Existing tests that show the intended pattern

### Rules

- Do not create a new helper until you have checked whether one already exists.
- For list endpoints, inspect existing pagination DTOs, contracts, and sibling endpoint behavior
  before inventing or changing a pagination model.
- Prefer extending existing local code when the semantics stay the same.
- Prefer an established repo pattern over introducing a parallel pattern.
- Reuse should reduce duplication, not force unrelated use cases into one abstraction.

### Reuse hierarchy

- Same-module existing code beats shared code.
- Shared code beats new code when the behavior already matches.
- New code beats forced reuse when reuse would bend the abstraction or confuse existing callers.

### Good

- Reuse an existing pagination DTO from the same module instead of adding a second one.
- Extend an existing repository query method when the new filter preserves its meaning.

### Bad

- Add `date.util.ts` without checking whether date formatting already lives in `common/`.
- Create a second auth helper because the first one is "not in the folder I expected".

## 4. Surgical changes

Every changed line should trace back to the user request or to verification that the request is
safely handled.

### Rules

- Do not opportunistically refactor adjacent code.
- Do not reformat files unless your edit requires it.
- Do not rename symbols just because you dislike the current naming.
- Match the existing local style unless it is actively harmful.
- Remove only the unused code created by your own change.
- If you notice unrelated dead code or a separate bug, mention it; don't fix it silently.

### Good

- Add a DTO field, service branch, and tests directly tied to the new requirement.
- Remove an import made unused by your own edit.

### Bad

- Reorganize the module structure while fixing one endpoint bug.
- Reformat the whole file while changing one query.

## 5. Fix root causes, not trigger hacks

Fix the underlying class of failure, not one observed wording, screenshot, or prompt fragment.

### Rules

- Do not patch broad behavior with phrase-specific regexes, hardcoded keywords, or manual
  `if input === '...'` routing unless the product requirement is explicitly deterministic
  rule-based matching.
- Do not hide design problems in the system prompt when the real fix belongs in code,
  architecture, state handling, or contracts.
- If a proposed fix works only for one exact wording, assume it is incomplete until proven
  otherwise.
- Prefer semantic, typed, state-based, or architecture-based fixes over string-trigger hacks.

### Questions to ask yourself

1. What broader bug class produced this observed failure?
2. What neighboring inputs, flows, or languages fail for the same reason?
3. Am I fixing intent/state/contract handling, or only this one literal example?
4. Would the fix still work if the user phrased the request differently?

### Good

- Fix the role/permission check in the guard instead of `if (user.email === 'admin@example.com')`
  for one customer's edge case.
- Route behavior from an explicit command registry, parsed intent, or structured state instead of
  regex-matching one Burmese phrase.
- Fix the shared planner/tool-selection logic instead of adding a special-case system-prompt rule
  for one sentence.

### Bad

- `if (/ဘာလုပ်စရာရှိလဲ/.test(input)) return listTasks()` when the real issue is missing intent
  detection.
- Adding "if user says X, do Y" to the prompt for behavior that should be inferred from context.

## 6. Ask before changing shared behavior

Reusing code is good. Quietly changing reusable code that other callers depend on is not.

### Ask before changing

- a shared util or service used across modules
- a DTO, guard, interceptor, or repository method with multiple callers
- a function name, signature, return shape, or error behavior that other code may rely on
- a reusable abstraction that needs branching or new flags to fit the new request
- behavior that may require backward compatibility for existing callers
- the global response envelope or pagination contract (see [`07-standard-responses.md`](./07-standard-responses.md), [`08-pagination-filters-sorting.md`](./08-pagination-filters-sorting.md)) — every endpoint and client depends on it
- the global exception filter or error wire shape (see [`39-exception-filters.md`](./39-exception-filters.md), [`10-error-handling.md`](./10-error-handling.md)) — every consumer parses these

### Usually safe without asking

- extending local code inside the same module when semantics stay the same
- making an internal helper more complete for the same use case
- reusing an existing shared helper exactly as-is

### Decision rule

If the change preserves meaning and only widens support for the same concept, extending existing
code is usually correct. If the change alters semantics, increases configurability, or affects
multiple consumers, ask the user before changing the shared code.

### Good

"There is already a shared `PaginationQueryDto`. To use it here I would need to change its sort
rules for other endpoints too. Do you want me to update the shared DTO, or keep this endpoint
separate with a local DTO?"

### Bad

Silently generalizing a shared helper with two new flags because one endpoint needed slightly
different behavior.

## 7. Search and update the full impact surface

When a fix touches shared code, contracts, names, DTOs, types, or behavior, the work is not done
at the first passing call site. Search the whole impact surface and close it out deliberately.

### Impact propagation order

1. Direct call sites and imports
2. Interfaces, DTOs, schemas, types, and validators tied to the changed behavior
3. Tests, fixtures, evals, and snapshots
4. Docs, examples, Swagger/OpenAPI schemas, and README snippets
5. Error handling, logging, metrics, and other supporting flows affected by the change

### Rules

- Search all impacted callers before claiming a shared fix is complete.
- Do not stop after the first local fix if the same issue likely exists elsewhere.
- Token savings, diff size, or time pressure are not reasons to leave known affected locations
  stale.
- Scope by impact, not by convenience. A 5-line bug can require 50 aligned edits.
- If the surface is genuinely too large to finish safely in one pass, say what you searched, what
  remains, and why.

### Good

- Rename a shared service method and update all callers, tests, docs, and examples in the same
  change.
- Change an error shape and then update the filter, DTOs, tests, Swagger docs, and checklist
  examples that reference it.

### Bad

- Fix one endpoint after a shared DTO change but leave sibling endpoints and tests stale.
- Update the code but not the docs or examples that teach the old contract.

## 8. Goal-driven execution

Turn vague tasks into checks that can fail.

### Examples

- "Fix the bug" -> reproduce it, then prove the reproduction no longer fails.
- "Add validation" -> add or update tests for invalid input, then make them pass.
- "Refactor X" -> keep behavior stable; run the relevant tests before and after.
- "Add endpoint" -> e2e happy path, one error path, and Swagger/contract consistency.

### Verification ladder

Use the cheapest check that gives real confidence, then escalate if needed:

1. Typecheck
2. Unit test
3. Integration test
4. E2E test
5. Targeted manual reproduction
6. Lint/build if they validate affected paths

"It compiles" is not enough for behavior changes.

## 9. Ask early when blocked

Good questions are short and concrete.

Ask when:

- the request has multiple materially different interpretations
- the repo contains conflicting patterns and the choice affects behavior
- the correct fix seems to require brittle phrase matching or manual one-off rules
- reuse requires changing shared or reusable code in a way that may affect other callers
- the impact surface is broad and different fixes have different blast radii
- the change touches security, auth, billing, migrations, or external contracts and intent is
  unclear
- the user appears to want a design decision, not just implementation

Do not ask when:

- the repo already has a dominant pattern and the task fits it
- the choice is a minor implementation detail with no behavioral difference
- existing code can be reused as-is, or extended locally without changing shared semantics
- the impact surface is clear and you can close it out completely
- you can verify the answer directly from the codebase

## 10. Definition of done

*Use this as the objective check before you tell the user the task is done.*

Do not present the task as finished until all are true:

1. The requested behavior is implemented.
2. Existing local or shared code was considered before new code was introduced.
3. The fix addresses the underlying bug class, not just one observed wording or example.
4. The change is minimal and local to the task.
5. Shared behavior was not changed silently when the blast radius was unclear.
6. All known impacted callers, tests, docs, examples, and related contracts were updated, or you
   explicitly say what remains.
7. Obvious edge cases relevant to the request are covered.
8. The strongest practical verification for the task has been run, or you explicitly say what
   you could not verify.
9. The final explanation matches what changed and does not overclaim certainty.

## Review checklist for yourself

*Use this as a doubt scan after the code is written, before you hand it off.*

Before you stop, check:

- Did I make any silent assumptions that should have been stated?
- Did I check for existing reusable code before adding new code?
- Did I verify any version, package API, model ID, install command, or CLI flag I cited against current docs or the repo, instead of recalling from memory?
- If this touched a list endpoint, did I inspect existing pagination usage before changing it?
- Did I solve the class of bug, or only one literal example?
- Did I add any helper, abstraction, or config that is not yet justified?
- Did I change any shared code whose blast radius should have been confirmed first?
- Did I search the full impact surface across callers, tests, docs, and contracts?
- Did I touch unrelated lines?
- Can I point to a concrete verification step?
- If this diff appeared in review, would it look obviously scoped to the task?

## Anti-patterns

*Watch for these as early-warning signals before or while you write code.*

- "I'll just make it flexible while I'm here."
- "I'll write a new helper; searching the repo will take longer."
- "I'll just regex-match this one phrase" when the behavior is broader than one phrase.
- "I'll patch the prompt" when the real fix belongs in code or architecture.
- "I'll clean up this neighboring code too."
- "This probably means X" without checking the repo or asking.
- "I'll tweak the shared util quickly" without checking who else relies on it.
- "One call site is fixed, that's probably enough" without searching the rest.
- "Tests are unnecessary because the code is simple" when behavior changed.
- "I remember the version / install command / model ID / API shape" without verifying against current docs or the repo.
- "It should work" with no verification.

## How this connects to the rest of the skill

- Use this file first for behavior and scoping.
- Use `05-thinking-decision-trees.md` for architectural tradeoffs and placement.
- Use topic references (`09`, `10`, `11`, `23`, etc.) for implementation rules.
- Use `29-code-review-checklist.md` when reviewing someone else's diff.
- Use `30-code-review-anti-patterns.md` for the catalog form of these anti-patterns.
- Use `31-rules-rationale-examples.md` for cross-cut rule rationale and quick examples.
- Use `35-source-of-truth-freshness.md` before recommending versions, package APIs, model IDs, or any volatile fact — verify against official docs and the repo, do not recall from memory.
- Use `32-modern-nestjs-stack.md` when modernizing or starting a service — decision checklist, not a frozen version matrix.
- Use `38-decorators-scopes-dynamic-modules.md` when reaching for custom decorators, request-scoped providers, or `forwardRef` — these are common silent mistakes.
