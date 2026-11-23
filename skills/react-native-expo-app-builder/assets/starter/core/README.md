# App

An Expo (React Native) app created with `create-expo-app@latest` and the foundation of the
[`react-native-expo-app-builder`](https://github.com/myatminlu/vector-skills/tree/main/skills/react-native-expo-app-builder)
agent skill. Everything that applies to every screen is already built and tested; the screens are yours.

The foundation comes from an app that went through four App Store rejections and a month of fixes. It was extracted
so the next app starts where that one ended.

## What is already here

**The core** — in every app built from the starter:

| Area | What it does | Where |
|---|---|---|
| Config | One module reads the environment, with literal reads (release bundles inline nothing else). Release bundles refuse to build without an API address; store builds refuse to build with the template's bundle id or legal URLs | `src/config/`, `app.config.js` |
| API client | Single-flight token refresh (once a module supplies the tokens), time-outs, rate-limit scheduling, a 401 policy that never signs people out for being offline, typed errors with localised messages | `src/lib/api/` |
| Server state | TanStack Query with deliberate retry rules and public/user key trees | `src/providers/app-providers.tsx`, `src/lib/query-keys.ts` |
| Connectivity | Offline banner and query pausing from one verdict: NetInfo plus the API's own answers | `src/lib/connectivity.ts` |
| Design system | Text (scaled, script-aware once a language module adds a script), Screen (safe areas, keyboard on both platforms, a centred column on tablets), buttons, fields, rows, sheets, segmented control, loading/empty/error states, error boundary | `src/components/ui/` |
| Languages | English, with a test that every installed language has every key | `src/i18n/` |
| Navigation | A stack with Home, Item and Account, typed route builders, a deep link for every screen | `src/app/`, `src/navigation/` |
| Extension points | Modules register providers, overrides (session, consent, flags, text scale) and contributions (account rows, item actions, screens, tour steps) without editing core files | `src/modules/slots.ts` |
| Harness | A QA screenshot tour, Maestro flows, a local mock API, a contract smoke script, a release launch test | `src/dev/`, `.maestro/`, `scripts/` |
| Workspace | CI (typecheck, lint, tests, contract smoke, both production bundles), Dependabot for workflow actions, agent instructions | `.github/`, `CLAUDE.md`, `AGENTS.md` |

**The modules installed in this app** (listed in `modules.json`):

<!-- modules: generated from modules.json by create-app / add-module; lines below this marker are rewritten -->
<!-- end modules -->

Add one later with `node <skill>/scripts/add-module.mjs . <module>` (it installs the libraries, merges the module's
endpoints into `docs/openapi.json`, regenerates `src/modules/index.ts` and runs the checks). The home list and item
screen are an example that exercises the core and the modules against the mock API — replace them with the app's
screens and keep the shapes.

## First steps

1. Fill `docs/PROJECT_BRIEF.md` with what you know. An agent with the skill asks for the rest in one message.
2. Set the identity in `app.json` before the first store upload — it is fixed forever by it: `name`, `slug`,
   `scheme`, `ios.bundleIdentifier`, `android.package`, and `extra.legal` (privacy URL, terms URL, support email).
   Store builds refuse to start while any of them is still `example`.
3. Set `EXPO_PUBLIC_API_URL` in `.env` (or keep the mock API's address). `.env.example` lists every key.

## Run it

```bash
npm run mock-api          # local backend on :4010 (with the auth module: demo@example.com / demo1234)
npm run ios               # builds a development client and runs it on a simulator
npm run android           # same on an emulator (run `adb reverse tcp:4010 tcp:4010` for the mock API)
npm start                 # just the dev server, for a development client already installed
```

A development client is required (`expo-dev-client`): Expo Go cannot load native modules the app will add later.

## Scripts

| Script | Does |
|---|---|
| `npm run check` | typecheck + lint + unit tests |
| `npm test` | unit tests on Node (no simulator): API client rules, scheduler, i18n parity, and each module's own tests |
| `npm run mock-api` | local mock backend (`scripts/mock-api.mjs` + one file per module in `scripts/mock/`) |
| `npm run api:smoke` | calls every endpoint the app uses and prints status + response shape; add `-- --spec docs/openapi.json` to check shapes against the spec |
| `npm run api:types` | generates `src/types/openapi.d.ts` from the backend's OpenAPI file (`OPENAPI_SPEC=path`) |
| `npm run e2e -- --device <id>` | runs the Maestro flows against an installed build, with the mock API |
| `npm run export:all` | production JS bundles for both platforms |
| `npm run bump -- --dry-run` | proposes the next build number (and `--version x.y.z`) |
| `npm run ios:launch-test` | builds Release for the simulator and launches it on the newest iOS, iPad and iPhone |

## Adding things

- **A screen:** a file in `src/app/`, a builder in `src/navigation/routes.ts` (or the module's `routes.ts`), a tour
  step, and strings in the core's or the module's `strings.ts`.
- **An account-only screen:** wrap its default export in `withAccount(Screen, 'feature')` (`src/modules/account-gate`),
  and call `slots.useRequireAccount()('feature')` at every entry point.
- **Anything that sends user content to an AI:** call `slots.withConsent(user.id, send)` first, on every path that
  sends. With the ai-consent module, raise `CONSENT_VERSION` when what is sent changes, and update the privacy policy
  and the stores' privacy forms.
- **A remote switch:** `slots.useFlag('key', fallback)` — the remote-config module answers it from `GET /app-config`.
- **A feature of your own:** a folder in `src/modules/<name>/` whose `index.ts` calls `registerModule({...})`, listed in
  `modules.json`; see any installed module for the shape.
- **A native change:** app config or a config plugin in `plugins/` — never edit `ios/` or `android/`.
- **A library:** `npx expo install <package>` — never a bare `npm install`, which ignores the SDK's version map.

## Staying on the latest versions

Nothing in this project pins a version by hand: Expo and React Native packages follow the SDK.

```bash
npm view expo dist-tags                         # what "latest" is today
npx expo install expo@latest && npx expo install --fix   # move the whole project to it
npx expo-doctor@latest                          # what still disagrees
```

Read the SDK's changelog and upgrade notes (https://expo.dev/changelog) before upgrading, then run the checks, both
production bundles, a release build on each platform and the Maestro flows. Fix forward with the current docs; pin a
single package back only when it is genuinely incompatible, with a dated comment and a link to the issue.

## The API contract

The types in `src/types/api.ts` describe the mock API. When the backend publishes an OpenAPI file:

```bash
OPENAPI_SPEC=../backend/docs/openapi.json npm run api:types   # → src/types/openapi.d.ts
API_URL=https://api.example.com QA_EMAIL=… QA_PASSWORD=… npm run api:smoke -- --spec ../backend/docs/openapi.json
```

Derive the hand-written types from the generated ones, and keep the smoke script's `CHECKS` equal to the endpoints
the app calls.

## End-to-end tests (Maestro)

Maestro taps through the app on a simulator or emulator (`brew install mobile-dev-inc/tap/maestro`; the e2e script
finds the JDK Homebrew installs with it).

```bash
# iOS: a Release build pointed at the mock API (localhost works on the simulator)
APP_ENV=e2e npx expo run:ios --configuration Release --device <simulator UDID> --no-bundler
npm run e2e -- --device <simulator UDID>

# Android: APP_ENV=e2e allows plain http to the mock API in this build type only
APP_ENV=e2e npx expo prebuild --platform android --clean
(cd android && ./gradlew :app:assembleRelease)
adb -s emulator-5554 install -r android/app/build/outputs/apk/release/app-release.apk
npm run e2e -- --device emulator-5554
```

Flows live in `.maestro/`; elements are found by `testID`. Run them on devices nobody is signed into — they clear the
app's data. Android builds need the JDK version React Native's environment-setup guide names; a newer JDK (or an
IDE-bundled one) can fail the native build steps.

## Release

`npm run bump -- --dry-run` → approve → commit, PR, merge → `APP_ENV=production npx expo prebuild --clean` →
`npm run ios:launch-test` → archive in Xcode / `./gradlew bundleRelease`. Android release signing reads
`APP_UPLOAD_STORE_FILE`, `APP_UPLOAD_STORE_PASSWORD`, `APP_UPLOAD_KEY_ALIAS`, `APP_UPLOAD_KEY_PASSWORD` from
`~/.gradle/gradle.properties` (never the repo) and falls back to the debug key without them — check the signer
before uploading. Check whether R8 code shrinking is on in release builds (a `mapping.txt` appears next to the
bundle); when it is, test every library that uses reflection in a release build. The companion skill
[`app-store-play-store-submission`](https://github.com/myatminlu/vector-skills/tree/main/skills/app-store-play-store-submission)
covers the store side.

## Not included — decide per app

Push notifications, in-app purchase, social sign-in, crash reporting and analytics, onboarding, over-the-air updates.
Each brings console setup and store declarations; the skill's references cover what each needs.

## Notes

- Node: the current LTS. The unit tests use `mock.module(…, { exports })` from Node's test runner.
- npm may hold back package install scripts until approved; `esbuild` (used by the test runner) works without its
  postinstall.
- After adding a route, `npx expo start` once regenerates `.expo/types/router.d.ts` for typed routes.
