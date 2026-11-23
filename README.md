# vector-skills

Agent skills for [Claude Code](https://claude.com/claude-code) and other coding agents that read
`SKILL.md` skills: a **React Native / Expo mobile app builder**, **App Store and Google Play submission
and rejection handling**, **NestJS backend guidelines**, and engineering workflows for implementing,
debugging, reviewing and refactoring code. Each skill teaches the agent a domain — how to think, what
rules to follow, what mistakes to avoid — distilled from shipping real products, so you don't have to
re-explain it every session.

```bash
npx skills add myatminlu/vector-skills                                      # all skills
npx skills add myatminlu/vector-skills --skill react-native-expo-app-builder  # just one
```

## Skills in this collection

### Mobile apps — React Native and Expo

| Skill | What it does |
|---|---|
| [`react-native-expo-app-builder`](./skills/react-native-expo-app-builder/) | Build a production-ready React Native app with Expo for iOS and Android from a design (Figma, screenshots) and an API (OpenAPI or docs). One command creates the project on the **latest Expo SDK** with a tested core — API client with single-flight token refresh, offline banner, script-aware text and screen primitives, mock API, OpenAPI types, contract smoke test, **Maestro end-to-end tests** on the iOS simulator and Android emulator — plus **only the modules the app needs**: auth, guest mode, AI consent, SSE streaming, uploads, remote config, offline cache, text size, Burmese, native tabs (`add-module` adds more later). Push, purchases, social sign-in, crash reporting, OTA and analytics are recipes written at the time from current docs. Plus the process around it: one-message intake, layered architecture and folder structure, build order, parallel agent workspaces, hardening matrix. A weekly CI canary builds the starter on the latest SDK. SKILL.md + 10 reference files + `create-app.mjs` / `add-module.mjs` + starter + evals. |
| [`app-store-play-store-submission`](./skills/app-store-play-store-submission/) | Get an Expo / React Native app approved on the **Apple App Store and Google Play**, and fix **App Store or Google Play rejections** in one turn. Pre-submission audit (App Review Guidelines, App Privacy and Data safety, account deletion, guest access, third-party AI consent, subscriptions, screenshots), version and build numbers, signing, release builds (AAB, iOS archive), a launch test on the newest iOS, TestFlight, hand-over, rejection protocol with reviewer reply templates, and post-launch notices and deadlines. SKILL.md + 4 reference files + release scripts + evals. |

### Backend — NestJS

| Skill | What it does |
|---|---|
| [`nestjs-dev-guidelines`](./skills/nestjs-dev-guidelines/) | Senior NestJS / Node.js backend engineer: execution discipline, folder structure, naming, module design, code quality, decision trees, API design, standard responses, pagination/filters/sorting, validation, error handling, exception filters, security, auth/RBAC, multi-tenancy, DB design + ORM patterns, migrations, cascade rules, pipes/interceptors/guards, events, background jobs, configuration, logging, observability/tracing, testing, performance, N+1 elimination, caching, Swagger docs, AI product patterns (LLM gateway, SSE streaming, usage metering & cost), code review checklist + anti-patterns, modern Nest stack, health/readiness/shutdown, source-of-truth freshness checks, webhooks, file uploads, decorators/scopes/dynamic modules, DDD layered/hexagonal architecture (ports/adapters/use cases). SKILL.md + 43 granular reference files + evals. |

### Engineering workflow

| Skill | What it does |
|---|---|
| [`code-implementation`](./skills/code-implementation/) | Architect-grade workflow for changing code in an existing codebase — features, fixes, refactors, integrations, migrations. Read the real code before writing any, trace the root cause instead of patching symptoms, reuse what exists instead of adding near-duplicates, verify end to end. SKILL.md + 5 reference files (investigation, root-cause, design-review, code-quality, verification) + evals. |
| [`bug-fixing`](./skills/bug-fixing/) | Disciplined defect workflow — reproduce, read the real code, find the true root cause, design the minimal correct fix at the right layer, verify it, then hunt for clones of the same defect. Covers crashes, wrong output, flaky tests, regressions, races, leaks, perf degradation, works-locally-not-in-prod. SKILL.md + 3 reference files (root-cause techniques, anti-patterns, report templates) + evals. |
| [`code-quality-check`](./skills/code-quality-check/) | Read-only, evidence-backed quality review producing severity-ranked findings, a scorecard, and a merge/ship verdict. For PR/diff review, pre-merge gates, and second opinions on agent- or teammate-written code. Hands off to the implementation workflow rather than writing the fix. SKILL.md + 6 reference files + `scripts/repo_signals.py` + evals. |
| [`project-structure-refactoring`](./skills/project-structure-refactoring/) | Cross-language project structure and structural refactoring: screaming-architecture / feature-first layout principles, safe staged restructuring (inventory → mapping table → approval gate → green stages), git mv history preservation, god-file splitting (symbol-level mapping, shrinking facades, extraction order), silent-breaker census (CI path filters, CODEOWNERS, Dockerfiles, dotted-path strings), and per-stack reference layouts for JS/TS (Node, React, Next.js, Expo), Python (src layout, FastAPI, Django), Go (cmd/internal), and monorepos (apps/packages, workspaces). Structural only — hands code-level refactoring to `code-implementation`. SKILL.md + 7 reference files + evals. |
| [`codebase-audit`](./skills/codebase-audit/) | Forensic whole-codebase audit and staged refactor plan — maps the system, verifies features are actually wired end to end, finds duplicated services and copy-pasted modules, band-aid fixes, dead code, and legacy-vs-new implementations living side by side. Emits a numbered report set. SKILL.md + 4 reference files + evals. |

(More skills planned — `react-frontend-guidelines`, etc.)

## Build a React Native app with an AI agent — FAQ

**How do I build a React Native app with Claude Code or another coding agent?**
Install `react-native-expo-app-builder`, give the agent your design (a Figma export or screenshots) and your API (an
OpenAPI file or docs), and ask it to build the app. It reads everything, sends back one short message with the few
decisions that are expensive to reverse (each with a recommendation), creates the project with
`create-expo-app@latest`, adds the tested starter, verifies your API with a smoke script, and builds feature slices
that it tests itself on both platforms.

**Do I get code my app doesn't need?**
No. Every app gets the core (what every app needs) and only the modules its brief calls for — an app without
accounts gets no sign-in code, an app without AI gets no consent sheet. `create-app.mjs --list` shows each module and
when it is worth it; `add-module.mjs` adds one later and regenerates what depends on it. Modules plug in through one
registry, so none of them edits a core file, and a feature of your own can follow the same shape.

**Won't code inside a skill go out of date?**
The parts that would are kept out of it. The core is mostly plain TypeScript with unit tests; vendor-heavy features
(push, purchases, social sign-in, crash reporting, OTA, analytics) are recipes the agent writes from the current docs;
and a weekly CI canary in this repository builds the starter with no module, with auth and with every module on
whatever Expo SDK is `latest`, so a breaking SDK change is found within a week — and fixed once for every future app.

**Which Expo SDK and library versions does it use?**
Whatever is `latest` on the day it runs. The skill pins no versions: `create-expo-app@latest`, `npx expo install` for
every library (so versions match the SDK), CLIs as `npx <tool>@latest`, and the versions it ended up with are written
into the project brief.

**Can the agent test the app by itself instead of me?**
Yes. Maestro taps through the iOS simulator and the Android emulator against release builds and a local mock API; a QA
tour screenshots every route; a hardening matrix covers tablets, the keyboard on Android, the largest text size,
offline, token expiry, deep links and permissions. "Done" means seen running on every target, with evidence.

**How do I fix an App Store or Google Play rejection with an AI agent?**
Paste the reviewer's whole message. `app-store-play-store-submission` runs a rejection protocol: the cause in the app
and in the process, the same problem found everywhere else, the fix with evidence, a reply for the reviewer, and a new
audit check so it does not happen again.

**Where do the rules come from?**
From shipping one Expo app — AI chat, subscriptions, two languages, phone and tablet — through four App Store
rejections: 165 prompts and 21 PRs, each prompt labelled by what the human was doing. The skills move that work
forward (store tasks on day one, verification before features, policies as gates), aiming at ten to twenty prompts
for the next app.

## Install

Via the [`skills`](https://skills.sh) CLI (recommended):

```bash
npx skills add myatminlu/vector-skills
```

Or manually — skills live in `~/.claude/skills/` so Claude Code auto-discovers them:

```bash
git clone https://github.com/myatminlu/vector-skills.git <local-path>/vector-skills
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
