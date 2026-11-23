# Release — from approved numbers to a hand-over

A release build is a different program from the one you have been running. It reads its environment at bundle time, is signed by a different key, may be shrunk, and is linked against whatever SDK the toolchain shipped this month. On the case-study project three separate failures had the same shape — *the build is green, the upload succeeds, and the app dies before its first frame* — and one of them reached a reviewer.

## Contents

1. The release sequence
2. Version numbers
3. Build provenance
4. Environment guards
5. Signing
6. Verify the artifact
7. The release launch test
8. Hand-over report
9. When a reviewer objects
10. Between releases

---

## 1. The release sequence

1. The submission audit has no unaccepted FAIL (`01-store-compliance.md`).
2. **Propose the version and build numbers** — a dry run, shown as a table — **and wait for approval.**
3. Commit the bump with the feature work → PR → merge. Confirm the local tree equals the default branch.
4. **Regenerate the native projects for production.** A stale native project re-uploads the previous build number, and the store rejects it only after the upload.
5. Build the release artifacts.
6. Verify each artifact (section 6).
7. **Launch-test** the release build on the newest OS, phone and tablet (section 7).
8. Save artifacts where agreed, under the agreed names; never overwrite; compare checksums after copying.
9. Send the hand-over report (section 8).

Whoever holds the signing identity does the final archive and upload. On the case-study project the owner archived and uploaded iOS themselves and the agent built the Android bundle; the agent's job on iOS was to hand over a workspace that had already been compiled and launched.

## 2. Version numbers

- The **marketing version** is what people see; the **build number** must be strictly higher than anything the store has accepted. Keep build numbers in lockstep across platforms.
- **One script** moves everything that has to move together: the config's version, both native build numbers, and the in-app version constant that also busts the persisted cache (`assets/expo/bump-build.mjs`, with `--dry-run`). Left behind, a 1.1.0 build reports 1.0.0 and reads the previous version's cache.
- **Ask what "minor" means.** On the case-study project a small release meant 1.0.0 → 1.0.1; a semver-style 1.1.0 proposal was corrected. Never raise the major version unasked.
- Reusing a build number is refused *after* the upload — a slow way to find out.

## 3. Build provenance

- Release builds come **only from the merged default branch**. Record the commit hash in the hand-over.
- Never from uncommitted work or a feature branch, however small the change.
- A build that was uploaded and later found defective gets an explicit **"do not submit"** note. One build on the case-study project sat in the console carrying the same launch crash as its rejected predecessor.

## 4. Environment guards

- A release bundle made without its environment file **still exits 0** and then throws at start-up. Make the build refuse instead (for Expo: an `app.config.js` guard — the react-native-expo-app-builder skill's starter ships one in `assets/starter/app.config.js`, together with a guard that refuses store builds still carrying placeholder identity or legal URLs).
- **Prove the values were inlined**: search the release JavaScript for a known public value. If the bundle contains the variable's *name* instead, it was read dynamically and is `undefined` at runtime. (Bytecode will not match a plain search — check the pre-bytecode export or use `strings`.)
- The **push environment** follows the build profile. A release built without the production flag talks to the sandbox push service, and production pushes silently never arrive.
- In a fresh worktree, confirm the environment file is present and complete before building.

## 5. Signing

**Android**

- The upload keystore lives outside the repository; its credentials live in the user-level build properties file with owner-only permissions. Nothing about it goes into the repo, a PR, a chat or agent memory.
- A config plugin wires release signing and **falls back to the debug key when the credentials are absent**, so a local release test build needs no keystore (`assets/expo/with-upload-signing.js`). The plugin throws if the template it patches changes shape — a silently skipped patch would produce a debug-signed "release" that only the store rejects.
- Back up the keystore and both passwords the day they are created.
- **Three certificates, three fingerprints**: debug, upload, and the store's own re-signing key. Social sign-in needs an OAuth client for each one the running app can be signed with.

**iOS**

- Automatic signing with the paid team. Every target needs a profile and its capabilities — a notification service extension is a second bundle id and needs the app group too.
- An extension's deployment target has to follow the app's. A default left at an ancient value was tolerated by one toolchain version and refused by the next.
- A toolchain upgrade between two releases can break archiving or launching. After any upgrade, rerun the launch test before trusting the pipeline.

## 6. Verify the artifact

Before anything is handed over or uploaded:

| Check | How |
|---|---|
| Signed by the right key | Print the certificate from the bundle — the owner must not be the debug certificate |
| Version and build | Read them from **inside** the built artifact and compare with the config |
| Environment values present | Search the bundled JavaScript for a known public value |
| Background modes, permissions, services | Print them from the generated plist and the merged manifest; compare with what the app uses |
| Usage descriptions | Present for every permission requested, in every language |
| Minimum OS of every target | Read from the built app and its extensions |
| Native project freshness | The generated project's version equals the config's |

## 7. The release launch test

`assets/expo/ios-launch-test.mjs` — proven on the case-study project, both ways (a deliberately broken project fails with the system's own crash frame; the real project passes).

What it does:

1. checks that the generated native project matches the config's version and build — a stale project is how a fixed bug ships anyway;
2. deletes its build directory — objects from a differently configured project fail in ways that look like the bug being hunted;
3. builds the **Release** configuration for the simulator;
4. picks the **newest** installed OS runtime and one idle tablet plus one idle phone on it;
5. installs, launches, waits, and passes only if the process is still alive and no new crash report appeared;
6. on failure prints the crash's top frames;
7. never uninstalls the app and only uses simulators that were shut down, so a device holding someone's session is left alone.

It takes about ten minutes. Run it after the production regeneration and before every hand-over.

**Android equivalent:** install the release build on an emulator, launch it, confirm the process is alive after a few seconds and the log shows no fatal exception. When code shrinking is on, also walk every library that relies on reflection — sign-in, purchases, push, media — in the release build; shrinking breaks things only there and only at runtime, so switch it on as its own tested release, never as a last-minute toggle.

**Why a launch test and not just three guards.** Each of the three failures now has its own guard: a missing app life-cycle the new SDK required, a dependency install that silently fell back to a different build mode, and a bundle made without its environment. The launch test is the net under the fourth one nobody has met yet.

## 8. Hand-over report

```markdown
## Release <version> (<build>) — built from main @ <commit>

**Android** — <absolute path>/<app>-<version>-<build>.aab
signer: upload certificate · versionCode 9 · sha256 <…>

**iOS** — workspace at <absolute path>/ios/App.xcworkspace
regenerated for production · launch-tested on <tablet> and <phone>, newest OS

**Your next steps**
1. Close and reopen the workspace in Xcode — the native project was regenerated under it.
2. Product → Archive → Distribute.
3. In the console: select build <build>, attach the subscriptions, paste the review notes below.

**Review notes** — <text>
**Not verified** — push on a real device; sandbox purchase.
**Accepted risks** — <from the audit>
```

Absolute paths, exact clicks, nothing the human has to ask for.

## 9. When a reviewer objects

See `03-rejections.md`: the protocol, reply templates and the classes seen.

---

## 10. Between releases

- **Console notices** after an upload: for each, is there a deadline, and is the code yours or a library's? Schedule the real ones as tested work.
- Keep a short **release history** in the brief: version, build, commit, outcome, and which builds must not be submitted.
- Watch the **toolchain**: a new OS or IDE version is a reason to rerun the launch test today, not at the next release.
