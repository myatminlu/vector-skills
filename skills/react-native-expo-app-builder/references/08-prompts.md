# Prompts — what the human writes, and what the agent sends back

Short prompts are fine. On the case-study project the median prompt was 55 characters, and the short ones that carried a screenshot or a document were the most efficient turns of all. What cost time was not brevity — it was missing context that only the human had, and the same request arriving in pieces.

The templates are in English; write them in any language.

## Contents

1. Prompt patterns that worked
2. Kickoff
3. Answering the kickoff message
4. A new API guide
5. A bug
6. A design change
7. A review round
8. A release
9. A store rejection
10. A console question
11. A standing rule
12. Prompts to replace
13. What the agent sends back

---

## 1. Prompt patterns that worked

| Pattern | Why it worked |
|---|---|
| **A screenshot and one sentence** | The defect is visible; most such turns closed in 3–15 minutes |
| **A backend document and "implement this"** | The document is the spec; eleven of them each became a PR with little back-and-forth |
| **The whole message, pasted verbatim** — a reviewer's email, a console warning, a crash log, the backend agent's reply | Nothing lost in paraphrase; one pasted rejection became one turn that fixed three issues |
| **A one-sentence product decision** | "No guest accounts in the database." "1.0.1, not 1.1.0." It ends a whole branch of options |
| **An approval gate** — "show me the version numbers first" | Outward-facing steps stay in the human's hands |

## 2. Kickoff

```
Build a new mobile app from the attached design and API reference.
Use the react-native-expo-app-builder skill.

Attached: <design export> · <API reference> · <logo and icon files>
Brief:    docs/PROJECT_BRIEF.md  (or: "not written yet — ask me everything in one batch")

First read everything, then send me one short message: your questions with a
recommendation for each, what you assumed, and my task list. Do not build screens yet.

QA account: QA_EMAIL / QA_PASSWORD are in .env.local — not in chat.
Reports in <language>.
```

If the brief is filled in, the first reply can be the gap report and the plan instead of questions.

## 3. Answering the kickoff message

```
1A 2A 3B 4A.
Defaults fine, except: default language is English.
Team id: <id>. Bundle id: com.example.app.
```

A few characters per decision is the point of the format. "All recommended" is a complete answer.

## 4. A new API guide

```
@GUIDE.md — implement this.
Affects: profile screen, onboarding step 2.   Not included: admin endpoints.
```

The agent probes the endpoints before building and reports where the guide and the server disagree.

## 5. A bug

```
<screenshot>
Did:      sent a voice note
Saw:      "Upload failed"
Expected: the note appears in the chat
On:       <device and OS version>, build <version (build)>, <language> UI
```

When the defect is visible in the screenshot, the screenshot and one sentence are enough. Root cause and the same-pattern sweep are standing rules — there is no need to ask for them.

To get an explanation without a code change, say **"explain only"**.

## 6. A design change

```
What:       restore-purchases becomes a text link
Where:      plans screen, under the subscribe button
Reference:  <screenshot or app name>
Done when:  the link is under the button on phone and tablet, in both languages
Not in it:  the paywall sheet
```

One sentence also works; the agent restates it in this shape and proceeds.

## 7. A review round

Reply to the numbered contact sheet in one message:

```
3: ok.  7: move the floating button into the header.  12: too much space under the tip.
14: the title is clipped in Burmese.  Everything else is fine.
```

## 8. A release

```
Prepare a release with what is on main. Small release — raise the last digit.
Show me the numbers first.
```

then

```
Approved: 1.0.2 (10). PR and merge first, then build.
```

## 9. A store rejection

Paste the entire message and attach whatever came with it. Then:

```
Tell me the cause, the fix, what else in the same class could be rejected,
and give me the text to reply to the reviewer.
```

## 10. A console question

In a separate release-helper workspace, not in a feature branch:

```
<screenshot of the console page>
I am trying to: create the subscription group.   What do I enter here?
```

Say what you were trying to do. A console screenshot with no words leaves the agent guessing which of ten fields is the question.

## 11. A standing rule

```
Remember: Android bundles always go in <folder>, named app-<version>-<build>.aab.
Put it in CLAUDE.md.
```

Agent memory stays on one machine and one folder. `CLAUDE.md` travels with the repository.

## 12. Prompts to replace

| Instead of | Write | Because |
|---|---|---|
| "can you test all features?" | Nothing — it is part of done. Or: "run the hardening matrix on build 9 and report" | Testing is the agent's standing job |
| "implement all to be perfect" | "implement screens 1–12 from the inventory; payments are out of scope" | "All" and "perfect" hand the scope to the agent |
| "fix all" | "fix findings 1–7 from the review, each at its root cause" | Names what "all" is |
| A screenshot with no words | Add a verb: *fix*, *explain only*, *what next?* | Otherwise the intent is a guess |
| "use my account <email>, <password>" | "the QA credentials are in .env.local" | A pasted password lives in the transcript forever |
| "can you run the app" at maximum effort | The same at default effort | It took 227 tool calls and 90 minutes |
| The same symptom, third time | Should never be needed — but if it is: "third report; root cause and the same pattern everywhere" | The first two fixes were patches |
| Ten console screenshots in the feature workspace | The human-task list, or a release-helper workspace | Keeps feature branches reviewable |

## 13. What the agent sends back

Formats that keep the human's reply short.

**Kickoff message** — see `01-intake.md`, section 5. Under about 600 words: findings in a few lines, the handful of expensive decisions with a recommendation each, the blocking items, the longest-lead tasks, the assumptions worth a veto, a reply template. The plan, the inventory, the full task list and the API requests go into files.

**When a password is pasted into chat**

```
That password is now in this chat's transcript in plain text — please change it today.
I won't use it as pasted. Put a test account's login in .env.local as QA_EMAIL / QA_PASSWORD and tell me
it is there. Is this a test account, or your own? On your own account I only look — nothing is sent or changed.
```

**Progress note** (long turns, every few minutes) — one line:

```
Foundation 6/10 done — session guards in; next: gates. Committed through a3f9c1e.
```

**Review round**

```
Round 2 — 14 frames, iPhone / Android / iPad. Reply by number.
<contact sheet>
Changed since round 1: 3, 7, 12.
One question — 7: keep the floating button, or move it into the header? I recommend the header: it clears the composer.
```

**Slice report**

```
Done: habits — PR #12
Verified: iPhone and Android (tour steps 10–14, screenshots below); iPad by deep link; both languages.
Not verified: reminder delivery — needs a real device.
Decided on my own (recorded in the brief): reminders are local notifications; the master switch lives on the server.
Needs you: nothing.
```

**Hand-over** — see the app-store-play-store-submission skill (`references/02-release.md` §8).

**Rejection response**

```
Issue 1 — 2.5.4, audio background mode
Cause:  the audio library's plugin enables background playback by default; nothing in the app uses it.
Fix:    switched off in the app config; the generated plist now lists only remote-notification. PR #20.
Class:  printed every background mode, permission and service in both generated manifests — one more
        unused Android service removed.
Reply:  "We removed the audio background mode; the app does not play audio in the background…"
```

Every one of these ends with what the human must do next — or says that nothing is needed.
