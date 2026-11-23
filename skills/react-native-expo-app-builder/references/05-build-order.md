# Build order — phases, slices and working in parallel (Phases 2–5)

## Contents

0. The starter: core, modules and recipes
1. Phase exits at a glance
2. Why this order
3. The slice template
4. Ordering slices
5. Parallel workspaces
6. Workspace bootstrap
7. Commits, PRs and merges
8. Long turns and session limits
9. Changes that arrive mid-build
10. Choosing effort

---

## 0. The starter: core, modules and recipes

Phase 2 has been built once already, from the case-study app's foundation, and split three ways:

| Layer | What | Where | Goes stale? |
|---|---|---|---|
| **Core** | What every app needs: config and build guards, the API client (refresh, 401 policy, scheduler, typed errors), server state, connectivity and offline banner, text/screen primitives, English with a parity test, navigation shell, the extension points, QA tour, Maestro, mock API, smoke script, CI | `assets/starter/core/` | Rarely — most of it is plain TypeScript with tests |
| **Modules** | Opt-in features: `auth`, `guest`, `ai-consent`, `streaming`, `uploads`, `remote-config`, `offline-cache`, `text-size`, `lang-my`, `tabs` — each with its code, strings, tests, mock endpoints, smoke checks, Maestro flow and docs rows | `assets/starter/modules/<name>/` | Their library glue can; the weekly canary catches it |
| **Recipes** | Features whose vendor SDK changes too often for code to stay right: push, purchases, social sign-in, crash reporting, OTA updates, analytics | `references/09-recipes.md` | No — written at the time from current docs |

**Choose the modules in Phase 0**, from the brief: accounts → `auth`; any public content → `guest`; personal data to
a third-party AI → `ai-consent`; an AI chat or live feed → `streaming`; file pickers → `uploads`; anything to switch
off between releases → `remote-config`; reading offline → `offline-cache`; small type or older users → `text-size`;
Burmese (or another tall script, by copying it) → `lang-my`; two or more top-level areas → `tabs`. Required modules come
along (guest and ai-consent need auth). `node scripts/create-app.mjs --list` prints the catalog with a "when" per module.

```bash
node <skill>/scripts/create-app.mjs <app-dir> --modules auth,guest,ai-consent,streaming --name "My App" --bundle-id com.acme.myapp
node <skill>/scripts/add-module.mjs <app-dir> remote-config     # later; regenerates and rechecks
```

What `create-app.mjs` does (it stops with a clear message at the first failure; fix the cause and rerun with
`--existing --force`):

1. `npx create-expo-app@latest <app-dir> --yes` — so every app starts on the SDK that is current that day.
2. Removes the template's example code and unused images; copies the core and the chosen modules; adds
   `docs/PROJECT_BRIEF.md` and `docs/HUMAN_TASKS.md` (and `.conductor/` with `--conductor`).
3. Writes `modules.json` and generates from it `src/modules/index.ts` (registers the modules), `src/modules/strings.ts`
   (their strings and languages), `.maestro/config.yaml`, and the module sections of `docs/SCREENS.md`,
   `docs/DATA_INVENTORY.md`, `CLAUDE.md` and `README.md`; merges each module's endpoints into `docs/openapi.json`.
4. Patches `app.json` (name, slug, scheme, bundle id, build numbers, tablet support, config plugins, `extra.legal`),
   `tsconfig.json`, `.gitignore` and the package scripts; creates `.env`; points each GitHub Action at its current major.
5. `npx expo install` for the core's and the modules' libraries (versions follow the SDK); lint tooling the same way;
   `tsx` and `@types/node` at their latest release; generates the API types.
6. Runs the unit tests, typecheck and lint, and prints the versions it ended up with — record them in the brief.

It prints about twenty lines; every command's full output goes to a log file in the temp directory (its path is
printed). `--verbose` streams everything.

**How modules plug in.** The core exposes extension points in `src/modules/slots.ts`; each module's `index.ts` calls
`registerModule({...})` with what it adds — a provider, overrides (`useRootGate`, `useSessionUser`, `useRequireAccount`,
`withConsent`, `useFlag`, `useTextScale`), and contributions (account sections, item and home actions, stack screens,
tour steps, fonts, text scripts). No module edits a core file, so a module can be added or left out freely, and a
feature of the app's own is just another module folder.

**How it was verified:** apps with no module, with `auth`, and with all ten were each created from
`create-expo-app@latest` and passed typecheck, lint and the unit tests, both production bundles, and the contract smoke
against the mock API (with shape checks against the merged spec); `add-module` added `guest` (and with it `auth`) to the
core-only app and its checks passed. The all-modules app was built for an iOS simulator (Release) and an Android
emulator (release APK, R8 on), and every Maestro flow passed on both. Treat that as evidence about the SDK that was
current then; on a newer SDK the same checks run as part of `create-app.mjs`.

**When today's SDK breaks the starter** (a moved import, a renamed option, a type error at step 6): read the SDK's
changelog and upgrade notes, fix the code forward in the new app, and keep going — never install an older SDK to make
the starter compile. If the fix is general, it belongs in this skill's `assets/starter/` too; say so in the report.

**How to adopt it:**

1. Set the identity in `app.json` if the script ran with placeholders (name, slug, scheme, bundle id, package,
   `extra.legal`) — store builds refuse to start until you do — and the colours and type in `src/constants/theme.ts`.
2. Point `EXPO_PUBLIC_API_URL` at the real API, or keep the mock while the API is not ready; generate
   `src/types/openapi.d.ts` from the backend's spec and update the core's and modules' `types.ts`.
3. Replace the example screens (home list, item) with the app's; keep the gates, primitives and harness, and update the
   QA tour, the Maestro flows and `docs/SCREENS.md` as you go.
4. Run the exit test of Phase 2 on both platforms before the walking skeleton.

---

## 1. Phase exits at a glance

| Phase | Produces | Exit test | The human |
|---|---|---|---|
| 0 Intake | Brief, screen inventory, API requests, human-task list, `CLAUDE.md`, one short kickoff message | Expensive decisions answered or defaulted; blocking items in hand | **Checkpoint 1** |
| 1 Contract and toolchain | Smoke script, gap report, an empty app on every target, one release build | Shapes verified for the first slices; the release build launches | Answers the gaps |
| 2 Foundation | Layers, gates, harness, CI, bootstrap | Signed-out, guest and signed-in each land correctly on both platforms; the tour photographs every route | — |
| 3 Walking skeleton | Sign-in → shell → core flow on the real API | Contact sheet approved | **Checkpoint 2** |
| 4 Slices | The features | Slice definition of done | Review rounds |
| 5 Hardening | Matrix report | Every cell passes, is fixed, or is accepted | Accepts limitations |
| 6 Audit | Audit report | No unaccepted FAIL | Accepts risks |
| 7 Release | Artifacts and hand-over | Launch test passes; artifacts verified | **Checkpoint 3**, uploads |
| 8 After submission | Fix and reviewer reply | — | Pastes the reviewer's message |

## 2. Why this order

The case-study project built the screens first and met everything else afterwards, each thing at the moment it blocked. This order moves forward whatever is cheap now and expensive later:

- **Inputs before code** — a missing decision costs one question now and a retrofit later.
- **A release build while the app is still empty** — env inlining, signing identity, toolchain versions and secure storage all failed on the case-study project during its first nine days, each time with a full app in the way. With an empty app each is a few minutes.
- **Gates and layout rules before features** — they touch every screen.
- **The harness before features** — so each slice is verified as it lands, not reported by a human a week later.
- **The shell approved before the fan-out** — so a change of navigation costs three screens, not forty.

None of this slows the build. The rebuild to the design on the case-study project took one day; the rest of the month went to what this order front-loads.

## 3. The slice template

```
Slice: <name>                      Gate: public | account | consent | plan
Screens: <inventory numbers>       Endpoints: <verified in the smoke run? y/n>

1. API module and types (a normaliser if the shape is unstable) — unit tests
2. Data hooks: queries, mutations, keys, optimistic updates where the action is a toggle
3. Components and screens, composed from primitives — loading, empty, error, offline
4. Strings in every language
5. Routes, typed builders, deep link, gate wrapper
6. QA tour step(s)
7. Verify on the device matrix; capture the evidence
8. Commit, PR
```

The definition of done is in `SKILL.md`. The two items most often skipped are the ones a human then reports: step 3's unhappy states, and step 7 on Android and on a tablet.

## 4. Ordering slices

1. **What others depend on** — auth, profile, onboarding.
2. **The core flow** — already built in Phase 3.
3. **Anything with a native module or store setup behind it** — uploads, streaming, purchases, push, sign-in providers. They carry the most unknowns and the longest human lead times, and a new native module means rebuilding the development client on every simulator. Batch native dependencies early; after that, pure JavaScript slices load in seconds without a rebuild.
4. **Content and reading features.**
5. **Settings, legal and support** — account deletion, privacy and terms links, help, consent review. Do not leave them for last: they are exactly what a reviewer opens.

## 5. Parallel workspaces

**From day one**, beside the main build:

- a **release-helper** workspace for console questions, so "what do I click next?" screenshots never land in a feature branch;
- store preparation — listing text, screenshot plan, drafts of the privacy-form answers.

**After the on-device sign-off (Phase 3)**:

- independent feature slices (different feature folders);
- harness improvements.

**Always serial, one agent at a time:**

- the foundation primitives, the gates and the navigation shell — they keep **one owner** during the fan-out; a slice that needs a change there asks for it in a small PR of its own instead of editing it in passing;
- native dependency changes;
- release builds.

Rules:

- **A device per agent.** Two agents driving the same simulator or emulator overwrite each other's state and screenshots. Give each workspace its own simulator and emulator instance, or take turns, and its own dev-server port.

- **One concern per workspace.** One workspace on the case-study project began as a single API guide and ended with twelve PRs, two keyboard fixes, release signing and about twenty console questions.
- **Agree on the hotspot files** before fanning out (`04-architecture.md`, section 6).
- **Small PRs, a merge order, rebase before verifying.**
- **Never merge a PR an active workspace is still building on.**
- **Shared simulators hold the human's sessions.** Automated runs use spare devices; look, do not send, on a device someone is signed into.

## 6. Workspace bootstrap

A new worktree starts without dependencies and without git-ignored files. If that is not automatic, the first symptom is a mysterious UI difference rather than an error — on the case-study project, sign-in buttons that looked deleted.

- **`.env.example` lists every key** the config module reads, with public values filled in.
- The real `.env` lives in the repository's root directory (git-ignored) and is **copied into every new workspace** by the tool's files-to-copy setting. Pin that setting in the repo (`assets/conductor/settings.toml`) so a changed default cannot silently drop it.
- A **setup script** installs dependencies and **fails loudly** when `.env` is missing or lacks a key that `.env.example` has (`assets/conductor/setup.sh`).
- `CLAUDE.md` records which commands need the tool sandbox off or network access, which ports dev servers may use, and which simulators are the human's.

Conductor specifics, as documented when this was written — check them against the current docs:

- Files to copy are resolved in this order: a `.worktreeinclude` file at the repository root, then `file_include_globs` in the repository settings, then the built-in `.env*` default. A `file_include_globs` list **replaces** the default, so list `.env*` in it.
- The Mac app reads the shared `.conductor/settings.toml` from the **default branch on the remote**: a change does nothing until it is merged.
- Setup scripts run from the workspace directory in a non-interactive shell; each local workspace gets ten ports starting at `CONDUCTOR_PORT`, and `CONDUCTOR_ROOT_PATH` points at the repository's root directory.

Test the bootstrap by creating a fresh workspace and building a release from it. That is the only test that counts.

## 7. Commits, PRs and merges

- **Commit at every working step**, with a message that states the behaviour ("Lift composers above the keyboard on Android"), not the activity ("fix keyboard").
- **One PR per concern.** The body says what changed, why (the root cause), how it was verified (targets and evidence), what was not verified, and the risks.
- **Open the PR when the slice is verified** if the working agreement says so — the human should not have to type "create PR".
- **Merge only with a go-ahead** unless merging has been delegated. After a merge, sync before building anything.
- **Know which CI red is known** and say so in the PR; never fold unrelated dependency bumps into a release PR to turn a check green.

## 8. Long turns and session limits

The largest turns on the case-study project were cut off seven times, each needing a "continue", and twice the human asked whether the agent was still working.

- Shape work so there is **a commit every twenty to thirty minutes**. An interrupted turn then leaves finished slices, not a half-edited tree.
- Keep a short **state-of-work note** (in the PR description or the workspace's scratch folder): done, in progress, next. "Continue" should have something to continue from.
- **Verify per slice**, not once at the end of a marathon.
- Run long builds in the background and **post progress notes** while they run.

## 9. Changes that arrive mid-build

New API guides, design tweaks and customer feedback will arrive while slices are in flight. Each is a slice: contract-check, build, verify, PR. If a change overturns a decision in the brief, update the brief with the date — the next agent reads the brief, not the chat.

When the same request comes back a second time, treat it as evidence that the first change was a patch (`SKILL.md`, operating rules).

## 10. Choosing effort

Observed on the case-study project: "can you run the iOS app" at maximum effort took 227 tool calls and an hour and a half; a store-preparation Q&A session at maximum effort took two and a half hours and produced no PR; a three-point rejection fixed in one turn at maximum effort was worth every minute.

| Work | Effort |
|---|---|
| Run, build, restart, answer a question | Default |
| A feature slice from a clear spec | Default to high |
| Foundation, an audit, a cross-cutting fix, a rejection | High to maximum |

Suggest the level when you can see a mismatch; the human chooses it.
