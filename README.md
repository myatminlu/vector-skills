# vector-skills

A personal library of [Claude Code](https://claude.com/claude-code) skills. Each skill
teaches the agent a domain — how to think, what rules to follow, what mistakes to avoid —
when working on that kind of code.

## Skills in this collection

| Skill | What it does |
|---|---|
| [`nestjs-dev-guidelines`](./skills/nestjs-dev-guidelines/) | Senior NestJS / Node.js backend engineer: execution discipline, folder structure, naming, module design, code quality, decision trees, API design, standard responses, pagination/filters/sorting, validation, error handling, exception filters, security, auth/RBAC, multi-tenancy, DB design + ORM patterns, migrations, cascade rules, pipes/interceptors/guards, events, background jobs, configuration, logging, observability/tracing, testing, performance, N+1 elimination, caching, Swagger docs, AI product patterns (LLM gateway, SSE streaming, usage metering & cost), code review checklist + anti-patterns, modern Nest stack, health/readiness/shutdown, source-of-truth freshness checks, webhooks, file uploads, decorators/scopes/dynamic modules, DDD layered/hexagonal architecture (ports/adapters/use cases). SKILL.md + 43 granular reference files + evals. |
| [`code-implementation`](./skills/code-implementation/) | Architect-grade workflow for changing code in an existing codebase — features, fixes, refactors, integrations, migrations. Read the real code before writing any, trace the root cause instead of patching symptoms, reuse what exists instead of adding near-duplicates, verify end to end. SKILL.md + 5 reference files (investigation, root-cause, design-review, code-quality, verification) + evals. |
| [`bug-fixing`](./skills/bug-fixing/) | Disciplined defect workflow — reproduce, read the real code, find the true root cause, design the minimal correct fix at the right layer, verify it, then hunt for clones of the same defect. Covers crashes, wrong output, flaky tests, regressions, races, leaks, perf degradation, works-locally-not-in-prod. SKILL.md + 3 reference files (root-cause techniques, anti-patterns, report templates) + evals. |
| [`code-quality-check`](./skills/code-quality-check/) | Read-only, evidence-backed quality review producing severity-ranked findings, a scorecard, and a merge/ship verdict. For PR/diff review, pre-merge gates, and second opinions on agent- or teammate-written code. Hands off to the implementation workflow rather than writing the fix. SKILL.md + 6 reference files + `scripts/repo_signals.py` + evals. |
| [`project-structure-refactoring`](./skills/project-structure-refactoring/) | Cross-language project structure and structural refactoring: screaming-architecture / feature-first layout principles, safe staged restructuring (inventory → mapping table → approval gate → green stages), git mv history preservation, god-file splitting (symbol-level mapping, shrinking facades, extraction order), silent-breaker census (CI path filters, CODEOWNERS, Dockerfiles, dotted-path strings), and per-stack reference layouts for JS/TS (Node, React, Next.js, Expo), Python (src layout, FastAPI, Django), Go (cmd/internal), and monorepos (apps/packages, workspaces). Structural only — hands code-level refactoring to `code-implementation`. SKILL.md + 7 reference files + evals. |
| [`codebase-audit`](./skills/codebase-audit/) | Forensic whole-codebase audit and staged refactor plan — maps the system, verifies features are actually wired end to end, finds duplicated services and copy-pasted modules, band-aid fixes, dead code, and legacy-vs-new implementations living side by side. Emits a numbered report set. SKILL.md + 4 reference files + evals. |

(More skills planned — `react-frontend-guidelines`, `expo-mobile-guidelines`, etc.)

## Install

Via the [`skills`](https://skills.sh) CLI (recommended):

```bash
npx skills add myatminlu/vector-skills
```

Or manually — skills live in `~/.claude/skills/` so Claude Code auto-discovers them:

```bash
git clone <repo-url> <local-path>/vector-skills
ln -s <local-path>/vector-skills/skills/nestjs-dev-guidelines \
      ~/.claude/skills/nestjs-dev-guidelines
```

Next Claude Code session will load the skill automatically. No restart or install step.

## Updating a skill

```bash
npx skills update
```

## Editing a skill

Edit the files in place. Changes take effect on the next Claude Code session.

```bash
cd <local-path>/vector-skills/skills/nestjs-dev-guidelines
vim references/08-pagination-filters-sorting.md

# optional structural validation
python3 ~/.claude/skills/skill-creator/scripts/quick_validate.py .

git add . && git commit -m "tighten pagination rule"
git push
```

## Adding a new skill

```bash
cd <local-path>/vector-skills/skills
mkdir my-new-skill
cd my-new-skill
# Create SKILL.md (required) + optional references/, evals/, assets/, scripts/
ln -s $PWD ~/.claude/skills/my-new-skill
git add . && git commit -m "Add my-new-skill"
```

A skill is a folder with at least a `SKILL.md` file containing YAML frontmatter
(`name`, `description`). See any existing skill as a template.

## Authoring conventions

- Keep `SKILL.md` scannable (≤ 500 lines). Deep dives go in `references/`.
- Each reference file: TL;DR → rules (good/bad code) → anti-patterns → review checklist.
- Write `description` in the frontmatter so Claude triggers the skill reliably
  (concrete keywords + "use when X" framing). Max 1024 characters.
- Add `evals/evals.json` with 5–10 substantive test tasks to catch regressions.

## Running evals

Each skill ships `evals/evals.json` (prompt, expected output, `must_include` keyphrases) and a
coarse grader. Run the prompts against an agent with the skill loaded, save the replies as a
JSON list of `{ "id": N, "response": "..." }`, then grade:

```bash
python3 skills/<skill>/evals/scripts/grade.py responses.json
```

It is a substring check, not an LLM judge — it catches gross misses (wrong topic, missing
required terms), not subtle correctness. Exit code is non-zero if any eval fails; pass
`--threshold 0.8` to allow partial misses.

## Author

Built and maintained by **Myat Min Lu** — a developer curating a personal
collection of Claude Code skills distilled from day-to-day engineering work.
Each skill captures the conventions, rules, and hard-won lessons worth teaching
an agent once so they don't have to be re-explained every session.

- GitHub: [@myatminlu](https://github.com/myatminlu)
- Contact: myatminlu@myvectorai.com

Contributions, forks, and feedback are welcome.

## License

MIT — feel free to fork and adapt.
