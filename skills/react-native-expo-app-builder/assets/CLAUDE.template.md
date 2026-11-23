# <App name> — instructions for agents

<!--
Save as CLAUDE.md (or AGENTS.md) at the repository root. Keep it short: it is read at the start of every
session in every clone and worktree. Facts and decisions live in docs/PROJECT_BRIEF.md; this file holds
the standing rules. Replace every <placeholder>, delete what does not apply.
-->

<One sentence: what the app is, and what it is not.>
Read `docs/PROJECT_BRIEF.md` before any non-trivial work — it holds the decisions the code cannot show.

## Communication

- Write reports, plans and progress notes in **<language>**; keep code, paths, endpoints and library names in English.
- Commit messages, PR titles and PR bodies in **<English>**.
- On long tasks post a one-line progress note every few minutes.
- End every report with what I need to do next, or say that nothing is needed.

## How to work

- **Root cause by default.** For any defect: find the cause, fix it there, then search the codebase for the same pattern and fix or list every instance. If a symptom is reported a second time, the first fix was a patch — say so.
- **You are the tester.** Before reporting done, run the change on <iPhone simulator>, <Android emulator> and <iPad simulator> — tap through it with the Maestro flows (`npm run e2e -- --device <id>`), add a flow for a new main path. Put the evidence (screenshots, command output) in the report and list what you could not verify.
- **Do it yourself when you can.** Hand me only what needs my login or my decision, with exact steps.
- **Releases, store forms, rejections and console warnings** follow the `app-store-play-store-submission` skill. A rejection gets its protocol, not just an explanation: the whole message → the cause → the same class of rule across the app → the fix with evidence → the text I can send back to the reviewer.
- **Commit as you go**, one logical step per commit. Open the PR when the work is verified.
- **One concern per workspace and per PR.** Store-console questions go in the release-helper workspace.
- If a decision is missing from the brief and cheap to change, decide, record it in the brief, and tell me. If it is expensive to change, ask.

## Needs my explicit yes

- Version or build number changes.
- Merging, uploading, publishing, or replying to a store reviewer.
- Deleting or overwriting anything outside the workspace.
- Shipping with a known store-policy risk.

## Release

1. Run the submission audit (`docs/SUBMISSION_AUDIT.md`).
2. Show me the proposed numbers and wait. A small release raises the **last** digit (<1.0.0 → 1.0.1>).
3. PR → merge → build **from <main> only**.
4. <Who builds what: e.g. "You build the Android bundle and save it as `<name>-<version>-<build>.aab` in `<folder>`; I archive and upload iOS myself.">
5. Launch-test the release build on the newest OS, phone and tablet, before handing anything over.
6. Give me absolute paths and my remaining steps.

## Secrets

- Never write a password, key or token in chat, a file in the repo, a PR, or agent memory.
- QA credentials come from `QA_EMAIL` / `QA_PASSWORD` in the environment. If I paste a secret into chat, remind me that it is now in the transcript and should be rotated.
- Do not open credential files in <paths>.

## Product rules

- <Copy rule, e.g. "Call the assistant 'the AI', never 'the doctor'." Search for the forbidden words before committing strings.>
- <Positioning rule, e.g. "This is a business-coaching app, not a health app — never add medical framing.">
- Every string exists in every language (<en, my>); the parity test must pass.

## Architecture rules

- Text is drawn only by `<AppText>`; a screen's frame only by `<Screen>` (or the exported content column for list screens).
- Screens never call the network, storage or `process.env` directly — use `api.*`, the storage wrapper and `config/env`.
- Routes are built with the typed builders in `<navigation/routes>`; every screen has a deep link.
- **Gates:** a new screen that reads the signed-in user is wrapped with `<withAccount>`; anything that sends user content to the AI goes through `<ensureConsent>` first.
- Native changes go in the app config or a plugin in `plugins/` — never edit `ios/` or `android/`.
- New routes are added to the QA tour.

## Environment

- First step in a fresh workspace: `<npm ci>`; `.env` must exist (copied automatically — if it is missing, stop and tell me).
- Checks: `<npm run typecheck>` · `<npm run lint>` · `<npm test>` · `<npm run export:all>`
- These need the tool sandbox off: <package installs, prebuild, native builds, simulator and emulator control>.
- Dev-server port for this repo's workspaces: <range>.
- Simulators that hold my own sessions — look, do not send: <names>. Use <spare device> for automated runs.
- Up-to-date backend checkout: <path>. Contract smoke: `<npm run api:smoke>`.

## Definition of done

Runs on phone (both platforms) and tablet · loading, empty, error and offline states exist · all languages, nothing clipped · typecheck, lint, tests and both bundle exports pass · in the QA tour · report carries evidence and names what was not verified.
