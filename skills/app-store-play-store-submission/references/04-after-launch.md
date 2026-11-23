# After launch — keeping an approved app approved

Approval is not the end of store work. Stores add requirements with deadlines, SDKs move under the app, and crashes
that no simulator showed arrive from real phones. This file is the standing checklist for the months after release.
Dates and thresholds change every year — check the linked pages before relying on a number.

## Contents

1. Crash reporting
2. Console notices and deadlines
3. Annual platform deadlines
4. Over-the-air updates
5. Staged rollouts and monitoring
6. SDK upgrades
7. The release log

---

## 1. Crash reporting

The case-study app shipped with a root error boundary and no crash reporting — nothing caught errors thrown outside
render (handlers, timers, promises), and nothing reported anything. A crash on a user's phone was invisible until a
reviewer or a customer mentioned it.

- Choose a reporter (Sentry, Firebase Crashlytics, or the store consoles' own crash pages as a minimum) **before the
  first release**, and declare it in both stores' privacy forms.
- Wire the error boundary's `componentDidCatch` **and** the global handler for errors outside render.
- Upload symbols with every release build (dSYMs for iOS, mapping files for Android once R8 is on, source maps for the
  JS bundle) — an unsymbolicated stack is a guess.
- Review crashes weekly; a new crash in a new version blocks the next feature release until it has a cause.

## 2. Console notices and deadlines

After each upload, read the release dashboard of both consoles. For each notice decide two things: **is there a
deadline**, and **is the code ours or a library's**?

Seen on the case-study project (Google Play, after the first upload):

| Notice | Deadline | Whose code | Action |
|---|---|---|---|
| DEX code optimization below threshold (almost no obfuscation) | A dated threshold for apps above a DEX size — read it in the notice | The app's build config — R8 was off | Turn R8 on as its own tested release (check first whether the current Expo template already enables it); walk every reflective library in a release build |
| Deprecated edge-to-edge APIs | none | React Native core and Material components | Nothing; goes away with library upgrades |
| Restore Credentials (zero-tap sign-in restore) for apps with sign-in | A dated deadline in the notice | The app | Plan it before the deadline |

Never treat a deadline notice as a last-minute toggle: the R8 change only breaks things at runtime, in release builds.

## 3. Annual platform deadlines

- **Google Play target API level:** new apps and updates must target a recent Android API level, with the deadline
  usually at the end of August each year. Check the current requirement in the Play Console and on
  <https://developer.android.com/google/play/requirements/target-sdk>.
- **Apple minimum SDK / Xcode:** App Store Connect starts requiring builds made with a recent Xcode and SDK, usually from
  late April each year. A new Xcode can also change what *runs*: on the case-study project, building with the new SDK
  made the app crash at launch on the new iOS until it adopted a new app life cycle — which is why the release launch
  test runs on the newest OS.
- Put both dates in the project brief's release section each year.

## 4. Over-the-air updates

Decide knowingly (the project brief records it):

- **Without OTA**, every fix — including a one-word copy change — is a new binary and a new review.
- **With OTA** (for example EAS Update), JavaScript and assets can ship without review, within the stores' rules: no
  new native code, no change to the app's purpose. Pin updates to a runtime version that changes whenever native code
  changes; never ship an update that needs a native module the installed binary lacks.
- Native configuration (permissions, plist strings, plugins) never ships over the air.

## 5. Staged rollouts and monitoring

- Google Play: roll out to a percentage, watch crashes and ANRs for a day or two, then widen. Halt on a new crash.
- App Store: phased release for automatic updates, spread over several days; pause it if a crash appears.
- Watch the first hours of every release in the crash reporter and the reviews.

## 6. SDK upgrades

- Upgrade to each new Expo SDK when it reaches `latest` (several a year): `npx expo install expo@latest && npx expo
  install --fix`, as its own PR with the full device matrix and a release launch test — never folded into a feature
  release.
- Each upgrade is a chance to delete workarounds: list them in the brief with "delete when SDK N". On the case-study
  project a life-cycle config plugin was written for one SDK and became unnecessary in the next.
- Read the SDK's changelog for breaking changes before upgrading; one upgrade on the case-study project, for example,
  changed how protected routes fall back (`Stack.Protected` redirects to the containing navigator's anchor).

## 7. The release log

Keep, in the project brief: version, build, commit, date, store outcome, and **which builds must not be submitted**
(a build uploaded before a crash was found stays in the console and can be selected by mistake).
