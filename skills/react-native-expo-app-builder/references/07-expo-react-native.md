# Expo / React Native — staying current, and field notes

Section 0 is how to stay on the latest Expo SDK. Sections 1–13 are field notes, each written as *symptom → cause →
rule*; every one cost at least one build cycle or one human bug report on a real project. They were true on the SDK
that was current when they were written. SDKs move: check a note against the SDK in front of you before relying on
it, and drop it from your project notes once it stops being true.

## Contents

0. Staying on the latest SDK
1. Project and native config
2. Environment
3. Networking, uploads, streaming
4. Navigation and sheets
5. Layout: keyboard, tablet, absolute positioning
6. Text: scripts and scaling
7. Media, pickers and permissions
8. Sign-in providers
9. Push
10. In-app purchase
11. Android build
12. iOS build
13. Tooling

---

## 0. Staying on the latest SDK

**Resolve "latest" when you start, never from memory.**

| Need | Command or source |
|---|---|
| What is current | `npm view expo dist-tags` → `latest` (ignore `next` and `canary` unless asked) |
| A new project | `npx create-expo-app@latest` (or this skill's `scripts/create-app.mjs`, which runs it) |
| A library | `npx expo install <pkg>` — no version; Expo picks the one that matches the SDK |
| Moving to a new SDK | `npx expo install expo@latest && npx expo install --fix`, then `npx expo-doctor@latest` |
| A CLI | `npx <tool>@latest` |
| What changed | the SDK's changelog and upgrade notes (https://expo.dev/changelog), the versioned docs (https://docs.expo.dev) |
| API details | the `AGENTS.md` that `create-expo-app` writes, and Expo's official agent skills (`npx skills add expo/skills`) — prefer them to your training data, which describes an older SDK |

Record the versions you ended up with in `docs/PROJECT_BRIEF.md`. When something breaks on the new SDK, fix forward;
pin one package back only when it is genuinely incompatible, with a dated comment, the issue link and a task to undo it.

**Check these on every new SDK.** Each one changed between two SDKs on the case-study project or while building the
starter, and the same kind of change will come again:

- **Protected routes.** A `Stack.Protected` whose guard is false redirects to the *containing navigator's* anchor; the
  root navigator has none, so a signed-out launch opened on "This screen does not exist". Rule: give every
  `Stack.Protected` a `redirectTo` (signed-out group → home, app group → sign-in), and keep
  `unstable_settings = { anchor }` in group layouts so a deep link to a pushed screen gets its tabs underneath.
- **iOS life cycle.** Apps linked against a new iOS SDK can be required to adopt a new application life cycle (the
  scene-based one, once). One SDK's template did not, and the app crashed before its first frame on the newest OS
  only; a later SDK adopted it natively and the config plugin had to be deleted. Rule: launch the release build on the
  newest iOS, phone and tablet, before every hand-over (the submission skill's launch test).
- **Code shrinking.** Whether R8 runs in Android release builds has changed between templates. Check for a
  `mapping.txt` next to the built artifact; when R8 is on, test every reflection-heavy library in a release build and
  add keep rules through `expo-build-properties` when one breaks; when it is off, turn it on deliberately (stores flag
  unshrunk code with deadlines).
- **Navigation imports.** The router's navigation core has been rewritten before; imports from
  `expo-router/react-navigation` and type names can move. Fix imports from the current API reference.
- **Template-generated agent files.** `create-expo-app` may write `AGENTS.md` and a `.claude/settings.json` enabling
  Expo's agent plugin. Keep both and import `AGENTS.md` from `CLAUDE.md`.
- **Defaults that flip.** Web output (`server` vs `static`), new-architecture flags, typed routes, the React Compiler:
  set the ones you depend on explicitly in `app.json` instead of inheriting a default.
- **The global `fetch`.** Expo can replace the global `fetch` with its own implementation; check which one is live
  before writing uploads (section 3).
- **Android edge-to-edge** is always on in recent React Native; the keyboard rules in section 5 follow from it.
- **TypeScript and Node defaults.** A TypeScript release changed which `@types` packages load by default, and Node's
  test runner renamed a `mock.module` option. Symptoms: `tsc` cannot find Node types (list them in
  `compilerOptions.types`); a deprecation warning in tests (move to the new option name).
- **Peer ranges lag.** A CLI can declare an older TypeScript peer (run it through `npx` instead of installing it), and
  Expo can hold a tool such as `eslint` a major behind its `latest` tag on purpose — accept the version `expo install`
  chooses. `npx expo install <pkgs> -- --save-dev` has put packages from Expo's version map into `dependencies`; move
  them to `devDependencies` with the same version (`create-app.mjs` does).
- **The prebuilt React Native core (iOS).** After every prebuild, confirm the pods used the prebuilt core
  (`grep -c React-Core-prebuilt ios/Podfile.lock`, or whatever the current mechanism is called); a silent fallback to
  a source build produced an app that built and then died at launch (section 12).

**Release builds for the agent** (for Maestro and the launch test): `APP_ENV=e2e npx expo run:ios --configuration
Release --device <udid> --no-bundler` (several minutes cold, about a minute incremental; it then tries to open a
dev-client URL, which is harmless) and, after `APP_ENV=e2e npx expo prebuild --platform android --clean`,
`./gradlew :app:assembleRelease` in `android/` with the JDK from section 11.

**Agent sandbox:** `git init` in a sandboxed shell can fail writing `.git/config` and hook samples — run it with the
sandbox off. Package installs, prebuild, native builds and simulator control need it off too (section 13).

---

## 1. Project and native config

- **Continuous native generation.** `ios/` and `android/` are git-ignored and regenerated by `expo prebuild`. Any hand edit there is lost → every native change is an app-config value or a config plugin in `plugins/`.
- **A plugin must throw when its anchor disappears.** A patch that silently stops applying yields a build that looks fine and is wrong (a debug-signed release).
- **`app.config.js` next to `app.json`:** `expo install` cannot write a plugin entry into `app.json` any more → add plugin entries by hand.
- **A development client is required** once the app has native modules (sign-in, purchases, push); the generic client cannot load them.
- **Sign-in fails on the simulator with a "secure storage" error** → the keychain needs an application identifier even there → set the team id in the app config so simulator builds are signed; an unsigned build cannot store a session.
- **A second `prebuild` without `--clean` still wiped `ios/`** on one SDK → after any prebuild, confirm the pods and workspace exist.
- **Typed routes:** the route-types file is regenerated only when the dev server boots — not by an export or a release bundle → after adding a route, start the dev server briefly before typechecking. CI passes regardless because it has no such file.
- **React Compiler on:** derive state instead of setting it inside an effect (the lint rule enforces it), and read the clock inside handlers, not during render.
- **Pure-logic tests run on Node's own test runner** with a TypeScript loader — no simulator, no heavyweight test framework.
- **Platform files:** inside `thing.ios.tsx`, `import './thing'` resolves to the same file → shared types go in a differently named module.

## 2. Environment

- **A value is `undefined` in release builds only** → public env values are inlined only for literal `process.env.EXPO_PUBLIC_NAME` expressions; `process.env[name]` stays dynamic → one literal read per variable, in one module. The tell: the release bundle contains the variable's *name*.
- **UI that hides itself when unconfigured looks deleted** (social buttons, a divider) → log a clear development warning when a provider is switched off by a missing value.
- **"It is there in the other workspace"** → triage in this order: (1) does this workspace's `.env` have the key — compare key names with `.env.example` and with the working workspace, never print values; (2) development or release build? If only release is affected, the value is read dynamically; (3) only then look at the code, the branch and any remote switch. Fix it where the copy comes from, not in the one workspace.
- **After changing `.env`, clear the bundler cache** before a release bundling step, then search the bundle for the new value.
- **The git-ignored `.env` in a fresh worktree is whatever was copied** → keep `.env.example` complete and make the setup script compare the two.
- **`process.env.EXPO_OS`** is inlined per platform — a cheap way to send a platform header or branch without importing the platform module.

## 3. Networking, uploads, streaming

- **"Upload failed" before any request leaves the app** → when the global `fetch` is Expo's implementation (the default in recent SDKs), it rejects React Native `{ uri, name, type }` form-data parts → send multipart uploads through React Native's `XMLHttpRequest` in a small fetch-shaped wrapper; keep the Expo fetch for everything else because it is the one that exposes a readable `response.body` for streaming.
- **Upload self-tests fail on bundled assets** → the native file handler refuses bundle asset URLs → copy the file into the cache directory first, as a picker would.
- **The server rejects a file whose declared type looks right** → on iOS the part's content type is rewritten from the file *extension* → validate the extension as well as the type.
- **The app stays "offline" after the network returns** → the OS caches its last reachability verdict (the simulator especially) → point reachability at the API's own health endpoint and let any API answer override the verdict.
- **A burst of queries hits the rate limit** → put a token-bucket scheduler in front of the request function; give it an injectable clock so it can be tested; resync if the wall clock moves backwards.

## 4. Navigation and sheets

- **A form sheet's content covers its header (iOS)** → the sheet resizes the first scroll view to the whole sheet → the scroll view must be the sheet's root (or exactly header + scroll view); sticky header rows need an inner row view.
- **A footer cannot be pinned under a scroll view in a native form sheet** → use a page-sheet presentation for content with pinned actions (a consent sheet).
- **"Sheets ignore fit-to-content on tablets"** → false when tested; an A/B screenshot showed correct sizing. Do not add wrappers to fix it without the A/B evidence on your SDK.
- **Navigating to a drawer route from a screen stacked above the drawer pushes a second drawer** → dismiss what is stacked first, then navigate.
- **Presenting a modal while another is closing does nothing, or runs the action twice** → wait for the close animation and make the gate single-flight.
- **A custom font on native tab labels drew over the icons** (on one iOS release) → leave system tab labels in the system font.

## 5. Layout: keyboard, tablet, absolute positioning

- **Inputs stay under the keyboard on Android only** → the app is edge-to-edge (always on in recent React Native), which disables the window resize the manifest setting used to give → `KeyboardAvoidingView` needs `behavior="padding"` on **both** platforms; under a native header pass the header height as the vertical offset. Invisible on iOS-only test runs.
- **An absolutely positioned composer does not rise with the keyboard (iOS)** → an absolute `bottom: 0` child is positioned against its parent's padding box, so the avoiding view's bottom padding is exactly what it ignores → put the composer inside an unpadded `flex: 1` wrapper under the avoiding view.
- **The composer floats too high above the keys** → drop the bottom safe-area inset from its padding while the keyboard is visible.
- **A floating bar hugs the left edge on a tablet** → a node with both `left` and `right` set ignores `alignSelf` → full-bleed positioned parent, centred inner view with a max width.
- **A bottom-pinned button is stranded on a tall screen** → `marginTop: 'auto'` → on wide layouts use a fixed gap and centre the content.
- **Breakpoints are a width question, not a device question** → that covers landscape and split view too.
- **Test the keyboard on the Android emulator** with the on-screen keyboard enabled; on iOS, focus inputs with Maestro taps.

## 6. Text: scripts and scaling

- **Tall-script text is clipped at the top** → the font's own line box is taller than the Latin line height in the design, and the platforms clip differently (iOS cuts the ascent; Android trims both sides) → take line height from the font metrics. For Noto Sans Myanmar the box is 2.18 em, so the rule is `lineHeight ≥ 2.2 × fontSize`, applied by the text primitive even over a caller's style. Measure the same way for any other tall script (Thai, Khmer, Devanagari, Arabic).
- **A placeholder in the second script clips inside an input** → the input still uses the Latin font and falls back to a system font → choose the font from `value || placeholder`.
- **"Make it a little bigger" touches every component** → keep the design's sizes in the type scale and apply one multiplier in the text primitive; store the user's text-size choice on the device; divide each variant's OS font-scale cap by the app scale so total growth stays within what layouts were built for.
- **Text inside fixed-size boxes** (badges, initials, progress rings) passes an explicit font size and is exempt.
- **A native slider through platform files** stays smooth while every text element re-renders; give it its own screen so it does not move under the finger as the page reflows.

## 7. Media, pickers and permissions

- **The server says the file content does not match its type** → at picker `quality: 1` Android copies the *source* bytes into a file named for the source type → keep `quality` below 1.
- **Phone photos are HEIC** → ask the picker for the compatible representation; on iOS `allowsEditing` forces a JPEG re-encode.
- **The reported file size is the source's, not the re-encoded file's (Android)** → measure the file itself.
- **A large PNG exceeds the size cap whatever the quality** → PNG ignores quality → honest, actionable error copy.
- **Voice notes are rejected** → record a format both the API and the model accept; check the model's documented audio types, not only the API's allow-list.
- **An audio background mode appears in the build** → the audio library's plugin enabled background playback by default, adding an iOS background mode and an Android foreground-service permission and service; the video library has similar options → set them off unless the feature exists, then print the generated plist.
- **A permission-copy change does not ship** → iOS reads the localized strings generated from the per-language files first, so editing only the plugin block is a no-op → change the plugin block **and** each language file; keep iOS-only keys under an `ios` key so they do not become Android resources. It needs a native rebuild and cannot ship over the air.

## 8. Sign-in providers

- **Google sign-in returns a developer error on Android** → the app is configured with the *web* client id, but an Android OAuth client must exist for each (package, certificate fingerprint) the running app is signed with: debug, upload, and the store's re-signing key. One client holds one fingerprint — add clients, do not edit the existing one, or local builds stop signing in.
- **The iOS URL scheme** is the reversed iOS client id → derive it in the app config and regenerate the native project after it changes.
- **Sign in with Apple** returns the user's name once → cache it; use Apple's own button; send the raw nonce the backend expects.
- A provider's 401 from your own backend means "token rejected", not "session expired" → map it separately.
- **Providers the case-study project did not use** — Facebook login, phone OTP and others — have no notes here. Each brings its own developer console, its own review, an SDK whose data collection has to be declared in both stores' privacy forms, and platform-specific token behaviour. Read the provider's current documentation and prove the flow in Phase 1; do not rely on recollection.

## 9. Push

- **Nothing arrives and the backend logs "no recipient"** → the push SDK was never initialised (missing app id) or the backend user id was never logged into it → the app id is load-bearing; log the user in and out with the session.
- **The notification extension is a second target** → its own bundle id, the app group, and a deployment target that follows the app's. The plugin's default was tolerated by one Xcode and refused by the next.
- **Production pushes never arrive** → the build used the sandbox push environment → select it from the build profile variable when regenerating for production.
- **Android devices never subscribe** → the provider needs the FCM service-account upload in its dashboard; the app itself needs no extra file for that.
- Ask for the permission once, after onboarding; the OS presents the prompt once per install however often it is requested.

## 10. In-app purchase

- A store-billing provider lives in an **iOS-only platform file**; other platforms resolve a no-op, so they never bundle the store code. Verify by searching the other platform's bundle.
- Purchase results arrive through a listener, not the request's return value. Mount the single listener with the signed-in stack so a transaction replayed after a crash is verified for the right account.
- **Finish the transaction only after the server accepts it** or refuses it for good; leave it open on transient errors.
- Show the store's localized price. Products load in the sandbox only after a build with this bundle id has been uploaded; the simulator returns none without a store configuration file.
- **Which channel a build offers is a remote switch**, not a build flag — it is how a payment option is hidden during review without a release.
- The library adds the Android billing permission even where it is a no-op.

## 11. Android build

- **Native build tasks fail with an odd warning-as-error** → the build tools run a helper under the configured JDK and treat a newer JDK's stderr warnings as failures → use the JDK version React Native's environment-setup guide names (an IDE-bundled runtime may be newer than that); unset any global Java options that print to stderr.
- **Gradle runs out of memory** → raise heap and metaspace in the user-level properties file (the generated project is rewritten on every prebuild).
- `local.properties` with the SDK path is untracked and not written by prebuild.
- **The store wants a bundle**, not an APK; APKs are for emulator checks.
- Long builds exceed a single tool call → run detached and wait on a marker file.
- **Code shrinking** → check whether R8 is on (section 0); the store flags unshrunk code with a deadline.
- A lint failure about extra translations → iOS-only locale keys leaked into Android resources (see section 7).

## 12. iOS build

- **Crash before the first frame on the newest OS only** → apps linked against a new iOS SDK had to adopt a new application life cycle and the template had not → a config plugin plus a newer patch release of the framework fixed it; the next SDK adopted it natively. The general lesson (in the submission skill): launch the release build on the newest OS.
- **The app builds and dies at launch with a missing framework** → the dependency install silently built the core from source when a registry check failed, while other precompiled modules still linked the prebuilt framework → check the lock file for the prebuilt core after every install and make the install fail loudly instead of falling back.
- To check that a workspace compiles without touching signing, build for a generic device with code signing disabled, then read the versions out of the built app.
- After a clean regeneration, tell the human to close and reopen the workspace in the IDE.
- Do not set `CI=1` for a development run — it turns off watch mode.

## 13. Tooling

- Under a sandboxed tool shell: package-manager commands, prebuild, native builds, simulator control and Maestro need the sandbox off; typecheck, lint, tests and bundle export run inside it. The package manager's error blames file ownership, not the sandbox.
- The temp directory differs between sandboxed and unsandboxed shells → write logs to absolute paths.
- In zsh, `status` and `path` are special variables — do not use them as names in scripts.
- Reload a development client with a `localhost` URL, not the LAN address the CLI prints; the simulator shares the host's network and the LAN address changes.
- Each workspace's dev server needs its own port.
- The package manager may hold back package install scripts until they are approved; the test runner's `esbuild` works without its postinstall.
