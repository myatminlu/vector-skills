# Architecture — layers, structure and system design (Phase 2)

This is the architecture the case-study app converged on after a rebuild, an agent code review and four store rejections. Each part is described by its role, with the Expo / React Native name in brackets where one exists; `assets/starter/` implements all of it. Copy the shapes, not the file names.

The organising idea: **anything that applies to every screen is built once, underneath the screens, before the first feature.** Every expensive retrofit on the case-study project (guest access, tablet layout, text size, consent) was a cross-cutting rule that had been left to individual screens.

## Contents

1. The layers
2. Dependency rules
3. Folder structure
4. Layer by layer — the designs worth copying
5. System-design decisions
6. Structuring the code for parallel agents
7. What to test where

---

## 1. The layers

```
┌───────────────────────────────────────────────────────────────────┐
│ Routes            one thin file per screen; composes, no logic     │
├───────────────────────────────────────────────────────────────────┤
│ Features          per domain: components, data hooks, pure logic   │
├──────────────────┬────────────────────────┬───────────────────────┤
│ Gates            │ Design system          │ Navigation helpers     │
│ account, consent,│ tokens, primitives,    │ typed route builders,  │
│ plan, remote cfg │ shared states          │ screen-option presets  │
├──────────────────┴────────────────────────┴───────────────────────┤
│ Session (who is using the app)   ·   Server state (cache, keys)    │
├───────────────────────────────────────────────────────────────────┤
│ API layer         client · error model · per-domain modules · types│
├───────────────────────────────────────────────────────────────────┤
│ Platform services storage · secure tokens · connectivity · push ·  │
│                   device info · localisation core                  │
├───────────────────────────────────────────────────────────────────┤
│ Config            the one module that reads the environment        │
└───────────────────────────────────────────────────────────────────┘
   beside the stack:  native config as code (app config + plugins)
                      dev harness (QA tour, gallery, smoke script)
```

## 2. Dependency rules

- **Imports point downward.** A route imports features; a feature imports gates, design system, session, server state and the API; nothing below imports from above.
- **Screens never call the network, storage or the environment directly.** They go through the API module, the storage wrapper and the config module.
- **Features do not reach into each other.** When two features need the same thing, it moves down a layer.
- **Text is drawn only by the text primitive; a screen's frame only by the screen primitive.** That is what makes script-aware line height, text scaling, safe areas, keyboard handling and the tablet column a single change each.
- **A policy is enforced in one place** — a gate — and every route passes through it.

## 3. Folder structure

```
src/
  app/                    routes only        (auth)/ (onboarding)/ (app)/ (app)/(sheets)/
  features/<domain>/      components/  queries.ts  <logic>.ts  <logic>.test.ts
  components/ui/          design-system primitives
  constants/theme.ts      tokens
  navigation/             typed route builders, screen-option presets
  providers/              app providers, session, notifications, toast
  lib/api/                client, errors, scheduler, stream reader, one module per domain
  lib/                    storage, token store, connectivity, push, device, text size
  i18n/                   dictionaries, typed t(), formatters, provider
  config/env.ts           the only reader of the environment
  types/                  API types
  dev/                    QA tour, dev gallery
plugins/                  native changes as config plugins
scripts/                  contract smoke, version bump, release launch test
locales/                  native permission strings per language
```

Route groups mirror **session states**, not features: signed out, onboarding, the app. Sheets get their own group so their presentation options live in one layout.

---

## 4. Layer by layer — the designs worth copying

### Config

- One module reads the environment, with **one literal read per variable**. Bundlers inline only literal property accesses; a helper that indexes the environment by name returns `undefined` in every release build while working perfectly in development.
- It trims, validates and throws at start-up when a required value is missing. Because that throw would be a launch crash in a release, the **build** must refuse first: the app-config script rejects a production bundle that lacks the required values (`assets/starter/app.config.js`).
- A value that has to equal something published elsewhere — the privacy URL in the store listing — is a constant, not an environment variable.
- A version constant feeds both the "about" row and the persisted-cache buster; the bump script moves it with the store version.
- Everything in a client bundle is public. Secrets do not go here.

### Platform services

- **Key-value storage** behind a typed wrapper with a single key registry; per-user keys take the user id; synchronous getters for boot-time reads (language, drafts) so the first frame is already correct; a storage failure never crashes the UI.
- **Secure token store** in the keychain / keystore, this-device-only, one JSON value, with a distinct error type so "secure storage unavailable" is not shown as "wrong password".
- **Connectivity** as one verdict shared by the offline banner and the data layer: the OS's reachability *plus the app's own evidence* — any answer from the API means online, a probe runs while the OS says offline, foregrounding re-checks, and "unknown" counts as online. OS reachability alone left the app stuck offline after the network returned.
- **Push**: initialise only when configured; log the backend user id in and out with the session; request permission once, after onboarding; route taps by payload type.
- Non-UI modules learn about sign-in and sign-out through a small session event that replays the current state to late subscribers.

### API layer

- **One request function** adds the auth header and any header the server keys behaviour on, schedules against the rate limit, applies a time-out, converts transport failures into typed errors, and implements the 401 policy: refresh once, **single-flight**, and end the session only when the server refuses the refresh.
- **One error type** carrying status, stable code, trace id, validation messages and structured details, plus a central mapper to localised text and narrower mappers where the server's wording is unusable.
- **One module per backend domain**, combined into a single `api` object; every call accepts an abort signal.
- **Normalisers** at the boundary for undocumented or unstable shapes; a body helper that strips `null`.
- **A stream reader** that buffers by event block, ignores keep-alives and raises a typed error for in-stream error events.
- **A separate upload path**: native transport, a long time-out, type and size checked before sending.

### Server state

- A query cache with deliberate defaults: short stale time, a day of garbage-collection time, retries only for transient failures (never 400 / 401 / 403 / 404), a longer back-off for 429, no retry on mutations.
- **A key factory.** Everything user-scoped lives under `['users', userId, …]`, everything public under `['public', …]`. Sign-out clears the user's data without guessing, two accounts on one phone never share a cache, and a guest keeps the public cache.
- **Persistence is opt-in per query**; the persisted cache is busted by the app version.
- Focus follows the app state; online status follows the connectivity verdict.
- Optimistic updates with rollback for toggles, invalidation on settle.
- Read the clock **when an action runs, not at render** — a render-time date gets memoised, and a screen left open past midnight would keep logging to yesterday.

### Session

- One provider owns the user and the token life cycle: start a session (clear the cache, store tokens, set the user), end it locally (clear tokens and cache), and expose both to the request layer's "unauthorised" event.
- **Launch:** a stored refresh token → fetch the profile. A 401 ends the session; anything transient (offline, time-out, 5xx, 429) **keeps the session** and shows the cached user. Signing people out because the server was restarting is a bug.
- **Sign-out completes offline.**
- A **session epoch** counter lets a slow response (a two-minute upload) notice that the session it belonged to is over, even when the same account signed back in.
- Session states map one-to-one onto route groups through declarative guards: signed out, needs onboarding, ready — and guest.

### Gates and policies

Built in the foundation; every route passes through them.

| Gate | Shape | Why it is a gate |
|---|---|---|
| **Account** | A wrapper around the default export of every account-only route, plus a `requireAccount(feature)` check at entry points that opens a sign-in sheet. The request layer answers an authenticated call made by a guest locally, without touching the network or the sign-out path | A guest reaches screens by deep link, stale route and push tap as well as by buttons; added late, this touched 62 files |
| **Consent** | `ensureConsent(user)` resolves once the user has allowed the data sharing; `withConsent(action)` is single-flight; the record is versioned and per user; settings can withdraw it | Every path that sends personal data to a third-party AI must wait on it — send, retry, voice auto-send, starter prompts, memory edits. Raise the version when what is shared changes |
| **Plan / quota** | A typed quota error opens the paywall from wherever it surfaces | Quota errors arrive from requests and from inside streams |
| **Remote config** | A config endpoint resolved by pure functions with documented fallbacks, persisted for offline launches | Lets the owner switch a payment channel or hide a feature during review without a release |

### Design system

- **Text primitive**: chooses the font family by script, the line height by script, applies the app text scale, caps the OS font scale per variant; an explicit font size opts a fixed-size box out (badges, initials).
- **Screen primitive**: safe areas, scrolling, keyboard avoidance (identical behaviour on both platforms), a centred content column — reading width or form width by preset — pull-to-refresh, a sticky footer.
- Screens that own a virtualised list cannot use the screen primitive; they apply the same exported column style themselves.
- Shared states: loading, error (selectable, with retry), empty, skeleton, offline banner, a root error boundary.
- Sheet scaffolds, list rows, buttons, fields that pick their font from the placeholder too.
- A dev gallery route that renders all of it — the QA tour photographs it.

### Navigation

- **Typed route builders**: screens never write a path string; parameters are typed where the route is defined.
- A helper for "go to a root destination from anywhere" that dismisses what is stacked above first — otherwise a second copy of the shell gets pushed.
- **A deep link for every screen.** It is the product's linking surface and the test harness's steering wheel.
- Screen-option presets (no header, modal, sheet) so presentation is consistent.

### Localisation and typography

- Typed keys taken from the primary dictionary; a module-level accessor for non-UI code (error mapping, notifications); a provider for the UI.
- A **parity test**: the same keys, none empty, in every language. It fails the build, not the review.
- Formatters for digits, counts, money, durations and time-zone-aware date keys, each with tests that pin real cases (a day boundary in the users' zone).
- Language codes normalised at the API boundary.
- **Two settings, not one**: the UI language belongs to the phone; the language content or AI replies use belongs to the account.

### Platform splits

Use platform-specific files (`thing.ios.tsx`, `thing.android.tsx`, `thing.tsx`) so the other platform never bundles the code — a store-billing provider that exists only on iOS, a native slider per platform. Shared types go in a differently named module: inside `thing.ios.tsx`, an import of `./thing` resolves to itself.

### Native config as code

`ios/` and `android/` are generated and git-ignored. Every native change is an app-config value or a config plugin, and a plugin **throws** when the template it patches changes shape. Permission strings live in the per-language files the OS actually reads.

---

## 5. System-design decisions

Decide each on purpose, record it in the brief. "Cost if late" is what the retrofit touched on the case-study project where known.

| Decision | Recommended default | Decide in | Cost if late |
|---|---|---|---|
| Navigation shell | As designed, confirmed on a device | Phase 3 | Every header and entry point (34 files) |
| Guest access | Guest state and account gate from day one if anything is public | Phase 0 | Every account-only route (62 files) and a rejection |
| Tablet | One centred column in the screen primitive | Phase 2 | 51 files |
| Text scaling | Multiplier in the text primitive, per-variant caps | Phase 2 | 30 files |
| Third-party data sharing | Consent gate, built in whenever personal data reaches a third-party AI — not a question for the owner; only the wording is | Phase 0 | 20 files and a rejection |
| Payments | Store billing per platform, server-side verification, remote channel switch | Phase 0 | Backend work, product ids, review time |
| Remote config | At least payment and feature switches; consider a minimum-version check. If the API has no config endpoint yet, resolve the switches in one function backed by build-time values | Phase 2 | A release per switch |
| Updates | Decide binary-only vs over-the-air knowingly | Phase 0 | Without OTA, every copy fix is a store review |
| Offline | Read-only cache of opted-in queries | Phase 2 | A write queue is a project of its own |
| Streaming | Streaming-capable fetch, send-once guard, explicit "follow latest" scroll state | Phase 1 spike | The core screen |
| Uploads | Native transport, pre-flight checks, read-time signed URLs | Phase 1 spike | Every attachment path |
| Push | Provider chosen; device linked by backend user id | Phase 0 | Silent non-delivery |
| Themes | A typed palette even if one theme ships | Phase 2 | Every colour reference |
| Languages | Typed keys, parity test, script-aware text | Phase 2 | Every string |
| Crash reporting, analytics | Choose, or skip on purpose; declare it in the privacy forms | Phase 0 | Blind in production — the case-study app shipped with a root error boundary but no crash reporting and no handler for errors thrown outside render |
| Environments | Development and production API, env per worktree | Phase 0 | Wrong backend in a release |
| Build channel | Local store builds or a build service | Phase 0 | Signing and automation rework |

---

## 6. Structuring the code for parallel agents

The foundation and the shell are serial — one agent. Feature slices can run in parallel workspaces, and then the shape of the code decides how often they collide.

**Hotspots** — files every slice edits: the string dictionaries, the route builders, the query-key factory, the API types, the storage-key registry, the QA tour list.

The case-study app kept all of these central (two dictionaries of about 650 keys, one route file, one key factory) and built its features mostly serially, so it never paid for that. If you plan to fan out, **split them by feature and compose** before the fan-out:

```
i18n/<feature>.<lang>.ts        → merged into the dictionary by an index
features/<feature>/routes.ts    → re-exported by navigation/routes.ts
features/<feature>/keys.ts      → re-exported by the key factory
types/<domain>.ts               → re-exported by types/index.ts
```

This is a recommendation derived from that experience, not something the project measured. Two rules it did learn the hard way:

- **Never merge a PR that an active workspace is still building on** — the commits made afterwards had to be moved to new branches.
- **Every workspace needs the environment file and its dependencies before anything works**; make the bootstrap automatic (`05-build-order.md`).

---

## 7. What to test where

| Level | Runs on | Covers | Case-study practice |
|---|---|---|---|
| Unit | Plain Node test runner, no device | Pure logic: request rules, scheduler (injected clock), stream parser, normalisers, formatters, date keys, localisation parity, stores, gate logic, config resolvers, purchase-verification outcomes | 36 test files, no simulator needed |
| Bundle export | CI, both platforms | Import errors, platform-file mistakes, the release env guard | Every PR |
| Contract smoke | Node against the real API | Shapes, errors, limits | On demand and when the backend changes |
| Device harness | Simulator and emulator | Everything visual and interactive | QA tour, deep links, emulator taps (`06-verification.md`) |
| Release launch test | Newest OS simulators, release configuration | "Builds green, dies before the first frame" | Before every hand-over |

Put logic where the cheap level can reach it: a decision made inside a component can only be tested on a device; the same decision in a pure function is tested in milliseconds.
