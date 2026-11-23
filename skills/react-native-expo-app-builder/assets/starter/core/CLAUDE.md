@AGENTS.md

# Project rules

<!-- Fill the <placeholders> when the app gets its brief; delete what does not apply. -->

<One sentence: what the app is, and what it is not.>
Read `docs/PROJECT_BRIEF.md` before any non-trivial work — it holds the decisions the code cannot show.

## Communication

- Reports, plans and progress notes in **<language>**; code, paths and library names in English.
- Commit messages, PR titles and PR bodies in English.
- On long tasks, a one-line progress note every few minutes. End every report with what I need to do next, or
  "nothing".

## How to work

- **Root cause by default.** Fix a defect where it starts, then search for the same pattern and fix or list every
  instance. A symptom reported twice means the first fix was a patch.
- **You are the tester.** Before reporting done, run the change on an iOS simulator and an Android emulator
  (`npm run e2e -- --device <id>` for flows; the QA tour for screenshots) and check new layouts at tablet width.
  Report what was verified on which target, and what was not.
- **Do it yourself when you can.** Hand me only what needs my login or my decision, with exact steps.
- **Commit as you go**, one logical step per commit; open the PR when the work is verified. One concern per PR.

## Needs my explicit yes

Version or build numbers · merging · uploading or publishing · replying to a store reviewer · deleting anything
outside the workspace · shipping with a known store-policy risk.

## Architecture rules

- Text only through `AppText`; a screen's frame only through `Screen` (list screens spread `contentColumn`).
- Screens never call `fetch`, storage or `process.env` — use `api.*`, `localStore`, `config/env`.
- Routes through `href.*` builders; every screen has a deep link and a QA tour step.
- Features plug into the core through `registerModule` (`src/modules/slots.ts`) — a new feature is a module folder, not
  an edit to core screens. The installed modules are listed in `modules.json`.
- Strings live in `src/i18n/strings.ts` (core) or `src/modules/<name>/strings.ts`; `npm test` checks every language.
- Native changes in app config or `plugins/`, never in `ios/` or `android/`.
<!-- module rules: generated from modules.json by create-app / add-module; lines below this marker are rewritten -->
<!-- end module rules -->

## Secrets

Never in chat, the repo, a PR or agent memory. QA credentials come from `QA_EMAIL` / `QA_PASSWORD` in the
environment. If I paste a secret into chat, tell me it is now in the transcript and should be changed.

## Environment

- Fresh workspace: `npm ci`; `.env` comes from the repository root's copy (Conductor: `.conductor/`), otherwise
  `cp .env.example .env` and fill it.
- Checks: `npm run check`, `npm run export:all`, `npm run api:smoke` (with `npm run mock-api` running).
- Libraries: `npx expo install <package>` so versions follow the SDK; upgrade the SDK as a whole
  (`npx expo install expo@latest && npx expo install --fix`), never one package at a time. Toolchain versions in use
  are recorded in `docs/PROJECT_BRIEF.md`.
- Package installs, prebuild, native builds, simulator/emulator control and Maestro need the tool sandbox off.
- Run e2e flows only on simulators and emulators nobody is signed into — they clear the app's data.
