# Reviewer Anti-Patterns

Read this against your own draft before delivering. Each entry is a failure mode that makes a
review useless or harmful, with the correction.

---

**Approval theater.** "Looks good overall, a few minor style points." Produced by skimming for
familiar shapes. The tell: no error path was traced, and every finding is cosmetic.
→ Before writing any verdict, name one error path you followed end to end and what happens on
it. If you cannot, you have not finished reviewing.

**Ghost findings.** A finding inferred from a function name, a comment, a type annotation, or
"frameworks like this usually…". These are worse than missing a bug: they cost the author time
proving you wrong and they poison trust in the real findings.
→ Every finding must quote code you read. If you cannot cite it, delete it.

**Nit avalanche.** Thirty naming/format/ordering comments that bury one Blocker. Authors triage
top-down; volume determines what gets ignored.
→ Cap nits at ~5, put them last, and consolidate anything a linter could own into a single
tooling finding.

**Rewrite reflex.** "I'd restructure this whole module with a strategy pattern." Not actionable,
not scoped, and usually a preference dressed as a standard.
→ Only report structure as a finding when you can name the concrete failure the current
structure causes, and propose the smallest change that removes that failure.

**Framework hand-waving.** "The ORM handles escaping", "the framework validates that",
"middleware catches those." Framework behavior depends on version, configuration, and how it is
called.
→ Verify in this repo: find the middleware registration, the escaping call, the validator.
Then cite it.

**Coverage worship.** Treating 85% coverage as evidence of good tests, or a low number as proof
of bad ones. Coverage measures execution, not verification.
→ Read the assertions of the tests that cover the risky code. Report assertion quality, not the
percentage.

**Symptom-level suggestions.** Recommending a null check, a try/except, or a retry to make a
reported problem go away. This is the review recommending a band-aid — the exact defect class
the skill exists to find.
→ Ask why the value is null / the call fails / the state is wrong, and recommend the fix at
that layer. If you cannot determine the cause, say so and mark the finding `SUSPECTED` with the
investigation needed.

**Silent scope creep.** Reporting pre-existing repo problems inside a PR review as if the
author introduced them, or expanding a single-file review into a repo audit nobody asked for.
→ Report them in a clearly labeled "pre-existing / out of scope" section, and let the author
decide.

**Severity inflation.** Marking everything Major so the review "feels rigorous". After one
round, the author stops trusting severities and reads them all as Minor.
→ Apply the rubric literally. Ask: what actually happens in production, and how likely is it?

**Confidence inflation.** Tagging inferences as CONFIRMED. One disproved CONFIRMED finding
discredits the whole report.
→ CONFIRMED requires a trace you can reproduce or an execution you observed.

**Context blindness.** Applying enterprise-grade standards to a throwaway prototype, or startup
pragmatism to a payments service.
→ Establish stakes in Phase 0 and state the standard you are reviewing against.

**Style colonialism.** Imposing conventions from another language or team onto a codebase with
its own consistent, working conventions.
→ Review against this codebase's conventions. If a convention is genuinely harmful, file that
as one explicit finding, separate from the code under review.

**The unreviewed diff.** Reporting on the changed lines only, ignoring the callers, consumers,
and contracts the change affects.
→ Blast radius is part of the review. A three-line change to a shared function is a review of
every caller.

**Assuming the tests pass.** Reporting on code without noticing the suite is red, or claiming
"the tests cover this" without running or reading them.
→ Run what you can; state clearly what you did not run.

**Fixing while reviewing.** Editing code mid-review destroys the audit trail and produces a
diff nobody can evaluate.
→ Findings only. Hand off fixes to the implementation or bug-fixing workflow, carrying the
finding IDs.

**Politeness that hides the message.** Wrapping a Blocker in so much cushioning the author
misses it — or the opposite, contempt that makes the finding easy to dismiss.
→ Be direct and specific about the code; never about the person. "This path loses the customer
ID on retry" is both kinder and more useful than either padding or sneering.
