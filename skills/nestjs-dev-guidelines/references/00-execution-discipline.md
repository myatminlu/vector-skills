# 00 — Execution Discipline

## TL;DR

- Think before coding. State assumptions; don't silently guess.
- Prefer the smallest correct change. Don't build for hypothetical futures.
- Make surgical edits. Touch only what the task requires.
- Turn requests into verifiable outcomes. Don't stop at "looks right".
- When uncertain, ask early instead of implementing the wrong thing confidently.

## Why this file exists

Most bad backend changes are not caused by weak NestJS knowledge. They come from generic
execution mistakes:

- choosing one interpretation of an ambiguous request without saying so
- adding abstractions, config, or helpers before they are justified
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

## 3. Surgical changes

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

## 4. Goal-driven execution

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

## 5. Ask early when blocked

Good questions are short and concrete.

Ask when:

- the request has multiple materially different interpretations
- the repo contains conflicting patterns and the choice affects behavior
- the change touches security, auth, billing, migrations, or external contracts and intent is
  unclear
- the user appears to want a design decision, not just implementation

Do not ask when:

- the repo already has a dominant pattern and the task fits it
- the choice is a minor implementation detail with no behavioral difference
- you can verify the answer directly from the codebase

## 6. Definition of done

Do not present the task as finished until all are true:

1. The requested behavior is implemented.
2. The change is minimal and local to the task.
3. Obvious edge cases relevant to the request are covered.
4. The strongest practical verification for the task has been run, or you explicitly say what
   you could not verify.
5. The final explanation matches what changed and does not overclaim certainty.

## Review checklist for yourself

Before you stop, check:

- Did I make any silent assumptions that should have been stated?
- Did I add any helper, abstraction, or config that is not yet justified?
- Did I touch unrelated lines?
- Can I point to a concrete verification step?
- If this diff appeared in review, would it look obviously scoped to the task?

## Anti-patterns

- "I'll just make it flexible while I'm here."
- "I'll clean up this neighboring code too."
- "This probably means X" without checking the repo or asking.
- "Tests are unnecessary because the code is simple" when behavior changed.
- "It should work" with no verification.

## How this connects to the rest of the skill

- Use this file first for behavior and scoping.
- Use `05-thinking-decision-trees.md` for architectural tradeoffs and placement.
- Use topic references (`09`, `10`, `11`, `23`, etc.) for implementation rules.
- Use `29-code-review-checklist.md` when reviewing someone else's diff.
