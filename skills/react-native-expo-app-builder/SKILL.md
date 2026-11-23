---
name: react-native-expo-app-builder
description: Build a production-ready React Native mobile app with Expo for iOS and Android from a design (Figma, screenshots) and an API (OpenAPI or docs). Creates the project on the latest Expo SDK with a tested core plus only the modules the app needs (auth, guest mode, AI consent, SSE streaming, uploads, remote config, offline cache, text size, Burmese, tabs) and Maestro e2e tests. Covers intake, architecture, folder structure, layers and build order. Use when the user starts a new React Native or Expo app, hands over a design or API docs to build from, asks for an app's architecture, folder structure or boilerplate, asks what an AI agent needs to build a whole app in one go, splits a new app build across agents or Conductor workspaces, wants a CLAUDE.md or project brief, or wants Maestro tests. Use it even for "just scaffold the screens". Not for Flutter or one bug in an existing app.
---

# React Native Expo App Builder

You are the tech lead of a mobile app that does not exist yet. Someone has handed you a design and an API and asked
you to build it in **Expo (React Native)** for iOS and Android. Building the screens is the part you are already good
at. This skill is about everything else that decides whether the app reaches the stores without a human acting as your
tester, your memory and your release manager.

## What you can do with this skill

- **Start a new app in one command** — `scripts/create-app.mjs` runs `create-expo-app@latest` and adds a tested core
  plus only the modules the app needs. Nothing is pinned; it prints the versions it installed.
- **Add a feature module later** — `scripts/add-module.mjs` installs it, regenerates what depends on it, reruns the checks.
- **Turn a design + API into a plan with one short message** — screen inventory, the decisions that are expensive to
  reverse (each with a recommendation), backend requests and the human's store tasks, on day one.
- **Verify the API before building on it** — OpenAPI-first contract, smoke script, one gap report.
- **Get an architecture that survives store review** — layers, one API client, gates every route passes through.
- **Build slices in parallel workspaces**, each verified on both platforms.
- **Test the app yourself** — Maestro on the iOS simulator and the Android emulator, a QA screenshot tour, a hardening matrix.
- **Hand over a repo another agent can continue** — `CLAUDE.md`, brief, screen inventory, human-task list.
- **Ship it** with the companion skill `app-store-play-store-submission` (audit, release builds, rejections).

## Quick start

```bash
node <this skill>/scripts/create-app.mjs --list                       # the modules, and when each is worth it
node <this skill>/scripts/create-app.mjs ../my-app --modules auth,guest,streaming --name "My App" --bundle-id com.acme.myapp
node <this skill>/scripts/add-module.mjs ../my-app remote-config      # later
```

Run them with the tool sandbox off (network, package cache). Output is about twenty lines; full logs go to a temp file.

## Core, modules, recipes

| Layer | What | When it goes stale |
|---|---|---|
| **Core** (always) | config + build guards, API client (refresh, 401 policy, scheduler, typed errors), server state, offline banner, text/screen primitives, English + parity test, navigation shell, extension points, QA tour, Maestro, mock API, smoke script, CI | Rarely — mostly plain TypeScript with tests |
| **Modules** (pick) | `auth` · `guest` (needs auth) · `ai-consent` (needs auth) · `streaming` · `uploads` · `remote-config` · `offline-cache` · `text-size` · `lang-my` · `tabs` | Their library glue can; a weekly canary in the skill repo builds all of them on the latest SDK |
| **Recipes** (instructions) | push, in-app purchase, social sign-in, crash reporting, OTA updates, analytics — `references/09-recipes.md` | Never: written at the time from the vendor's current docs |

Pick modules from the brief in Phase 0 — accounts → `auth`; public content → `guest`; personal data to a third-party
AI → `ai-consent`; an AI chat or live feed → `streaming`; file pickers → `uploads`; something to switch off between
releases → `remote-config`; reading offline → `offline-cache`; small type or older users → `text-size`; Burmese or
another tall script → `lang-my`; two or more top-level areas → `tabs`. Modules plug in through `registerModule`
(`src/modules/slots.ts`); none edits a core file, and a feature of the app's own is just another module folder.
Details: `references/05-build-order.md` §0.

## Always the latest versions

This skill never pins a version, and neither should you. "Latest" is resolved when the skill runs.

- **Expo SDK:** `npm view expo dist-tags` → `latest`. New projects come from `create-expo-app@latest`; every Expo or
  React Native library goes in with `npx expo install <pkg>`; upgrades move the whole SDK (`npx expo install
  expo@latest && npx expo install --fix`), never one package.
- **Tools:** CLIs as `npx <tool>@latest`; Maestro and JDKs from their current releases; GitHub Actions at their current
  major (the starter's Dependabot keeps them there).
- **Knowledge:** the SDK's changelog and upgrade notes (https://expo.dev/changelog), the `AGENTS.md` that
  `create-expo-app` writes, Expo's official skills (`npx skills add expo/skills`) and the versioned docs
  (https://docs.expo.dev) beat memory — your training data describes an older SDK.
- **Record what "latest" meant** in `docs/PROJECT_BRIEF.md`. When the latest breaks something, fix forward; pin one
  package back only when it is genuinely incompatible, with a dated comment, the issue link and a task to undo it.
  `references/07-expo-react-native.md` §0 lists what to check on every new SDK.

## Why the process matters

In the project this skill comes from, a 39-screen design and an API reference became a working app in **one approved
turn** — and getting it approved in the stores then took **165 prompts, 21 PRs and four App Review rejections in 25
days**. Most of those prompts were a human supplying an input nobody had asked for, acting as the tester, walking store
consoles, or asking for the root cause twice. So a design and an API are two of **seven input packs** — product
decisions, design, API contract + test account, identity and environment, platform scope and device matrix, store and
legal, working agreement — and "done" means *approved in the stores*. `references/00-evidence-and-gaps.md` has the
analysis; `references/01-intake.md` the packs item by item.

**Read only what the current phase needs**, and **speak plainly to the human**: "Phase 2", "packs" and "gates" are this
skill's words, not theirs. Keep messages short — details go in files they can open.

---

## Operating rules

- **Ask once, early, in one batch.** Phase 0 ends with one short kickoff message carrying the few expensive decisions,
  each with a recommended default. After the reply, decide routine details yourself and record them.
- **Expo only.** If the team has chosen Flutter or fully native code, say this skill does not cover it.
- **Never build on an inferred identity or policy.** Team ids, bundle ids, account types, the app's category, payment
  policy and legal URLs are facts about the owner. Propose a value and wait for a yes; never use a guess silently.
- **Docs are claims; the live API is the contract.** Prefer an OpenAPI file the backend regenerates in CI; probe every
  endpoint with the QA account before building on it.
- **You are the tester.** Nothing is done until you have watched it run on every target in the device matrix, with
  evidence. Maestro taps both the iOS simulator and the Android emulator; if you cannot see or tap a target, restoring
  that is the next task, not a caveat.
- **A release build is a different program.** Make one in Phase 1; run the e2e flows against release builds.
- **Root cause and same-pattern sweep by default.** A symptom reported twice means the first fix was a patch.
- **Policies are gates, built once.** "Needs an account", "needs consent", "needs a plan" and remote switches are
  modules every screen passes through, not conditionals added per screen.
- **Generated native projects are output.** Change app config and config plugins, never `ios/` or `android/` by hand.
- **Latest versions, resolved at use time** (above). Never copy a version number from this skill, memory or another project.
- **Secrets never enter chat, the repo, memory or logs.** Ask for the environment variable's *name*. If one is pasted
  anyway, say it now sits in the transcript and should be changed; on a personal account, look and do not send.
- **Do everything you can yourself; hand over only what needs the human**, with exact steps and lead times, on day one.
- **One concern per workspace and PR; commit as you go; never build a release from unmerged code.**
- **Report what you verified, on which target, and what you could not.**

---

## Phase 0 — Intake: close the input gaps

Read `references/01-intake.md` (self-contained, store rules included). Templates: `assets/PROJECT_BRIEF.template.md`,
`assets/CLAUDE.template.md`, `assets/HUMAN_TASKS.template.md`.

1. Read **everything** you were given. If an attachment the message mentions did not arrive, say so first.
2. Build the **screen inventory** (screen → data and actions → endpoint → who may see it); its gaps are findings.
3. Sort each missing item: **blocking** (API address, test account, bundle id, team id) · **expensive to reverse**
   (navigation, guest access, payment channel, tablet — ask) · **assumed** (state it) · **confirm before use**
   (category, age rating, legal URLs) · **human task** (console and legal work — starts today).
4. **Choose the modules** the brief implies (above) and note them in the brief as decisions.
5. Write `docs/PROJECT_BRIEF.md`, `docs/SCREENS.md`, `docs/API_REQUESTS.md` (including an OpenAPI export if there is
   none), `docs/HUMAN_TASKS.md` and `CLAUDE.md` — **before** the message, open decisions marked *proposed*.
6. Send **one short kickoff message**: findings in a few lines; the expensive decisions with options, a recommendation
   and what changing later touches; the blocking items; the longest-lead human tasks; a reply template.

**Exit when** the expensive decisions are answered ("all recommended" counts), the blocking items are in hand, and the
task list and API requests are delivered. If the human waves the questions away, take every recommendation and record
it as defaulted.

## Phase 1 — Verify the contract, prove the toolchain

Read `references/02-api-contract.md`.

1. **Get the contract as a file** (OpenAPI, regenerated in CI); generate types with `npm run api:types`.
2. Run the **contract smoke script** (`npm run api:smoke -- --spec <file>`) against the real API with the QA account.
3. Send **one contract gap report**; agree a fallback per gap (ship a fallback, hide behind a switch, or cut).
4. **Prove every target with the new app**: debug build on an iOS simulator and an Android emulator, one **release**
   build installed and launched, secure storage, screenshots, deep links and **Maestro taps** on each platform.
5. Record the toolchain facts (the versions `create-app.mjs` printed, JDK, Xcode, simulator ids) in the brief and `CLAUDE.md`.

**Exit when** the first slices' endpoints have verified shapes and the app builds, launches and can be driven on every
target, in release configuration at least once. No API yet? Use the starter's mock API (`npm run mock-api`) behind the
real interface and mark those domains unverified.

## Phase 2 — Foundation (one agent, serial)

Read `references/04-architecture.md` and `references/07-expo-react-native.md`.

Run `scripts/create-app.mjs` with the modules from Phase 0 — that is this whole phase, already built and tested
(`references/05-build-order.md` §0). Set the identity, keep the gates, primitives and harness, and replace the example
screens as slices land. For an existing repo, take the pieces from `assets/starter/core/` and the module folders in the
order config → primitives → localisation → API client → storage → session and guards → gates → navigation → harness → CI.

**Exit when** each session state the app has (signed out, guest, signed in) lands on the right stack on both platforms,
the Maestro flows pass on both, and the QA tour produces a screenshot per route.

## Phase 3 — Walking skeleton and on-device sign-off

Read `references/03-design.md`. Build sign-in → shell → **the one flow that is the product** end to end against the
real API; capture a contact sheet (iPhone, Android phone, tablet; every language; large text; keyboard up) and get the
navigation paradigm, component feel, type size, default language and core interaction signed off. **Only then fan out.**

## Phase 4 — Feature slices

Read `references/05-build-order.md`. One vertical slice = API module + types + data hooks + screens + all states +
strings in every language + route + gate wiring + QA tour step + a Maestro flow + tests for the pure logic. A feature
with cross-cutting reach becomes a module (`registerModule`); a vendor-heavy one starts from `references/09-recipes.md`.

## Phase 5 — Hardening matrix

Read `references/06-verification.md`. Tablet and split view, keyboard on both platforms, the tallest script at the
largest text size, offline and reconnect, token expiry, cold-start deep links, permission denied, every upload type,
account switch, guest → sign-in, fresh install. **Exit when** every cell is pass, fixed, or an accepted limitation.

## Phases 6–8 — Store audit, release, review

Load **app-store-play-store-submission**: the audit, version numbers, release builds and their launch test, hand-over,
and the rejection protocol.

---

## Human checkpoints

1. **Decisions** (end of Phase 0) — the kickoff message. 2. **On-device look and feel** (end of Phase 3) — the contact
sheet. 3. **Release** (submission skill) — numbers, audit, accepted risks. Everywhere else: proceed, then report — with
short progress notes on long turns and a commit at each working step.

## Definition of done

A slice is done when it runs on an iOS phone and an Android phone (and new layouts at tablet width) and you looked at
each; its main path is a Maestro flow passing on both against a release build; loading, empty, error and offline states
exist and were triggered; every string exists in every language without clipping; typecheck, lint, tests and both
production bundles pass; its routes are in the QA tour and deep-linkable; the report shows screenshots and names what
was not verified.

## Anti-patterns to refuse

| Anti-pattern | Do this instead |
|---|---|
| Starting screens the moment a design and API arrive | Phase 0; the missing packs cost more than the screens |
| Installing every module "just in case" | Only what the brief needs; add the rest later with `add-module.mjs` |
| Copying a version number from memory, a tutorial or this skill | Resolve `latest` now; `npx expo install` for every library |
| Questions one at a time, or a first reply that takes ten minutes to read | One short kickoff message; the rest in files |
| Guessing a team id, bundle id, category or legal URL | Ask; record it in the brief with the date |
| Trusting the API doc for a response shape | OpenAPI + smoke script; normalise at the boundary; report the gap |
| "Works on the iOS simulator" as done, or asking the human to tap through | Maestro on both platforms; Android and tablet are separate targets |
| Patching a symptom that came back | Root cause plus same-pattern sweep; name the earlier patch |
| A login / consent / paywall check added screen by screen | A module every route passes through |
| Editing `ios/` or `android/`, or a core file, to add a feature | Config plugin / app config; a module with `registerModule` |
| Leaving store work until the app "is finished" | Human-task list on day one; the submission skill before every upload |

## Stop and ask the user when

A decision is expensive to reverse and the brief does not cover it; the live API contradicts the docs in a way that
changes a feature; a store rule and a product decision conflict; an action is irreversible or outward-facing (merging,
uploading, deleting, rotating credentials, replying to a reviewer); you need a credential (ask for the channel, never
the value). Otherwise decide, record it in the brief, and keep going.

## Entering mid-way

If the app exists and the request starts later (a workspace that will not build, missing tests, a hardening pass),
start there, but first check the earlier exits — the brief, the QA account, the device matrix, the harness.

## Measuring the next project

When the app ships, count the prompts as the case study did (`references/00-evidence-and-gaps.md` §7;
`assets/conductor/prompt-census.py`). The phase whose category is still large is the one this skill has not fixed yet.

---

## Reference files

- `references/00-evidence-and-gaps.md` — the case study: where 165 prompts went, the eight gaps, what each retrofit cost.
- `references/01-intake.md` — the seven packs, store rules that become day-one decisions, the kickoff message.
- `references/02-api-contract.md` — OpenAPI first, contract checklist, smoke script, gap report, mock API.
- `references/03-design.md` — design hand-off, screen inventory, states designs never draw, on-device sign-off.
- `references/04-architecture.md` — layers, folder structure, the designs worth copying, system-design decisions.
- `references/05-build-order.md` — core, modules and recipes; `create-app.mjs` and `add-module.mjs`; slices; parallel workspaces.
- `references/06-verification.md` — verification ladder, device matrix, Maestro on both platforms, hardening matrix.
- `references/07-expo-react-native.md` — staying on the latest SDK, then field notes (symptom → cause → rule).
- `references/08-prompts.md` — prompt templates for the human, and the messages the agent sends back.
- `references/09-recipes.md` — push, purchases, social sign-in, crash reporting, OTA updates, analytics.

Scripts and assets: `scripts/create-app.mjs`, `scripts/add-module.mjs` (shared code in `scripts/lib/`);
`assets/starter/core/` and `assets/starter/modules/<name>/` (each with `module.json`); the brief, CLAUDE and
human-task templates in `assets/`; `assets/conductor/` (`settings.toml`, `setup.sh`, `prompt-census.py`).
