# Verification — being your own tester (Phases 2 and 5)

Eighteen percent of the prompts on the case-study project were a person reporting what a device showed them. Almost every one was something the agent could have seen first — had it been able to look, on the right device, at the right moment. This file is about building that ability before the features, and then using it systematically.

## Contents

1. The ladder
2. The device matrix
3. Instruments
4. Driving simulators and emulators
5. Account safety
6. The hardening matrix
7. Evidence in reports
8. Traps that produced false results

---

## 1. The ladder

| Rung | Proves | Does not prove |
|---|---|---|
| 1. Typecheck, lint | It compiles | Anything a user sees |
| 2. Unit tests | The pure logic | The wiring |
| 3. Production bundle export, both platforms | Imports, platform files, the release env guard | Runtime behaviour |
| 4. Debug run on one simulator | It renders there | The other platform, tablets, release builds |
| 5. Device matrix | It works where users are | Release-only failures |
| 6. Release build launch | The shipped binary starts | Store rules |
| 7. Submission audit | The known rejection classes | The reviewer's judgement |

In every report, state the **highest rung reached per target**. "Typecheck and tests pass" describes rung 2 and says nothing about Android.

## 2. The device matrix

Declare it in the brief. A workable default:

| Target | Why it is in the matrix |
|---|---|
| iPhone simulator, current OS | Baseline |
| iPhone and iPad simulators, **newest** OS installed | Reviews run on the newest OS; SDK life-cycle changes surface only there |
| iPad simulator | Reviewers use tablets even for phone apps; layout |
| Android phone emulator with a store image | Keyboard, edge-to-edge, system back, fonts — and it can be tapped |
| A real mid-range Android phone (the human's) | Real keyboard, real performance; at checkpoints |
| A real iPhone (the human's) | Push delivery, sandbox purchase, camera |

Cross it with language, text size (default and largest) and session state (guest, signed in) — but do not multiply blindly:

- **Every slice:** one iPhone and one Android phone, in the primary language, with the slice's new layouts also opened at tablet width and in the second language.
- **Each batch of slices:** the full tour on one iPhone and one Android phone.
- **Hardening (Phase 5):** the whole matrix — tablet, the second language and the largest text as passes over every text-heavy screen and form.

## 3. Instruments

Build these in Phase 2. Each one replaces a class of human bug report.

### QA tour

A dev-only runner that is compiled in by a build flag and never present in a normal build. It:

- signs in with QA credentials passed as **build-time environment values** (never in files);
- **refuses to run on any other account** — simulators keep whoever signed in last;
- walks a list of steps covering every route in the screen inventory, with a fixed dwell per step;
- prints a marker per step (`[qa-tour] 12/39 habits`);
- supports "stay here" steps for watching something finish, and actions that are not navigation (open the drawer);
- exercises real paths on the QA account only — one message through the real send path, one upload through the real upload path — and grants whatever consent those paths wait on.

The output is one screenshot per step: the contact sheet for review rounds, and the fastest way to notice that screen 27 broke while you were working on screen 4.

### Deep links

Every screen reachable by URL. That is how you put the app into a state without tapping, on any device, in a release build.

### Screenshots

- iOS simulator: `xcrun simctl io <udid> screenshot <absolute path>`
- Android: `adb exec-out screencap -p > <absolute path>`

Use absolute paths; the temp directory can differ between sandboxed and unsandboxed shells, and a file written to the wrong one silently does not exist.

### Taps and typing: Maestro

**Maestro drives both the iOS simulator and the Android emulator.** It was proven against the starter's release builds
on the then-newest iOS simulator and Android emulator: a guest flow and a sign-in → save → consent → streamed answer →
sign-out flow passed on both. On the case-study project nothing could tap the iOS simulator, which left the agent
unable to focus an input, drag a slider or dismiss a system alert on iOS; Maestro closes that gap.

Setup (once per workstation):
- **macOS:** `brew tap mobile-dev-inc/tap && brew install mobile-dev-inc/tap/maestro` (or `brew upgrade maestro`).
- **Linux:** `curl -Ls "https://get.maestro.mobile.dev" | bash` (drives Android emulators; iOS builds use EAS cloud builds + macOS runners).
- **Windows:** install Maestro and JDK 17/21 + Android Studio Platform Tools (`adb.exe`).

Maestro runs on Java: macOS's `/usr/bin/java` is only a stub, and Linux/Windows installs often omit `JAVA_HOME`. The starter's `npm run e2e` (`scripts/e2e.mjs`) automatically resolves `JAVA_HOME` and `adb` across macOS, Linux, and Windows; if `maestro --version` fails in your shell, set `JAVA_HOME` manually (on macOS, `$(brew --prefix openjdk)/libexec/openjdk.jdk/Contents/Home`). Check Maestro's docs for the Xcode and Java versions it supports when a new Xcode ships. Prove it in Phase 1 with a two-step flow against the system Settings app (`com.apple.Preferences` / `com.android.settings`) before any app exists.

Conventions that made the flows reliable:

- **Find elements by `testID`**, not by text: text changes with the language and the copy. Every control a flow touches
  gets a `testID`; Maestro's `id:` matches it on both platforms.
- **Start every flow clean**: a shared `fresh-launch` subflow with `launchApp: { clearState: true, clearKeychain: true }`
  and a wait for the first screen. `clearKeychain` matters on iOS — tokens live in the keychain, which `clearState`
  alone does not wipe.
- **Expect the system to interrupt**: iOS offers "Save Password?" after a login form, Android password managers do the
  same. A `dismiss-system-prompts` subflow taps "Not Now" only `when: visible`.
- **Make platform differences conditional**, not separate flows: hiding the keyboard on iOS can press the return key and
  submit the form, so tap the submit button only `when: visible`; going back is UIKit's `BackButton` id on iOS and the
  system back on Android (a `back` subflow with `when: platform`).
- **Run against release builds** pointed at a local mock API — the same backend on every run. The iOS simulator reaches
  the Mac's `localhost`; the Android emulator needs `adb reverse tcp:<port> tcp:<port>`, and an Android release build
  refuses plain http unless that build type allows cleartext (the starter's `APP_ENV=e2e` does it for that build only).
- **One runner, one mock**: two e2e runs in parallel fought over the mock API's port; the runner now reuses a mock that
  is already up and leaves it running.
- **Use devices nobody is signed into.** Flows clear app data. Create a dedicated simulator and AVD for agent runs
  (`xcrun simctl create`, `avdmanager create avd`).
- Failure artifacts (screenshot and view hierarchy per step) land in `~/.maestro/tests/<timestamp>/`; read the
  hierarchy before guessing — it showed a "not found" screen, then a "Save Password?" sheet, in two seconds each.

Without Maestro: `adb shell input tap <x> <y>` / `input text` on Android (scale coordinates from the screenshot), and on
iOS deep links plus, for a tap-only control, a temporary dev-only timer that calls the real setter (screenshot before and
after, relaunch to prove persistence, remove the code).

### Logs as triggers

`console.log` survives in release builds on both platforms. Follow the device log and act on markers instead of guessing delays:

- iOS: `xcrun simctl spawn <udid> log stream --style compact --level debug`
- Android: `adb logcat -v brief ReactNativeJS:V '*:S'`

### Contract smoke

The Phase 1 script, kept as a package script and rerun when the backend changes (`02-api-contract.md`).

## 4. Driving simulators and emulators

Notes that each cost a wasted run on the case-study project. Tools change between releases — check a note against the versions in front of you.

- Simulator, emulator, package-manager and native-build commands usually need the tool sandbox off; code checks do not.
- **First-launch permission alerts cover every frame** and cannot be dismissed without taps. Prime them: launch, wait for the alert, terminate, restart the simulator's home-screen process, launch again. Verify with one screenshot before spending minutes on a tour.
- Development-client overlays and onboarding sheets cover screenshots; switch them off through the app's defaults.
- `simctl status_bar <udid> override --time "9:41" …` gives clean frames for store screenshots.
- On the simulator the keychain still needs a signing team; an unsigned build cannot store a session and sign-in fails with a storage error.
- A newer OS may ask "Open in …?" for a custom URL scheme; pre-approve the scheme in the simulator's preferences.
- Android: check `adb devices` before starting an emulator — one is often already running. Headless start, then wait for `sys.boot_completed`. Enable the on-screen keyboard explicitly to test the soft keyboard. A browser's first-run screen can steal the foreground and freeze a tour — disable the browser for the run and re-enable it afterwards.
- To switch the app's language without taps, change the stored setting while the app is terminated, and **put it back**.
- A release build signed with a different key will not install over the existing app, and uninstalling loses the session. For emulator checks, sign the test build with the same key as the installed one.
- Never reuse a build directory across a regenerated native project — stale objects fail in ways that look like the bug you are hunting.
- A dev client only needs rebuilding when native dependencies changed; a pure JavaScript change loads from a fresh workspace's dev server in seconds. Compare the date of the last native dependency change with the installed client before rebuilding.

## 5. Account safety

- **Anything that writes runs on the QA account.** The tour enforces it.
- **The human's simulators hold the human's sessions.** Look, do not send. Run automated flows on a spare device with a fresh keychain.
- Resetting a simulator keychain signs its user out — say so before doing it, and prefer it to erasing the device.
- Destructive flows — delete account, cancel subscription, change password — are not exercised even on the QA account unless asked.
- Screenshots of a personal account are personal data; ask before using them in store listings.

## 6. The hardening matrix

Run every row before the first submission. "Seen" is what the row cost the case-study project when it was found by a person instead.

| # | Dimension | Check | Seen |
|---|---|---|---|
| 1 | Tablet, split view, landscape | Every screen holds a centred column; sheets size to content; primary buttons are not stranded at the bottom of a tall screen | 51-file retrofit; floating composers hugged the left edge |
| 2 | Keyboard | The focused field and the primary action stay visible on **both** platforms; the keyboard closes when a drawer or sheet opens | Composers under the keyboard on Android for a week |
| 3 | Tallest script at the largest text size | No clipping in titles, chips, inputs, buttons; fixed-size boxes opt out | Clipped glyph tops across the app |
| 3b | RTL (`ar`, `he`) & text expansion (`de`, `ru`, CJK) | Logical `start`/`end` spacing, mirrored directional icons, 30–40% width headroom, no unintended truncation | — |
| 4 | OS font scale at maximum | Layouts hold within the caps | — |
| 5 | Offline → online | Banner appears and clears; data resumes without a restart | App stayed "offline" after the network returned |
| 6 | Session | Expired access token refreshes silently; a refused refresh signs out; a transient failure does **not**; sign-out works offline | "Does the refresh token really work?" |
| 7 | Account switch | Nothing from the previous account — data, drafts, reminders — survives | — |
| 8 | Guest | Every account-only route opened by deep link shows the sign-in prompt, never a crash; a guest's draft survives signing in | Rejection, then 35 routes wrapped |
| 9 | Cold-start deep link, push tap | Lands on the right screen from a terminated app | — |
| 10 | Permissions denied | Camera, photos, microphone, notifications: an explanation and a route to settings | — |
| 11 | Uploads | Each accepted type; a rejected type; an oversized file; the phone's default photo and audio formats | Three separate failures |
| 12 | Streaming | Sent once; the view follows the reply; no leftover indicator when it ends; abort works | One indicator bug reported four times |
| 13 | Fresh install | Default language, onboarding, when each permission prompt appears | Default language reversed |
| 14 | Slow network | Spinner → time-out error → retry | — |
| 15 | Purchases | Products load; buy → verify → entitlement; restore; cancel; a transaction replayed after a crash | Sandbox needs a real device and an uploaded build |
| 16 | Empty account | Every list has an empty state | — |
| 17 | Long content | Long names, long messages, large numbers | — |
| 18 | Release build | Launches on the newest OS, phone and tablet | Rejection for a launch crash |

Report each row as pass, fixed, or a limitation the human accepted.

## 7. Evidence in reports

```markdown
## Verified
- iPhone (simulator, current OS), debug: QA tour 39/39 — contact sheet at <path>
- Android phone (emulator, store image), release APK: composer above the keyboard on 3 screens (real taps); text size 140%
- iPad (simulator): 12 text-heavy screens by deep link, both languages

## Not verified
- Push delivery and sandbox purchase — need a real device
- Soft keyboard at the largest text size on Android — the emulator was in hardware-keyboard mode
```

Embed the screenshots that matter. "Not verified" is not an admission of failure; it is the list of what the human should look at, and leaving it out is how surprises reach them.

## 8. Traps that produced false results

- **Guessed screenshot timing** was read as a feature bug several times. Trigger captures from log markers.
- **The tour had silently stopped** and nobody noticed. Count the markers.
- **The tour ran on the wrong account** and sent a message from it. Hence the account guard.
- **QA credentials were left out of the build command**; the tour sat on the sign-in screen and the whole run was wasted.
- **A stale native project** — the old build was tested. Compare the version and build number inside the built app with the config.
- **A plausible claim was "fixed" without testing it** ("sheets ignore content sizing on tablets"). An A/B screenshot showed the claim was false, and the fix was reverted. Test the claim before fixing it.
- **An empty filter result on a build log was taken as success.** Read the log; make filters case-insensitive.
- **Simulator connectivity lies** after the host reconnects. Trust an API answer over the OS verdict.
