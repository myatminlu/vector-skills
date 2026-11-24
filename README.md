# vector-skills

Agent skills for [Claude Code](https://claude.com/claude-code), [Antigravity](https://antigravity.google), [Cursor](https://cursor.com), [Codex](https://openai.com/codex), and any coding agent that reads `SKILL.md` skills: a **React Native / Expo mobile app builder**, **App Store and Google Play submission and rejection handling**, **NestJS backend guidelines**, and engineering workflows for implementing, debugging, reviewing, and refactoring code. Each skill teaches the agent a domain — how to think, what rules to follow, what mistakes to avoid — distilled from shipping real products, so you don't have to re-explain it every session.

```bash
npx skills add myatminlu/vector-skills                                      # all skills (skills.sh)
npx skills add myatminlu/vector-skills --skill react-native-expo-app-builder  # just one
```

## Skills in this collection

### Mobile apps — React Native and Expo

| Skill | What it does |
|---|---|
| [`react-native-expo-app-builder`](./skills/react-native-expo-app-builder/) | Build a production-ready React Native app with Expo for iOS and Android from a design (Figma, screenshots) and an API (OpenAPI or docs). One command creates the project on the **latest Expo SDK** with a tested core — API client with single-flight token refresh, offline banner, script-aware text and screen primitives, mock API, OpenAPI types, contract smoke test, **Maestro end-to-end tests** on the iOS simulator and Android emulator — plus **only the modules the app needs**: auth, guest mode, AI consent, SSE streaming, uploads, remote config, offline cache, text size, Burmese (or custom `lang-<code>` modules), native tabs (`add-module` adds more later). Push, purchases, social sign-in, crash reporting, OTA and analytics are recipes written at the time from current docs. Plus the process around it: one-message intake, layered architecture and folder structure, build order, parallel `git worktree` / Conductor workspaces, hardening matrix (including RTL and text expansion). A weekly CI canary builds the starter on the latest SDK. SKILL.md + 10 reference files + `create-app.mjs` / `add-module.mjs` + starter + evals. |
| [`app-store-play-store-submission`](./skills/app-store-play-store-submission/) | Get an Expo / React Native app approved on the **Apple App Store and Google Play**, and fix **App Store or Google Play rejections** in one turn. Pre-submission audit (App Review Guidelines, App Privacy and Data safety, account deletion, guest access, third-party AI consent, subscriptions, screenshots), version and build numbers, signing, release builds (local Xcode/Gradle or **EAS Build / EAS Submit**), a launch test on the newest iOS, TestFlight, hand-over, rejection protocol with reviewer reply templates, and post-launch notices and deadlines. SKILL.md + 4 reference files + release scripts + evals. |

### Backend — NestJS

| Skill | What it does |
|---|---|
| [`nestjs-dev-guidelines`](./skills/nestjs-dev-guidelines/) | Senior NestJS / Node.js backend engineer: execution discipline, folder structure, naming, module design, code quality, decision trees, API design, standard responses, pagination/filters/sorting, validation, error handling, exception filters, security, auth/RBAC, multi-tenancy, DB design + ORM patterns, migrations, cascade rules, pipes/interceptors/guards, events, background jobs, configuration, logging, observability/tracing, testing, performance, N+1 elimination, caching, Swagger docs, AI product patterns (LLM gateway, SSE streaming, usage metering & cost), code review checklist + anti-patterns, modern Nest stack, health/readiness/shutdown, source-of-truth freshness checks, webhooks, file uploads, decorators/scopes/dynamic modules, DDD layered/hexagonal architecture (ports/adapters/use cases). SKILL.md + 43 granular reference files + evals. |

### Engineering workflow

| Skill | What it does |
|---|---|
| [`code-implementation`](./skills/code-implementation/) | Architect-grade workflow for features, enhancements, code-level refactors, consolidations, integrations, and migrations in an existing codebase. Read the real code before writing any, trace the underlying cause, reuse what exists instead of adding near-duplicates, verify end to end with a mandatory pattern sweep. Hands pure defects to `bug-fixing` and layout moves to `project-structure-refactoring`. SKILL.md + 5 reference files + evals. |
| [`bug-fixing`](./skills/bug-fixing/) | Disciplined defect workflow — reproduce, read the real code, find the true root cause, design the minimal correct fix at the right layer, verify it, then hunt for clones of the same defect. Covers crashes, wrong output, flaky tests, regressions, races, leaks, perf degradation, works-locally-not-in-prod. SKILL.md + 3 reference files (root-cause techniques, anti-patterns, report templates) + evals. |
| [`code-quality-check`](./skills/code-quality-check/) | Read-only, evidence-backed quality review producing severity-ranked findings, a scorecard, and a merge/ship verdict. For PR/diff review, pre-merge gates, and second opinions on agent- or teammate-written code. Hands off to the implementation workflow rather than writing the fix. SKILL.md + 6 reference files + `scripts/repo_signals.py` + evals. |
| [`project-structure-refactoring`](./skills/project-structure-refactoring/) | Cross-language project structure and structural refactoring: screaming-architecture / feature-first layout principles, safe staged restructuring (inventory → mapping table → approval gate → green stages), git mv history preservation, god-file splitting (symbol-level mapping, shrinking facades, extraction order), silent-breaker census (CI path filters, CODEOWNERS, Dockerfiles, dotted-path strings), and per-stack reference layouts for JS/TS (Node, React, Next.js, Expo), Python (src layout, FastAPI, Django), Go (cmd/internal), and monorepos (apps/packages, workspaces). Structural only — hands code-level refactoring to `code-implementation`. SKILL.md + 7 reference files + evals. |
| [`codebase-audit`](./skills/codebase-audit/) | Forensic whole-codebase audit and staged refactor plan — maps the system, verifies features are actually wired end to end, finds duplicated services and copy-pasted modules, band-aid fixes, dead code, and legacy-vs-new implementations living side by side. Emits a numbered report set. SKILL.md + 4 reference files + evals. |

(More skills planned — `react-frontend-guidelines`, etc.)

## Benchmarks & production evidence

- **Mobile skills (real production app case study):** Distilled from shipping a 39-screen Expo app (AI chat, subscriptions, two languages, phone + tablet) through 4 App Store rejections, 21 PRs, and 165 tagged prompts — moving store compliance, release builds, and verification harnesses into Day 0/1 rather than post-build retrofits.
- **Weekly Expo SDK canary:** [`.github/workflows/expo-starter-canary.yml`](./.github/workflows/expo-starter-canary.yml) builds the starter on `latest` Expo SDK every week across `none`, `auth`, and `all` module matrices (typecheck, lint, unit tests, iOS + Android bundle export, and contract smoke test).
- **Backend coverage benchmark (`nestjs-dev-guidelines`):** Evaluated statically against three production NestJS 10/11 microservices (covering BullMQ, webhooks, SSE streaming, file uploads, multi-tenancy, and mixed validation/logging conventions), scoring **94.4–94.9 / 100** feature readiness compared to **57.3–58.0 / 100** for generic baseline checklists.
- **Deterministic evals & cross-OS CI:** **107 built-in evals** across all 8 skills plus [`.github/workflows/validate.yml`](./.github/workflows/validate.yml) running validation and starter script tests across Ubuntu, macOS, and Windows.

## Build a React Native app with an AI agent — FAQ

**How do I build a React Native app with an AI coding agent?**
Install `react-native-expo-app-builder`, give the agent your design (a Figma export or screenshots) and your API (an OpenAPI file or docs), and ask it to build the app. It reads everything, sends back one short message with the few decisions that are expensive to reverse (each with a recommendation), creates the project with `create-expo-app@latest`, adds the tested starter (`AGENTS.md` + `CLAUDE.md`), verifies your API with a smoke script, and builds feature slices that it tests itself on both platforms.

**Do I get code my app doesn't need?**
No. Every app gets the core (what every app needs) and only the modules its brief calls for — an app without accounts gets no sign-in code, an app without AI gets no consent sheet. `create-app.mjs --list` shows each module and when it is worth it; `add-module.mjs` adds one later and regenerates what depends on it. Modules plug in through one registry, so none of them edits a core file, and a feature or custom `lang-<code>` language module of your own follows the same shape.

**Won't code inside a skill go out of date?**
The parts that would are kept out of it. The core is mostly plain TypeScript with unit tests; vendor-heavy features (push, purchases, social sign-in, crash reporting, OTA, analytics) are recipes the agent writes from the current docs; and a weekly CI canary in this repository builds the starter on `latest` Expo SDK, so a breaking change is found within days and fixed once for every future app.

**Which Expo SDK and library versions does it use?**
Whatever is `latest` on the day it runs. The skill pins no versions: `create-expo-app@latest`, `npx expo install` for every library (so versions match the SDK), CLIs as `npx <tool>@latest`, and the versions it ended up with are written into the project brief.

**Can the agent test the app by itself instead of me?**
Yes. Maestro taps through the iOS simulator and the Android emulator against release builds and a local mock API; a QA tour screenshots every route; a hardening matrix covers tablets, the keyboard on Android, tall scripts, RTL/text expansion, offline, token expiry, deep links and permissions. "Done" means seen running on every target, with evidence.

**How do I fix an App Store or Google Play rejection with an AI agent?**
Paste the reviewer's whole message. `app-store-play-store-submission` runs a rejection protocol: the cause in the app and in the process, the same problem found everywhere else, the fix with evidence, a reply for the reviewer, and a new audit check so it does not happen again.

## Install

### 1. Via `skills` CLI (recommended — Claude Code, Cursor, Codex, Antigravity, OpenCode, etc.)

```bash
npx skills add myatminlu/vector-skills
```

### 2. Via Ecosystem Plugin Manifests

- **Claude Code Plugin Marketplace:**
  ```text
  /plugin marketplace add myatminlu/vector-skills
  /plugin install vector-skills@vector-skills
  ```
- **Antigravity / Cursor:** Repository ships native [`.antigravity-plugin/plugin.json`](./.antigravity-plugin/plugin.json) and [`.cursor-plugin/plugin.json`](./.cursor-plugin/plugin.json) manifests.

### 3. Standalone Expo Starter CLI (no agent required)

```bash
npx github:myatminlu/vector-skills ./my-app --modules=auth,guest --name="My App" --bundle-id=com.acme.myapp
```

### 4. Manual symlink

```bash
git clone https://github.com/myatminlu/vector-skills.git <local-path>/vector-skills
ln -s <local-path>/vector-skills/skills/nestjs-dev-guidelines ~/.claude/skills/nestjs-dev-guidelines
```

## Updating

```bash
npx skills update
```

## Validation, authoring & evals

Run repository-wide validation and starter unit tests (`npm run check`) before committing:

```bash
python3 scripts/validate-skills.py --sync   # sync shared scripts/assets & validate all skills, manifests, and links
npm run check                               # runs validate-skills.py + node --test tests/starter-scripts.test.mjs
```

### Authoring conventions

- Keep `SKILL.md` scannable (≤ 500 lines). Deep dives go in `references/`.
- Each reference file: TL;DR → rules (good/bad code) → anti-patterns → review checklist.
- Write `description` in the frontmatter so agents trigger the skill reliably (concrete keywords + "use when X" framing). Stay **≤ 980 characters** (safe margin under the 1,024-character limit).
- Add `evals/evals.json` with 5–10 substantive test tasks (`must_include`, optional `must_not_include` and `must_match_regex`).
- See [CONTRIBUTING.md](./CONTRIBUTING.md) for full guidelines.

### Running evals

Each skill ships `evals/evals.json` and a unified deterministic grader. Run the prompts against an agent with the skill loaded, save the replies as JSON (`[{ "id": N, "response": "..." }]`), then grade from file or stdin (`-`):

```bash
python3 skills/<skill>/evals/scripts/grade.py responses.json
python3 skills/<skill>/evals/scripts/grade.py - < responses.json --threshold 0.8
```

## Author

Built and maintained by **Myat Min Lu** — a developer curating a personal collection of agent skills distilled from day-to-day engineering work. Each skill captures the conventions, rules, and hard-won lessons worth teaching an agent once so they don't have to be re-explained every session.

- GitHub: [@myatminlu](https://github.com/myatminlu)
- Contact: myatminlu@myvectorai.com

Contributions, forks, and feedback are welcome.

## License

MIT — feel free to fork and adapt.
