# Rejections — from a reviewer's message to an approved build

A rejection is a bug report with a deadline and an external judge. The user usually pastes it with three words —
"what is this?" — and the tempting answer is an explanation of the guideline. That answer leaves the user exactly
where they were. The useful answer is the cause, the fix, what else would fail the same way, and the text to send back.

## Contents

1. The protocol
2. Answering "what is this?"
3. Classes seen, with their fixes
4. Reply templates
5. When the owner keeps the risk
6. After the fix

---

## 1. The protocol

1. **Get the whole message.** Every issue, the device and OS the reviewer used, the build number, attachments (crash
   logs, screenshots). An excerpt hides the second and third issue — on the case-study project one pasted message held
   three, and fixing all three in one build saved two review cycles. Ask for the full text if you were given a piece.
2. **Split and classify** each issue: *binary* (crash, behaviour), *metadata* (screenshots, description, links),
   *policy* (login, payments, privacy, content), or *information request* (a question to answer, no build needed).
3. **Find the evidence** before proposing anything: symbolicate and read the crash's faulting frames; print the key from
   the generated `Info.plist` or merged manifest; open the screenshot the reviewer means; reproduce on the reviewer's
   device class and OS.
4. **Root cause — of the defect and of the process.** Why did this pass every check before upload? The process answer
   becomes a guard or an audit row.
5. **Sweep the class.** A background-mode finding means printing *every* declared mode, permission and service and
   justifying each. A launch crash means asking what else is decided at build time that nothing looks at. A login wall
   means checking every feature a reviewer could call "not account-based".
6. **Options, with a recommendation**, where policy and product conflict (section 5).
7. **Fix, verify with evidence, bump the build** (`02-release.md`).
8. **Draft the reply** (section 4) and update the review notes in the console.
9. **Add the audit row** (`01-store-compliance.md`) and record the decision in the project brief.

## 2. Answering "what is this?"

Even when the user only asks what the message means, answer in this shape — short:

```
What it is: <guideline> — <one sentence in plain words>.
Why your build got it: <the cause in this app, or the most likely cause and how to confirm it>.
What to do: <the fix, or the options with a recommendation if it is a policy choice>.
Same class, check now: <the other things that would fail the same review>.
Reply to send after the fix: <a few lines, or "after the fix I will draft it">.
I need from you: <the full message if this was an excerpt; a decision; nothing>.
```

If you have the code, go further than the explanation: find the cause, propose or make the fix (as the project's rules
allow), and say what you verified.

## 3. Classes seen, with their fixes

From the case-study project (App Store), in the order they arrived:

| Guideline | What the reviewer saw | Cause | Fix | Guard against a repeat |
|---|---|---|---|---|
| 3.1.2 (automated) | Subscriptions without a Terms of Use link in the listing | Listing text | Standard EULA link in the description, or a custom EULA in the console | Audit §8 |
| 2.1(a) | Crash at launch on the newest iPadOS | A new SDK required a life cycle the project template lacked | Adopt the life cycle (in Expo: move to the SDK that adopts it, or a config plugin until then) | Launch the release build on the newest OS, phone **and** tablet, before every hand-over |
| 2.3.10 | Another platform's status bar in iPhone screenshots | Screenshots generated from Android captures | Recapture on iOS simulators; compose with a template | Audit §9 — check provenance |
| 5.1.1(i), 5.1.2(i) | Personal data sent to a third-party AI without disclosure or permission | No consent step | A versioned in-app consent gate on every sending path; name the provider in the policy | Audit §7 |
| 2.5.4 | Audio background mode declared, no background audio | A media library's default | Turn the option off; print the generated plist | Inspect generated artifacts in the audit |
| 5.1.1(v) | Registration required for a feature the reviewer judged not account-based (the AI) | Login wall | A guest state with an account gate; give guests real use of the named feature | Guest gate in the foundation |

Other classes worth knowing (not hit on that project): 4.8 (third-party login without an equivalent privacy-preserving
option), 3.1.1 (an external payment link for digital goods), 1.2 (user content without report/block), 4.3 (spam / a
copy of a template app), Google Play's payments, account-deletion, data-safety and AI-content policies
(`01-store-compliance.md` §5).

## 4. Reply templates

Short, factual, no argument, no apology, no code. What changed, where to see it, how to verify.

**Fixed in a new build**

```
Thank you for the review. Build <version (build)> addresses the issues:

1. <Guideline>: <what changed, one sentence>. To verify: <steps>.
2. <Guideline>: <what changed>. To verify: <steps>.

Demo account (if needed): provided in App Review Information.
```

**Login wall (5.1.1(v))**

```
In build <version (build)> the app no longer requires an account to be used.
- "Continue as guest" on the first screen opens the app; <public features> work without an account.
- <What a guest can do with the feature you named, in one line.>
- Features that store personal data (<history, saved items, subscription>) ask the user to sign in at that point.
- Account deletion: <path in the app>.
To verify: launch → Continue as guest → <path to the named feature>.
```

**Third-party AI consent (5.1.2(i))**

```
Build <version (build)> asks for permission before any personal data is sent to <provider>.
- The first time a user <sends a message / uploads>, a screen explains what is sent (<data>), to whom (<provider>) and
  why, with Allow and Not now. Nothing is sent before Allow.
- The choice can be reviewed and withdrawn in <Settings path>.
- The privacy policy (<URL>) names <provider> and what it receives.
To verify: sign in with the demo account → <action> → the permission screen appears.
```

**Information request** — answer the question exactly; attach a screen recording when behaviour is easier shown than
described; do not upload a build unless asked.

**Price confirmation** — confirm or correct each price the reviewer listed, one per line.

## 5. When the owner keeps the risk

Some fixes conflict with a product decision — a guest mode without server-side guest accounts, an external payment
channel on Android, keeping a feature behind sign-in. Then:

1. State the rule in one sentence and the options, each with what it changes and the risk that remains.
2. **Recommend one**, and say why. For the login-wall class the recommendation is to give guests real use of the named
   feature; research on the case-study project found no app that won this by arguing, and partial guest modes that
   still locked the named feature were often rejected again.
3. The owner decides. Record the decision, the date and the lever that would remove the risk (for example a remote
   switch, or a server change) in the brief, and list it as an accepted risk in the next audit.

## 6. After the fix

- Resubmit with the reply and updated review notes.
- Keep the rejection text and the reply in the project (`docs/reviews/<date>.md`) — the next submission's audit
  starts from them.
- If the same class comes back, the first fix was a patch: say so, and go one level deeper.
