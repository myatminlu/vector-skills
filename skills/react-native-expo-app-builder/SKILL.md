---
name: react-native-expo-app-builder
description: Build a production-ready React Native mobile app with Expo for iOS and Android from a design (Figma, screenshots) and an API (OpenAPI or docs), with few human round-trips. Creates the project on the latest Expo SDK and adds a tested starter (API client with token refresh and SSE streaming, guest mode, AI-consent gate, i18n, tablet layout, mock API, OpenAPI types, Maestro e2e tests). Covers intake, architecture, folder structure, layers, system design and build order. Use whenever the user starts a new React Native or Expo app, hands over a design export or API docs to build from, asks for an app's architecture, folder structure or boilerplate, asks what an AI agent needs to build a whole app in one go, splits a new app build across parallel agents or Conductor workspaces, wants a CLAUDE.md or project brief for an app, or wants Maestro e2e tests. Use it even for "just scaffold the screens". Store submission belongs to app-store-play-store-submission. Not for Flutter or one bug in an existing app.
---

# React Native Expo App Builder

You are the tech lead of a mobile app that does not exist yet. Someone has handed you a design and an API and asked
you to build it — in **Expo (React Native)**, for iOS and Android. Building the screens is the part you are already
good at. This skill is about everything else that decides whether the app reaches the stores without a human acting
as your tester, your memory and your release manager.

## What you can do with this skill

- **Start a new app in one command** — `scripts/create-app.mjs` runs `create-expo-app@latest`, then adds a starter
  that already handles auth and token refresh, guest browsing, AI-consent, offline, tablets, languages, a mock API,
  OpenAPI types and Maestro tests. It prints the versions it installed; nothing is pinned.
- **Turn a design + API into a plan with one short message** — the screen inventory, the decisions that are expensive
  to reverse (each with a recommendation), the backend requests and the human's store tasks, on day one.
- **Verify the API before building on it** — an OpenAPI-first contract, a smoke script against the live API, one gap
  report for the backend.
- **Get a layered architecture and folder structure** that survives store review: one API client, one session
  provider, gates every route passes through, a text primitive and a screen primitive.
- **Build feature slices in parallel workspaces** without merge chaos, each one verified on both platforms.
- **Test the app yourself** — Maestro taps the iOS simulator and the Android emulator; the QA tour photographs every
  route; a hardening matrix replaces the bug reports a human would otherwise send.
- **Hand over a repo another agent can continue**: `CLAUDE.md`, `docs/PROJECT_BRIEF.md`, `docs/SCREENS.md`,
  `docs/HUMAN_TASKS.md`.
- **Go to the stores** with the companion skill `app-store-play-store-submission` (audit, release builds, rejections).

## Quick start

```bash
node <this skill>/scripts/create-app.mjs ../my-app --name "My App" --bundle-id com.acme.myapp   # sandbox off
cd ../my-app && npm run mock-api   # then: npm run ios / npm run android
```

`--existing` applies the starter to a fresh `create-expo-app` project instead; `--conductor` adds the Conductor
workspace bootstrap. `references/05-build-order.md` §0 explains what the starter contains and how to adopt it.

## Always the latest versions

This skill never pins a version, and neither should you. "Latest" is resolved when the skill runs, not when it was
written.

- **Expo SDK:** `npm view expo dist-tags` → use `latest` (not `next` or `canary` unless asked). New projects come
  from `create-expo-app@latest`; every Expo or React Native library goes in with `npx expo install <pkg>` (no version
  — Expo picks the one that matches the SDK); upgrades move the whole SDK (`npx expo install expo@latest && npx expo
  install --fix`), never one package.
- **Tools:** run CLIs as `npx <tool>@latest`; install Maestro and JDKs from their current releases; set each GitHub
  Action to its current major (the starter's Dependabot keeps them there).
- **Knowledge:** read the SDK's changelog and upgrade notes (https://expo.dev/changelog) and the `AGENTS.md` that
  `create-expo-app` writes, and prefer Expo's official skills (`npx skills add expo/skills`) and the versioned docs
  (https://docs.expo.dev) over memory — your training data describes an older SDK.
- **Record what "latest" meant:** the versions in use go into `docs/PROJECT_BRIEF.md` (Pack 4). The field notes in
  `references/07-expo-react-native.md` are symptom → cause → rule; re-check one against the current SDK before
  relying on it.
- **When the latest breaks something,** fix forward with the current docs. Pin a single package back only when it is
  genuinely incompatible — with a dated comment, the issue link, and a task to remove the pin.

## Why the process matters more than the screens

In the project this skill was distilled from, a 39-screen design export plus an API reference became a working app
(auth, onboarding, home, AI chat, library, subscription, profile) in **one approved turn**. Getting that app approved
in the stores then took **165 prompts and 21 PRs, with four App Review rejections in 25 days**. Seven of those prompts
were the kickoff and the go-aheads; the rest were a human supplying an input nobody had asked for, acting as the
tester, walking store consoles one screenshot at a time, or asking for the root cause a second time:

| Share of the 165 prompts | What the human was doing | What removes it |
|---|---|---|
| 31% | Walking store consoles, release steps and rejections | Human-task list on day one (Phase 0); the `app-store-play-store-submission` skill |
| 18% | Being the tester — reporting what a device showed | Verification instruments before features (Phase 2), Maestro flows, device matrix, definition of done |
| 14% | Operating the agent — "continue", "create PR", "run it", "still working?" | Working agreement in `CLAUDE.md` (Phase 0) |
| 11% | Redesigning against the running app | On-device sign-off before fan-out (Phase 3), batched review rounds |
| 9% | Product decisions arriving mid-build | The decisions asked once, in the kickoff message (Phase 0) |
| 8% | Supplying ids, env values, credentials; repairing workspaces | Identity & environment pack, workspace bootstrap (Phases 0–2) |
| 5% | Relaying backend changes between agents | An OpenAPI contract and a handoff protocol (Phase 1) |
| 4% | Saying what to build and approving plans | Nothing — this is the human's job |

So a design and an API are two of **seven input packs**, and "done" means *approved in the stores*, not *renders on my
simulator*. Pull the other five packs and all of the verification forward, so that the human's part shrinks to one
brief, three sign-offs, and the console work only they can do. `references/00-evidence-and-gaps.md` has the full
analysis.

**Read only what the current phase needs.** Each phase names its reference; Phase 0 needs `references/01-intake.md`
and the templates, nothing else. Reading every reference before the first reply costs the human twenty minutes of
silence and buys nothing.

**Speak plainly to the human.** "Phase 2", "packs" and "gates" are this skill's vocabulary, not theirs. Say what you
are doing and what you need, in their words and their language — and keep it short: the median prompt in the case
study was 55 characters, and a person who writes that way will not read a ten-page reply. Details belong in files.

---

## The seven input packs

| # | Pack | Contains | When it was missing (observed) |
|---|---|---|---|
| 1 | Product & decisions | positioning, v1 scope, sign-in and guest policy, monetization per platform, languages, data shared with third parties, copy rules | Login wall rejected under 5.1.1(v) → 62-file retrofit; the app was mis-framed as a health app; the default language was reversed after the first build |
| 2 | Design | every screen, flows, tokens, states, strings, brand assets, reference apps | Navigation paradigm replaced on day 2; one sign-in screen took five prompts in thirty minutes |
| 3 | API contract + QA account | an OpenAPI file, endpoints, shapes, errors, limits, uploads, streaming, a test account | Docs disagreed with the live API; uploads and voice notes failed on first use |
| 4 | Identity & environment | bundle id, team id, OAuth client ids, push ids, `.env`, signing, which checkout is current, toolchain versions | A guessed team id; social sign-in buttons "disappeared" three times because of a stale `.env` |
| 5 | Platform scope & device matrix | OS versions, phone/tablet, orientation, text scaling, the real devices people hold | iPad layout retrofit (51 files); an Android keyboard bug invisible on iOS-only runs |
| 6 | Store, legal & release | accounts, agreements, product ids, privacy/terms URLs, review demo account, release channel, version policy | Four rejections; about 35 "what do I click next?" prompts |
| 7 | Working agreement | report language, approval gates, PR policy, who uploads, where artifacts go | The same standing instruction restated in every workspace; "find the root cause" requested six times |

Packs 2 and 3 are what people hand over. Packs 1, 4, 5, 6 and 7 are what you ask for — once, in one batch.

---

## Operating rules

- **Ask once, early, in one batch.** Every missing input costs a round-trip later, at a worse moment. Phase 0 ends
  with one short kickoff message that carries the few expensive decisions, each with a recommended default. After the
  reply, decide routine details yourself and record them.
- **Expo only.** This skill builds Expo (React Native) apps. If the team has already chosen Flutter or fully native
  code, say that this skill does not cover it rather than translating its rules.
- **Never build on an inferred identity or policy.** Team ids, bundle ids, account types, the app's category, payment
  policy and legal URLs are facts about the owner, not about the code. A plausible guess compiles today and fails
  weeks later. Proposing a value and waiting for a yes is fine; silently using it is not.
- **Docs are claims; the live API is the contract.** Prefer an OpenAPI file the backend regenerates in CI; probe every
  endpoint with the QA account before building on it.
- **You are the tester.** Nothing is done until you have watched it run on every target in the device matrix, and the
  report carries the evidence. Drive the app yourself — Maestro taps both the iOS simulator and the Android emulator.
  If you cannot see or tap a target, restoring that ability is the next task, not a caveat in the report.
- **A release build is a different program.** Env inlining, signing, minification, SDK life-cycle rules and missing
  files only show up there. Make one release build in Phase 1; run the e2e flows against release builds.
- **Root cause and same-pattern sweep by default.** The human should never have to ask for it. A symptom reported
  twice means the first fix was a patch: say so and go one level deeper.
- **Policies are gates, built once in the foundation.** "Needs an account", "needs consent", "needs a plan" and remote
  switches are wrappers that every screen passes through, not conditionals added per screen. A gate added later
  touches every route.
- **Generated native projects are output.** Change app config and config plugins, never `ios/` or `android/` by hand.
- **Latest versions, resolved at use time** (above). Never copy a version number from this skill, from memory or from
  another project.
- **Secrets never enter chat, the repo, memory or logs.** Ask for the *name of the environment variable*, never the
  value. If a secret is pasted into chat anyway, say plainly that it now sits in the transcript in plain text and
  should be changed, ask for it again through the environment, and do not run anything that writes with it until you
  know it belongs to a test account — on a personal account, look and do not send.
- **Do everything you can do yourself; hand over only what needs the human** — with exact steps and lead times, on day
  one, so their waiting overlaps your building.
- **One concern per workspace and PR; commit as you go; never build a release from unmerged code.**
- **Report what you verified, on which target, and what you could not.** "Typecheck passes" is not "works on Android".

---

## Phase 0 — Intake: close the input gaps

Read `references/01-intake.md` — it is self-contained for this phase, store rules included. Templates:
`assets/PROJECT_BRIEF.template.md`, `assets/CLAUDE.template.md`, `assets/HUMAN_TASKS.template.md`.

1. Read **everything** you were given: every screen of the design, every endpoint of the API doc, the current repo if
   one exists. If an attachment the message mentions did not arrive, say so before anything else.
2. Build the **screen inventory**: screen → data and actions → endpoint → who may see it. Its gaps are your first
   findings — screens with no endpoint, endpoints with no screen, and things a store rule requires that neither has.
3. Go through the seven packs and sort each missing item:
   - **Blocking** — nothing can be verified without it (API address and a test account, bundle id, team id).
   - **Expensive to reverse** — a default exists, but changing it later touches most screens (navigation, guest
     access, payment channel, tablet). These are the decisions you ask about.
   - **Assumed** — you pick the default, state it, and continue unless vetoed.
   - **Confirm before use** — you may propose it, but it goes into no store form or listing until the owner says yes
     (category, age rating, legal URLs).
   - **Human task** — console and legal work with a lead time; it starts today, in parallel.
4. Write the files: `docs/PROJECT_BRIEF.md` (packs, decisions, assumptions, dates), `docs/SCREENS.md` (the inventory),
   `docs/API_REQUESTS.md` (what the backend must add or fix — including an OpenAPI export if there is none; it has a
   lead time too, so it goes out today), `docs/HUMAN_TASKS.md`, and `CLAUDE.md`. In an empty repository they are the
   first commit. Decisions the code cannot show live there — not in chat, and not only in agent memory. Write them
   **before** you send the message, with unanswered decisions marked *proposed*: they are part of the report, not of
   the build, so "don't start yet" does not apply to them.
5. Send **one short kickoff message**: what you found in a few lines; the handful of decisions that are expensive to
   reverse, each with options, a recommendation and what changing it later touches; the blocking items; the two or
   three human tasks with the longest lead times; a reply template. Everything else stays in the files. If the human
   could not answer it in two minutes, it is too long.

**Exit when:** the expensive decisions are answered ("all recommended" counts), the blocking items are in hand, and the
task list and API requests have been delivered. Do not build features before this — but do not wait on console tasks
either. If the human waves the questions away ("don't overthink it"), take every recommended option, record it as
defaulted, and keep the foundation's gates in place so that the expensive choices stay cheap to flip.

## Phase 1 — Verify the contract, prove the toolchain

Read `references/02-api-contract.md`.

1. **Get the contract as a file.** If the backend can export OpenAPI, ask for it to be regenerated and checked in CI;
   generate the app's types from it (`npm run api:types`, which runs `openapi-typescript@latest`). On the case-study
   backend this one request surfaced endpoints missing from the app's spec, undocumented response shapes, wrong status
   codes and stream events named differently from the docs.
2. Write and run a **contract smoke script** against the real API with the QA account (credentials from the
   environment): every endpoint the app will use, status and response *shape* printed, reversible writes only, and —
   with a spec — the shapes checked against it. The starter ships one (`npm run api:smoke`).
3. Diff reality against the docs and send **one contract gap report** to whoever owns the backend — where the live API
   differs from its reference. (The Phase 0 API requests were about what is *missing*; this is about what is
   *different*.) Agree on a fallback for each gap: ship with a fallback, hide behind a remote switch, or cut.
4. **Prove every target end to end with an empty app**: debug build running on an iOS simulator and an Android
   emulator; one **release** build installed and launched; secure storage working on the simulator; screenshots, deep
   links and **Maestro taps** working on each platform (a two-step flow against the system Settings app proves the
   tooling before any app exists).
5. Record the toolchain facts you discovered (the versions `create-app.mjs` printed, JDK, Xcode, simulator ids, what
   needs the sandbox off) in the brief and `CLAUDE.md`, where the next agent will find them.

**Exit when:** every endpoint the first slices need has a verified shape, and an empty app builds, launches and can be
driven on every target — in release configuration at least once.

**If the API is not reachable yet** ("we'll wire it later"), do the toolchain half now and point the app at the
starter's local mock API, or typed fixtures *behind the API layer*, marked unverified. Screens are then built against
the real interface and wiring the API later replaces modules, not screens. The smoke script runs the day the API
appears.

## Phase 2 — Foundation (one agent, serial)

Read `references/04-architecture.md` and `references/07-expo-react-native.md`.

**Start from the starter.** `scripts/create-app.mjs` creates the project on the latest SDK and applies this whole
phase (`references/05-build-order.md` §0: what it contains, how it was verified, how to adopt it). Set the identity,
replace the example screens as slices land, and go straight to the exit test below. Adding the foundation to an
existing repo instead, take the pieces from `assets/starter/` in this order, each verified before the next:

1. Config module (static env reads, validated at start-up; release builds refuse to bundle without required values;
   store builds refuse template placeholders) — `app.config.js`, `src/config/`.
2. Design tokens and primitives — text, screen, button, field, list row, sheet, loading/empty/error states — plus a
   dev gallery route.
3. Localisation with a key-parity test; typography per script.
4. API client (auth header, single-flight refresh, time-outs, rate-limit scheduling), error model, per-domain
   modules, types generated from the contract; unit tests for the client's rules.
5. Local storage (typed keys) and secure token storage.
6. Session provider and route guards for every session state: signed out, onboarding, signed in — **and guest**, if
   the app has any public content.
7. The gates the product needs: account-required, consent-required, paywall, remote config.
8. Navigation shell, typed route builders, a deep link for every screen.
9. **Verification harness**: QA tour over every route, log markers, Maestro flows with `testID`s on every control they
   touch, a local mock API for e2e runs, the smoke script as a package script.
10. CI (typecheck, lint, unit tests, contract smoke, production bundles for both platforms), Dependabot for workflow
    actions, and workspace bootstrap (`.env.example`, files-to-copy, setup script).

**Exit when:** a signed-out, a guest and a signed-in session each land on the right stack on both platforms, the
Maestro flows pass on both, and the QA tour produces a screenshot per route.

## Phase 3 — Walking skeleton and on-device sign-off

Read `references/03-design.md`.

Build sign-in → shell → **the one flow that is the product** (the chat, the booking, the order) end to end against the
real API. Then capture a contact sheet — iPhone, Android phone, tablet; every language; one large-text frame; one with
the keyboard up — and ask for sign-off on the things that are expensive to change: navigation paradigm, component
feel, type size, default language, the core interaction.

**Exit when:** the human has approved or redirected the shell and the core flow. Only then fan out. This is the
cheapest moment the navigation paradigm will ever have to change.

## Phase 4 — Feature slices

Read `references/05-build-order.md`.

One vertical slice = API module + types + data hooks + screens + all states + strings in every language + route + gate
wiring + QA tour step + a Maestro flow for its main path + tests for the pure logic. Slices that touch different
feature folders can run in parallel workspaces; shared files are the merge hotspots — plan for them. New API docs or
design changes that arrive mid-build are just another slice: contract-check, build, verify, PR.

**Exit when** each slice meets the slice definition of done (below).

## Phase 5 — Hardening matrix

Read `references/06-verification.md`.

Run the whole app through the matrix instead of waiting for a human to trip over each cell: tablet and split view,
keyboard on Android and iOS, the tallest script at the largest text size, offline and reconnect, token expiry and
refresh, cold-start deep links, permission denied, every upload type, account switch, guest → sign-in, fresh install
defaults.

**Exit when:** every cell is pass, fixed, or listed as a known limitation the human has accepted.

## Phases 6–8 — Store audit, release, review

Load the **app-store-play-store-submission** skill: the submission audit, version numbers, release builds and their
launch test, hand-over, and the rejection protocol live there. It applies to this app after launch too.

---

## Human checkpoints

These three are the only planned stops. Everywhere else: proceed, then report.

1. **Decisions** (end of Phase 0) — the kickoff message: the expensive decisions, the assumptions worth a veto, the
   task list.
2. **On-device look and feel** (end of Phase 3) — the contact sheet.
3. **Release** (app-store-play-store-submission) — version numbers, the audit report, the accepted risks.

Long silent turns worry people. On anything longer than a few minutes, post short progress notes, and commit at each
working step so that an interrupted turn leaves finished work behind rather than a half-edited tree.

## Definition of done

**A slice is done when**

- it runs on an iOS phone and an Android phone and you looked at it on each, and every new screen layout was also
  checked at tablet width;
- its main path is a Maestro flow that passes on both platforms against a release build;
- loading, empty, error and offline states exist and were triggered at least once;
- every string exists in every language, and the tallest script is not clipped;
- typecheck, lint and unit tests pass, and both production bundles export;
- its routes are in the QA tour and reachable by deep link;
- the report shows screenshots and names anything not verified.

---

## Anti-patterns to refuse

| Anti-pattern | Do this instead |
|---|---|
| Starting screens the moment a design and API arrive | Run Phase 0; the missing packs cost more than the screens |
| Copying a version number from memory, a tutorial or this skill | Resolve `latest` now; `npx expo install` for every library |
| Asking questions one at a time as they come up | One short kickoff message, every decision with a recommended default |
| A first reply that takes ten minutes to read | Decisions and blockers in the message; everything else in files |
| Guessing a team id, bundle id, category or legal URL | Ask; record it in the brief with the date |
| Trusting the API doc for a response shape | OpenAPI + probe it; normalise at the boundary; report the gap |
| "Works on the iOS simulator" as done | Maestro on both platforms; Android and tablet are separate targets |
| Asking the human to tap through a flow | Write the Maestro flow and run it |
| Reporting a fix without having seen it run | Screenshot or log evidence, or say it is unverified |
| Patching a symptom that came back | Root cause plus same-pattern sweep; name the earlier patch |
| Adding the login / consent / paywall check screen by screen | One gate in the foundation that every route passes through |
| Editing `ios/` or `android/` to make a build pass | Config plugin or app config, then regenerate |
| Telling the human to run a command you could run | Run it; hand over only what truly needs them |
| Leaving store work until the app "is finished" | Human-task list on day one; the submission skill before every upload |
| Taking a password in chat because it is quicker | Env var or keychain; flag rotation if it already happened |

## Stop and ask the user when

- a decision is expensive to reverse and the brief does not cover it (navigation paradigm, auth and guest policy,
  payment channel, data sent to third parties);
- the live API contradicts the docs in a way that changes a feature, or an endpoint the design needs does not exist;
- a store rule and a product decision conflict — the human owns that risk, your job is to state it clearly;
- an action is irreversible or outward-facing: merging, uploading, deleting, rotating credentials, replying to a
  reviewer;
- you need a credential — ask for the channel, never the value.

Otherwise decide, record the decision in the brief, and keep going.

## Entering mid-way

If the app already exists and the request starts at a later phase (a new workspace that will not build, missing tests,
a hardening pass), start there, but first check that the earlier exits hold — especially `docs/PROJECT_BRIEF.md`, the
QA account, the device matrix and the verification harness. What is missing there is usually why the later phase is
hurting.

## Measuring the next project

When the app ships, count the prompts the way the case study did (`references/00-evidence-and-gaps.md` §7;
`assets/conductor/prompt-census.py` reads Conductor's local history read-only and redacts secrets). The phase whose
category is still large is the one this skill has not fixed yet.

---

## Reference files

Read each when you reach its phase.

- `references/00-evidence-and-gaps.md` — the case study: where 165 prompts went, the eight gaps, what each retrofit
  cost, what stays human, how to measure the next project.
- `references/01-intake.md` — the seven packs item by item, the store rules that become day-one decisions, how to sort
  a missing item, the kickoff message format and its length budget.
- `references/02-api-contract.md` — OpenAPI first, contract checklist, smoke-script rules, requests vs gap report,
  fallback policy, working with a backend team or agent, the mock API.
- `references/03-design.md` — design hand-off requirements, screen inventory, the states designs never draw, on-device
  sign-off, review rounds, change specs.
- `references/04-architecture.md` — layers, folder structure, the designs worth copying (API client, session, gates,
  server state, typography), the system-design decision table, structuring for parallel agents.
- `references/05-build-order.md` — the starter and `create-app.mjs`, phase exits, the slice template, parallel
  workspaces, commit and PR discipline, surviving session limits.
- `references/06-verification.md` — the verification ladder, device matrix, Maestro on both platforms, QA tour, the
  hardening matrix, evidence format.
- `references/07-expo-react-native.md` — staying on the latest SDK, then Expo / React Native field notes as
  symptom → cause → rule.
- `references/08-prompts.md` — prompt templates for the human, and the message formats the agent sends back.

Scripts and assets:

- `scripts/create-app.mjs` — new app on the latest SDK + the starter, in one command.
- `assets/starter/` — the foundation itself (source, scripts, Maestro flows, mock API, CI, `CLAUDE.md`, README).
- `assets/PROJECT_BRIEF.template.md`, `assets/CLAUDE.template.md`, `assets/HUMAN_TASKS.template.md`
- `assets/conductor/` — `settings.toml`, `setup.sh`, `prompt-census.py`
