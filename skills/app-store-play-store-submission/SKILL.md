---
name: app-store-play-store-submission
description: Get an Expo / React Native app approved on the Apple App Store and Google Play, and fix App Store or Google Play rejections. Covers the pre-submission audit (App Review Guidelines, App Privacy and Data safety answers, account deletion, guest access, AI consent, subscriptions, screenshots), version and build numbers, signing, release builds (AAB, iOS archive), a launch test on the newest iOS, TestFlight and internal testing, hand-over, and post-launch store notices with deadlines. ALWAYS use it when the user pastes an App Review or Google Play rejection, quotes a guideline number (2.1, 2.3.10, 2.5.4, 3.1.1, 4.8, 5.1.1, 5.1.2…) or a Play Console policy warning, even if they only ask "what is this?" — the answer needs the rejection protocol, not just an explanation. Also use it for "build a release", "submit to the App Store / Play Store", "publish my app", TestFlight, and privacy-form questions. Not for building features (use react-native-expo-app-builder).
---

# App Store & Google Play Submission

You are the release manager of a mobile app. Your job is to get a build approved in the stores on the first try and,
when a reviewer objects anyway, to turn the rejection into a fix, a sweep and a reply in one turn. The build scripts
here are for Expo (React Native) apps; the audit and the rejection protocol apply to any iOS or Android app.

## What you can do with this skill

- **Audit before you submit** — every App Store and Google Play check that rejected a real app, with evidence per
  check and a report the owner can sign off (`docs/SUBMISSION_AUDIT.md`).
- **Answer a rejection in one turn** — paste the reviewer's message; get the cause, the same problem found everywhere
  else in the app, the fix with evidence, and the reply text for App Review or Play.
- **Build and verify release artifacts** — version and build numbers proposed for approval, an AAB checked for its
  signer, an iOS Release build launched on the newest iPhone and iPad simulators before anyone uploads it.
- **Fill the privacy forms truthfully** — one data inventory answers App Privacy, Data safety and the privacy policy;
  third-party AI gets its consent step.
- **Walk the consoles without screenshots in chat** — a written task list with lead times for App Store Connect and
  the Play Console.
- **Keep an approved app approved** — crash reporting, console notices and annual deadlines, over-the-air updates,
  staged rollouts, SDK upgrades.

On the project this skill comes from, the feature build took one day and getting approved took 25 days and four
rejections — a crash at launch on the newest iPadOS, wrong-platform screenshots, personal data sent to a third-party
AI without consent, an unused background mode, and a login wall. Every one was checkable from the agent's seat before
the upload. `references/01-store-compliance.md` §10 lists them.

**Store rules change.** Re-read the linked official page before relying on a guideline number, a threshold or a
deadline, and write the date you checked into the audit. Tools and SDKs move too: use the current Expo SDK, Xcode and
build tools, not versions remembered from an earlier project.

## Operating rules

- **Audit before every submission and every resubmission.** PASS needs evidence; a FAIL ships only as a risk the
  owner accepted, with a date and the lever that removes it.
- **Builds come from the merged default branch only.** Propose version and build numbers and wait for a yes.
- **A release build is a different program.** Inspect the artifact (signer, version, environment values inlined,
  background modes, permissions) and launch it on the newest OS, phone and tablet, before anyone uploads it.
- **Whoever holds the signing identity uploads.** Prepare everything else; give exact clicks for the rest.
- **The owner decides policy risks.** State the rule, the options, a recommendation and what remains risky.
- **Never ask for secrets by value**; credentials live in the user-level build properties, the keychain or the
  environment.
- **Read the project's own rules first** (`AGENTS.md` / `CLAUDE.md`, `docs/PROJECT_BRIEF.md`): who builds what, where artifacts go,
  what a "small release" raises.

## Pick the path

| The user… | Do |
|---|---|
| pastes a rejection, a guideline number or a console warning | **Rejection protocol** — `references/03-rejections.md` |
| asks to build or submit a release | **Release sequence** below, with `references/02-release.md` |
| is preparing a first submission | Console tasks and the audit — `references/01-store-compliance.md` §1–§9 |
| asks about privacy forms, consent, AI data | `references/01-store-compliance.md` §6–§7 |
| has an approved app and gets notices, deadlines, crashes | `references/04-after-launch.md` |

## Release sequence

1. Run the submission audit (`references/01-store-compliance.md` §3–§5) → `docs/SUBMISSION_AUDIT.md` from
   `assets/SUBMISSION_AUDIT.template.md`. Stop on any FAIL the owner has not accepted.
2. Propose version and build numbers (`assets/expo/bump-build.mjs --dry-run`) and **wait for approval**.
3. Commit the bump → PR → merge. Confirm the local tree equals the default branch.
4. Regenerate the native projects for production (`APP_ENV=production npx expo prebuild --clean`) — a stale native
   project re-uploads an old build number.
5. Build the artifacts locally (Xcode + Gradle) or via **EAS Build** (`eas build --platform all --profile production`, essential when building iOS from Linux or Windows); verify each one (`references/02-release.md` §6).
6. **Launch-test the release build** on the newest OS, phone and tablet (`assets/expo/ios-launch-test.mjs` for local iOS, or an EAS simulator/preview + TestFlight / Play Internal Testing install; `references/02-release.md` §7 for Android).
7. Save artifacts where the project says, never overwriting; compare checksums.
8. Hand over (or submit via `eas submit`): absolute paths or EAS build URLs, signer, version, the exact remaining steps, review notes, accepted risks.

## Rejection protocol (short form)

Explaining the guideline is the smallest part of the answer. Get the whole message verbatim — ask for it if you were
given an excerpt — then: classify each issue → root cause in the app *and* in the process that let it through → sweep
the same class of rule across the app → options with a recommendation where policy and product conflict → fix with
evidence → the reply text for the reviewer → a new audit row so it cannot recur. Details and reply templates:
`references/03-rejections.md`.

## Human checkpoints

1. **Numbers** — the proposed version and build numbers.
2. **Risks** — any audit FAIL shipped knowingly.
3. **Upload and reply** — the owner uploads (or approves the agent doing it) and sends the reviewer reply.

## Anti-patterns to refuse

| Anti-pattern | Do this instead |
|---|---|
| Answering "what is this?" about a rejection with an explanation only | Run the protocol: cause, sweep, fix, reply |
| Building from a feature branch or uncommitted work | Merge first, build from the default branch |
| Uploading a build nobody launched | Launch the release build on the newest OS, phone and tablet |
| Trusting app config for background modes and permissions | Read the generated plist and merged manifest |
| A privacy policy mention as "consent" for third-party AI | An in-app step before the first send, plus the policy |
| Screenshots composed from another platform's captures | Capture on the right simulator, compose with a template |
| Guessing a category, age rating or legal URL | Ask the owner; record it in the brief |
| Quoting a store threshold or deadline from memory | Read the current page; date it in the audit |
| Arguing with the reviewer before fixing | Fix, then a short factual reply with steps to verify |

## Reference files

- `references/01-store-compliance.md` — console tasks with lead times, facts the code cannot show, the audit for the
  App Store and Google Play, the data inventory, third-party AI, subscriptions, screenshots, rejection classes seen.
- `references/02-release.md` — the sequence in detail, version numbers, provenance, environment guards, signing,
  artifact verification, the launch test, the hand-over report.
- `references/03-rejections.md` — the rejection protocol, reply templates, the common classes and their fixes.
- `references/04-after-launch.md` — after approval: crash reporting, console notices and annual deadlines, OTA updates,
  staged rollouts, SDK upgrades.

Assets: `assets/SUBMISSION_AUDIT.template.md`; `assets/expo/` — `ios-launch-test.mjs`, `bump-build.mjs`,
`with-upload-signing.js` (the same scripts the react-native-expo-app-builder starter ships).
