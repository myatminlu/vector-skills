# Project brief — <App name>

> The single source of truth for everything the code cannot show. Agents read this before working; decisions are added with a date and a reason, never silently changed. Save as `docs/PROJECT_BRIEF.md`.
>
> Fill what you know. Leave the rest blank — the agent will ask for the blanks in one batch.

Last updated: <date> · Owner: <name>

---

## 1. Product and decisions

**What it is (one paragraph):**

**What it is not:** <e.g. "a coaching assistant, not a health app">

**Store category:** App Store <…> · Google Play <…>

**v1 scope, in priority order:**
1.
2.
3.

**Out of scope for v1:**

| Decision | Answer | Decided on | Why |
|---|---|---|---|
| Sign-in methods, and where each appears | | | |
| Guest access — what works without an account | | | |
| Account deletion in the app | | | |
| Payments — iOS | | | |
| Payments — Android | | | |
| Who verifies purchases | | | |
| UI languages; default on a fresh install | | | |
| Language of content / AI replies (separate from UI language?) | | | |
| Navigation shell (tabs, drawer, …) — confirmed on device? | | | |
| "Native UI" means | | | |
| Themes (dark, light, both) | | | |
| Notifications — kinds, and when permission is asked | | | |
| Offline behaviour | | | |
| Crash reporting / analytics | | | |
| Over-the-air updates | | | |

**Copy and voice rules (words to use, words to avoid):**
-

**Reference apps ("it should feel like…"):**
-

## 2. Design

- Design source: <file or link>
- Screens: <count> · String table languages: <…>
- Brand assets provided: ☐ app icon ☐ adaptive-icon layers ☐ splash mark ☐ logo ☐ notification icon
- Screen inventory: `docs/SCREENS.md`
- On-device sign-off: ☐ pending ☐ approved on <date>

## 3. API contract and QA account

- Base URL — production: <…> · development: <…>
- API reference: <file or link>
- Backend repository and the checkout that is current: <path / branch>
- Contract questions go to: <name>
- Rate limits: <…>
- Test accounts — one per state the app must show (free at its limit, paid, …): env vars `QA_EMAIL` / `QA_PASSWORD` (…) in `.env.local` — **values never written here**
- Requests to the backend (what is missing): `docs/API_REQUESTS.md`
- Smoke script: `npm run api:smoke` · last run: <date> · where the live API differs from its reference: `docs/API_GAPS.md`

| API gap | Fallback chosen (ship fallback / hide behind switch / cut) | Decided on |
|---|---|---|
| | | |

## 4. Identity and environment

| Item | Value |
|---|---|
| Display name | |
| iOS bundle identifier | |
| Android application id | |
| URL scheme | |
| Apple team id (from the developer account) | |
| Google Play account type (organisation / personal) | |
| OAuth client — web | |
| OAuth client — iOS | |
| OAuth clients — Android (debug / upload / store signing) | ☐ ☐ ☐ |
| Push provider and app id | |
| APNs key uploaded to the push provider | ☐ |
| FCM credentials uploaded to the push provider | ☐ |
| Where the real `.env` lives; how new worktrees get it | |
| iOS distribution identity held by | |
| Android upload keystore location (path only) | |
| Other repositories (backend, website) | |

Versions in use (resolved as `latest` on <date>): Expo SDK <…> · React Native <…> · expo-router <…> · TypeScript <…>
Local toolchain: Xcode <…> · simulators <…> · JDK <…> · Android SDK/NDK <…> · emulator image <…> · Maestro <…>

Simulators that hold the owner's own sessions (look, do not send): <…>

## 5. Platform scope and device matrix

- Minimum OS: iOS <…> · Android <…>
- Tablet: ☐ supported ☐ phone only (reviewers still test on tablets)
- Orientation: <…>
- Text scaling: OS font scale ☐ · in-app text size ☐

| Target | Used for |
|---|---|
| iPhone simulator, current OS | full tour |
| iPhone + iPad simulators, newest OS | release launch test |
| iPad simulator | layout pass |
| Android phone emulator | full tour, keyboard, taps |
| <real Android phone> | checkpoints |
| <real iPhone> | push, sandbox purchase, camera |

## 6. Store, legal and release

| Item | Value / status |
|---|---|
| Developer accounts active | Apple ☐ · Google ☐ |
| Paid-apps agreement, banking, tax | ☐ |
| App records created | App Store ☐ · Play ☐ |
| Product ids and their source of truth | |
| Privacy policy URL (final, live) | |
| Terms URL / EULA | |
| Support URL or email | |
| Account-deletion web page | |
| Demo account for review | (in the console, not here) |
| Listing languages | App Store <…> · Play <…> |
| Countries | |
| Release channel (local builds / build service) | |
| Who builds · who uploads | |
| Where artifacts are saved, and how they are named | |
| Version policy (what a "small release" raises) | |
| Target date | |

Data inventory: `docs/DATA_INVENTORY.md` · Human task list: `docs/HUMAN_TASKS.md`

## 7. Working agreement

See `CLAUDE.md`. Summary: reports in <language>; commits and PRs in <language>; needs an explicit yes: <version bump, merge, upload, …>.

---

## Accepted risks

| Risk | Accepted by | Date | The lever that removes it |
|---|---|---|---|
| | | | |

## Release history

| Version (build) | Commit | Date | Outcome | Notes (incl. "do not submit") |
|---|---|---|---|---|
| | | | | |

## Decision log

Newest first. One line each: date — decision — why.

-
