# Store compliance — the audit before every submission

Three of the four rejections on the case-study project were standard checks for an app with accounts, subscriptions and an AI feature. Each cost a build, a review cycle of several days and a new submission; together, 25 days. Every one of them was checkable from the agent's seat before the first upload.

Store rules change. **Re-read the linked pages before relying on a guideline number or a threshold** — note the date you checked in the audit — and treat this file as the list of *questions to ask*, not as the law.

## Contents

1. Console work starts on day one
2. Facts the code cannot show
3. How to run the audit
4. Apple App Store checklist
5. Google Play checklist
6. One data inventory, three documents
7. Apps that send data to a third-party AI
8. Subscriptions and purchases
9. Screenshots and listing text
10. Rejection classes seen

---

## 1. Console work starts on day one

Console and legal tasks have lead times measured in days, and nothing in the code reveals that they are missing — the paywall is simply empty, the push simply never arrives. Hand over a written task list (`docs/HUMAN_TASKS.md` — the react-native-expo-app-builder skill has a template) as early as possible; for an app already being built, today.

| Lead time | Task |
|---|---|
| Days to weeks | Developer program enrolment for an organisation; paid-apps agreement with banking and tax; any closed-testing period the store requires before production |
| Hours | App identifiers and capabilities; app records; subscription group and products with their review material; OAuth clients for every signing certificate; push keys uploaded to the push provider |
| Must be live before submission | Privacy policy, terms, support page, account-deletion page |

On the case-study project this work began on day 4 and was walked one screenshot at a time — about 35 prompts. A written list with exact values would have let the owner do it alone, in parallel with the build.

## 2. Facts the code cannot show

Ask for these; never infer them. Each one changed a decision on the case-study project and each was found late.

- **Which languages each store can list in.** One store did not support the app's main language at all; the other did. Check the current lists rather than assuming: <https://developer.apple.com/help/app-store-connect/reference/app-information/app-store-localizations> for the App Store, and the language picker of the store-listing page in the Play Console.
- **The developer account type.** On Google Play, a personal account created after the store's cut-off date must run a closed test with a minimum number of testers for a minimum number of days before production; an organisation account goes straight through. It is the largest schedule unknown and it is invisible from the repository.
- **Whether paid distribution is available in the owner's country** — an assumption that it was not turned out to be false.
- **What the app is.** Category, age rating and any health or finance declaration follow from the owner's positioning, not from a keyword in the copy.
- **Who signs and uploads.** It decides which machine needs which credentials.

## 3. How to run the audit

Run it before the first submission and before **every** resubmission. Output one report (`docs/SUBMISSION_AUDIT.md` from `assets/SUBMISSION_AUDIT.template.md`, replaced each time):

```markdown
# Submission audit — <version> (<build>) — <date>

| # | Check | Result | Evidence |
|---|---|---|---|
| A1 | Release build launches on the newest OS, phone and tablet | PASS | launch-test output |
| A4 | Features that are not account-based work without registering | FAIL | chat requires sign-in — see accepted risks |

## Accepted risks (owner's decision, dated)
- A4: AI chat stays behind sign-in; the owner declined server-side guest accounts on <date>.

## Cannot be checked from here — please confirm in the console
- Paid-apps agreement is active.
```

- **PASS needs evidence**: a command's output, a file's content, a screenshot. "Should be fine" is not a result.
- **Inspect generated artifacts, not the config.** Libraries add background modes, permissions and services by default; the truth is in the generated `Info.plist` and merged manifest.
- A FAIL the owner chooses to ship with becomes an **accepted risk** with a date and the lever that removes it.

---

## 4. Apple App Store checklist

Source: <https://developer.apple.com/app-store/review/guidelines/>

### Completeness and stability — 2.1

- [ ] The **release** build launches and stays up on the newest iOS and iPadOS, iPhone **and** iPad (`02-release.md`). Reviews on the case-study project all ran on an iPad.
- [ ] No placeholder text, dead buttons or empty pages; every URL in the app and the listing loads.
- [ ] The backend is up; a demo account is in the review information; the notes explain anything non-obvious.
- [ ] In-app purchases are complete and submitted with the version. A first subscription has to ship with a new app version.

### Accounts — 5.1.1(v), 4.8

- [ ] "If your app doesn't include significant account-based features, let people use it without a login." Decide what a guest can do. **Recommend:** a guest session with an account gate, and — when a reviewer has named a feature — some real use of *that* feature without an account (a small quota, a read-only version). A guest mode that keeps the named feature behind sign-in may be rejected again; shipping it that way is the owner's risk to accept.
- [ ] Sign-up asks only for personal data a feature actually uses — "Apps may not require users to enter personal information to function, except when directly relevant to the core functionality of the app or required by law."
- [ ] If accounts can be created, **account deletion is offered inside the app.**
- [ ] If a third-party or social login sets up the primary account, an equivalent privacy-preserving login option is offered too (Sign in with Apple qualifies).

### Privacy — 5.1.1, 5.1.2

- [ ] Personal data is not shared with third parties — "including with third-party AI" — without clear disclosure and explicit permission first (section 7).
- [ ] A privacy policy link in the listing **and** in the app; the policy names what is collected, how, every use, and the third parties.
- [ ] Purpose strings say clearly and completely what each permission is for, in every shipped language; requests happen in context; a refusal is handled.
- [ ] No feature requires enabling push, location or tracking.
- [ ] The App Privacy answers match the data inventory (section 6), SDKs included.
- [ ] Tracking: a tracking-permission prompt only if the app tracks.

### Binary and capabilities — 2.5.4 and friends

- [ ] Background modes are only the ones in real use. Print them from the generated `Info.plist`; media libraries can switch audio background mode on by default.
- [ ] No unused entitlements; the push environment is production for a release build.
- [ ] Every target, extensions included, has a deployment target the current toolchain accepts.
- [ ] The export-compliance key is set.

### Payments — 3.1.1, 3.1.2

- [ ] Features and content unlocked in the app use in-app purchase; any other payment channel is switched off for this platform — remotely, so it can be changed without a release.
- [ ] Subscriptions: section 8.

### Metadata — 2.3

- [ ] Screenshots show the app in use and come from **this platform**: no other platform's status bar, navigation bar, names or icons (2.3.10).
- [ ] Listing languages are ones the store supports.
- [ ] Category and age rating follow the owner's positioning.

### Design and content

- [ ] If tablets are supported, every screen holds together on one.
- [ ] User-generated content, if any: filtering, a way to report, a way to block, published contact details (1.2).

---

## 5. Google Play checklist

- [ ] **Testing gate.** New personal developer accounts must run a closed test with a minimum number of opted-in testers for a minimum number of continuous days before production access. Read the current numbers and the cut-off date on <https://support.google.com/googleplay/android-developer/answer/14151465>, and ask which account type this is.
- [ ] **Bundle and signing.** An app bundle signed with the upload key — not the debug key; the version code is higher than any uploaded before. Check the signer on the artifact.
- [ ] **Sign-in after re-signing.** The store re-signs the app; register the store's app-signing certificate fingerprint as its own OAuth client, or social sign-in works locally and fails for every store install.
- [ ] **Account deletion.** An in-app path to delete the account **and** a web page where deletion can be requested, declared in the Data safety form (<https://support.google.com/googleplay/android-developer/answer/13327111>).
- [ ] **Data safety** answers match the data inventory and the privacy policy.
- [ ] **Payments.** Digital goods are expected to use the store's billing. Any other flow is a policy risk the owner must accept explicitly — and note that a billing permission added by a library is visible to reviewers next to that flow.
- [ ] **AI-generated content.** Chatbots and AI image or video generators must let users report or flag offensive output without leaving the app (<https://support.google.com/googleplay/android-developer/answer/13985936>).
- [ ] **Permissions and foreground services** in the merged manifest are only the ones in use; libraries add service types by default, and each needs a declaration.
- [ ] **Target API level** meets the current requirement (<https://developer.android.com/google/play/requirements/target-sdk>).
- [ ] Content rating, target audience, ads declaration, and any health or finance declaration answered from the owner's positioning.
- [ ] **Push credentials** uploaded to the push provider. Until then the build and the upload succeed and no device ever subscribes.
- [ ] **Console notices** after the first upload: for each, is there a deadline, and is it the app's code or a library's? One on the case-study project had a real deadline and a real regression risk (code shrinking); another was library code that needed nothing.

---

## 6. One data inventory, three documents

The App Privacy answers, the Data safety form and the privacy policy must agree with each other and with what the software does. A single mismatch is the common enforcement trigger.

1. **Trace it, do not assume it.** From the backend source at the current checkout: what is collected, where each item is sent, which processors receive it (model provider, storage, hosting, push, email, sign-in providers, any staff tooling).
2. Write the inventory once (`docs/DATA_INVENTORY.md`): data item → collected when → sent to → purpose → retention.
3. Answer all three documents from it, and derive the in-app consent text from it.
4. When the backend starts sending something new, the inventory, the policy, the forms and the consent version change **together**.

On the case-study project, onboarding copy said the AI would address the user by name; the trace showed the name was never sent. The copy was wrong, not the inventory — which is why the trace comes first.

---

## 7. Apps that send data to a third-party AI

- [ ] An **AI data inventory**: exactly what reaches the model provider per request — the message, history, attachments, memory, profile fields — and what never does. Both stores' privacy forms, the policy and the consent text are answered from it.
- [ ] **Apple, 5.1.2(i)** — a **consent step before the first send**: what is sent, to whom, why; Allow and Not now. It gates *every* path that sends: the composer, retries, voice, suggested prompts, anything that embeds user text. Declining leaves the rest of the app usable.
- [ ] **Apple, 5.1.1(ii)** — a settings row to review and withdraw the consent.
- [ ] A **version** on the consent record; raise it when the inventory changes so everyone is asked again.
- [ ] **Both stores** — the privacy policy names the provider. A policy mention alone was explicitly "not sufficient" for Apple's reviewer; the in-app step is what was missing.
- [ ] **Google Play, AI-generated content policy** — a way to **report or flag an AI answer** without leaving the app, and someone who reads the reports.
- [ ] **The provider's data-use terms** — training on inputs, retention — are read and described truthfully. "Your data is never used for training" is true only on a plan that guarantees it.
- [ ] Sensitive inputs are named for what they are: a diet, a health note or a photo can reveal more than the field's label suggests.
- [ ] Copy does not present the AI as a professional it is not; disclaimers match the real domain.
- [ ] The guest question (5.1.1(v)) is answered for the AI feature specifically.

---

## 8. Subscriptions and purchases

- [ ] Before the purchase button the paywall shows what is bought, the period and the price — the **store's** localized price, never a price from your own backend.
- [ ] Links to the Terms of Use (EULA) and the privacy policy on the paywall, **and** a working Terms of Use link in the listing (in the description, or a custom EULA in the console). Missing this produced an automated block within hours of submission.
- [ ] Restore purchases is present.
- [ ] The backend verifies every transaction and owns the entitlement dates. The app finishes a store transaction only after the server accepts it or refuses it for good; a transient failure leaves it open to be replayed.
- [ ] Product identifiers come from one source of truth (the backend's plan list), and the console defines exactly those, as auto-renewable subscriptions in one group.
- [ ] Cancelling points to the store's own management page; deleting an account warns that a store subscription keeps billing until cancelled there.
- [ ] Sandbox purchase tested on a real device — simulators return no products without extra configuration.
- [ ] Prices confirmed: reviewers asked the owner to confirm unusually high prices before continuing.

---

## 9. Screenshots and listing text

- **Provenance.** Capture from the right platform's simulator with a clean status bar. On the case-study project an asset generator produced "iPhone" frames from Android captures; the reviewer saw the Android status bar.
- **Compose with a template**, not by hand: an HTML page that takes a capture and a caption, rendered headlessly at the store's exact sizes, with no alpha channel. Rebuilding frames in an image tool loses the layout every time.
- **Whose account is on screen?** Ask before publishing a personal account's data.
- **Review notes**: what the app does, the demo account, how to reach paid features, where consent appears, where account deletion is.
- **Reply drafts**: when a rejection arrives, the owner needs text to send — write it (`03-rejections.md`).

---

## 10. Rejection classes seen

| When (day 1 = design hand-over) | Guideline | What the reviewer saw | Cause | The check that prevents it |
|---|---|---|---|---|
| Day 8 | 3.1.2 (automated) | Subscriptions without a Terms of Use link in the listing | Listing text | Section 8 |
| Day 12 | 2.1(a) | Crash at launch on the newest iPadOS | A new SDK required a life-cycle the project template lacked; no release build had been launched on that OS | Release launch test |
| Day 15 | 2.3.10 | Another platform's status bar in iPhone screenshots | Captures from the wrong platform | Section 9 |
| Day 15 | 5.1.1(i), 5.1.2(i) | Personal data sent to a third-party AI without disclosure or permission | No consent step | Section 7 |
| Day 15 | 2.5.4 | Audio background mode declared, no such feature | A library's default | Inspect the generated `Info.plist` |
| Day 21 | 5.1.1(v) | Registration required for the AI feature | No guest path | Guest gate in the foundation |

When a new class appears, add a row here for the project and a check to its audit — a rejection that teaches nothing will be repeated. How to handle one: `03-rejections.md`.
