# Intake — closing the input gaps (Phase 0)

A design and an API are two of the seven packs an app needs. This file lists what belongs in each pack, why each item is there, and how to get the missing ones in **one short round-trip**. It is self-contained: you do not need the other references to write the kickoff message.

## Contents

1. How to run intake
2. The seven packs, item by item
3. Store rules that become day-one decisions
4. Sorting a missing item
5. The kickoff message
6. Where everything is recorded
7. Signs that intake was skipped

---

## 1. How to run intake

1. **Read all of what you were given before asking anything.** Every screen of the design, the string table, every endpoint of the API doc, the existing repo. If an attachment the message mentions did not arrive, say so first. Half of the questions answer themselves, and the rest become specific.
2. **Build the screen inventory** — screen → data and actions → endpoint → who may see it (format in `03-design.md`, section 2; save as `docs/SCREENS.md`). It *is* the coverage matrix. Its gaps are findings: screens with no endpoint, endpoints with no screen, and things a store rule needs that neither has (section 3).
3. **Walk the seven packs** (section 2) and sort every missing item (section 4).
4. **Write the files** (section 6) — before the message, not after the reply. They are part of the report, not of the build: "don't start yet" and "tell me your plan first" do not apply to them, and a task list or a set of backend requests that only exists after the next round-trip has wasted a day of lead time. Mark every decision that is still open as *proposed*. In an empty repository the files are the first commit. If there is no repository at all, write them in the working folder and propose a repository name and location as an assumed default; pushing anywhere waits for the human.
5. **Send one short kickoff message** (section 5) and start Phase 1 on everything that is not blocked. Console tasks and backend requests run in parallel; they never gate the build.

The aim is one round-trip. A person asked fifteen separate questions over three days answers each with less care than one list read once — and a person sent ten pages reads none of it.

---

## 2. The seven packs

"Observed" is what happened on the case-study project when the item was missing. "Default" is what you assume when nobody answers.

### Pack 1 — Product and decisions

| Item | Observed without it | Default if unanswered |
|---|---|---|
| What the app is **and is not**, in one paragraph; the store category | Automated passes framed a coaching app as a health app: wrong category, wrong age-rating answers, medical disclaimers | Propose one, and do not put it into any store form until confirmed. It does not block the build |
| v1 scope in priority order; what is explicitly out | "Implement all to be perfect" left scope to the agent | Build what the design shows, plus the screens the stores require that nobody drew |
| Sign-in methods and where each appears | The sign-in screen was re-laid five times | Email plus the platform-native providers, social above email; whenever a third-party login is offered on iOS, Sign in with Apple as well |
| **Guest policy** — what works without an account | Rejected under 5.1.1(v); 62 files changed to retrofit | Public content is browsable; the app asks for an account at the first account-only action |
| Account deletion inside the app | Required by both stores wherever accounts can be created | Yes, in settings, backed by an endpoint (request it if the API has none) |
| Monetization per platform (store billing, external payment) and who verifies purchases | Decides store rules, backend work and product ids; took a workspace of its own | Store billing on each platform, verified by the backend. Anything else is the owner's decision — state the policy risk |
| Languages; the default on a fresh install; the language *content or AI replies* use | The default was reversed after the first build; app language vs reply language took eight prompts | Device language when supported, otherwise the primary market's; UI language and content language stored as two separate settings |
| Data that leaves for third parties — AI providers, analytics, crash reporting, push | Rejected under 5.1.1(i)/5.1.2(i) | Trace it. When personal data reaches a third-party AI, the consent step is **built in** — it is not a question |
| Copy and voice rules; words to avoid | A professional title in the copy had to become "the AI" across the app | Ask for a short list; meanwhile introduce an AI as an AI and make no professional claims |
| Navigation paradigm; two or three apps it should feel like | Tabs became a drawer on day 2 | What the design shows — and confirm it on a device in Phase 3 |
| Which flow is "the product" (it is built first and signed off on a device) | — | The flow with the most technical risk: streaming, uploads, payments |
| Notifications: which kinds, and when the permission is requested | Permission prompt added later | Ask once, after onboarding, with one sentence of reason |
| Offline expectations | — | Last data readable offline; writes need a connection |
| Crash reporting and analytics | The app shipped blind: no crash reporting | Crash reporting on, product analytics off; both declared in the privacy forms |

### Pack 2 — Design

Details in `03-design.md`. At intake, check that you have: every screen and flow, the tokens (colours, type, spacing, radii), the string table in every language, the brand assets (app icon, splash, logo, notification icon), and the names of reference apps. Missing assets go into the kickoff message — an icon that arrives after the first build means the splash and launcher are done twice.

### Pack 3 — API contract and a test account

Details in `02-api-contract.md`. At intake, check that you have: base URLs per environment, the reference — **ideally an OpenAPI file the backend regenerates in CI** (ask for one if the backend can export it; NestJS, FastAPI, Spring and most frameworks can) —, **test accounts that are safe to write with — one per entitlement state the app must show** (for example a free account at its limit and a paid one), the rate limits, and the name of whoever answers contract questions. If the backend repository is on the same machine, ask **which checkout is current** — on the case-study project the obvious one was 84 commits behind.

### Pack 4 — Identity and environment

| Item | Note |
|---|---|
| Display name, bundle identifier / application id, URL scheme | Fixed forever by the first store upload |
| Apple team id | Read from the developer account, never from git history or a provisioning profile lying around — a stale id was picked up that way |
| Google Play developer account type (organisation or personal) | Changes the testing gate before production; invisible from the code |
| OAuth clients: web, iOS, and one Android client **per signing certificate** (debug, upload, store re-signing) | Social sign-in worked locally and failed for every store install until the store's own fingerprint was registered |
| Push provider app id; whether the APNs key and the FCM credentials are uploaded to it | Without the id the SDK never initialises and the backend logs "no recipient" |
| `.env.example` listing every key; where the real values live; how a new worktree receives them | A stale git-ignored `.env` hid the social buttons in three workspaces |
| Signing: who holds the iOS distribution identity; where the Android upload keystore and its properties file live | Decides who performs the final upload |
| Local toolchain: Expo SDK and library versions in use, Xcode, simulators, JDK, Android SDK/NDK, emulator images | Find this out yourself in Phase 1 — do not ask for it; record what "latest" meant on day one |
| Other repositories (backend, website) and which checkout is current | The privacy page lived in a third repository |
| Test credentials: the **names** of the env vars; which simulator sessions are the human's own | A screenshot tour once ran on the human's personal account and sent a message from it |

### Pack 5 — Platform scope and device matrix

| Item | Note | Default |
|---|---|---|
| Minimum OS versions and target SDK | — | Whatever the current Expo SDK and the stores' current target-SDK rules require |
| Phone only, or tablet too | Reviewers test on tablets regardless — every review in the case study ran on an iPad | One centred column on tablets, built into the screen primitive |
| Orientation and split view | A width breakpoint handles landscape and split view together | Portrait on phones |
| Light, dark or both | — | As designed; one typed palette even if a single theme ships |
| Text scaling: OS font scale, in-app text size | A customer comment produced a 30-file retrofit | A multiplier in the text primitive from day one |
| Scripts and fonts | Tall scripts need their own line-height rule (`07-expo-react-native.md`) | Line height from the font's metrics |
| The real devices the human and early users hold | A mid-range Android phone found what no simulator did | Ask; they go in the matrix |

### Pack 6 — Store, legal and release

| Item | Note | Default |
|---|---|---|
| Developer accounts exist; paid-apps agreements, banking and tax are active | Agreements take days; without them the paywall is empty with no error | None — human task, starts today |
| App records created; product ids defined and where they come from | The first upload fixes the package name and registers the signing key | Product ids come from the backend's plan list |
| Privacy policy URL — final, live, about *this* app; terms URL; support URL or email; EULA | A stale env file once pointed the privacy link at template text | None — human task |
| Demo account and notes for the reviewer | A missing sign-in for review blocks the review | Human creates; you draft the notes |
| Listing languages each store supports | One store had no localisation for the app's main language; the other did | Check each store's current list (links in the app-store-play-store-submission skill) |
| Release channel: local builds straight to the stores, or a build service; over-the-air updates or not | Without OTA every copy fix is a new binary and a new review | Whatever the owner already uses. If unknown there is no safe default — name your choice among the assumptions with what it costs (a build service needs an account and a plan; no OTA means a store review per copy fix) |
| Who builds, who uploads, where artifacts are saved, the version policy | "Minor version" meant 1.0.1, not 1.1.0 | You build; whoever holds the signing identity uploads; a small release raises the last digit |
| Deadline | Sets how early console tasks must start | Ask |

### Pack 7 — Working agreement

| Item | Default |
|---|---|
| Language for reports; language for commits and PRs | Reports in the language the human writes in, technical terms in English; commits and PRs in English |
| What needs an explicit yes | Version bump, merge, upload, anything outward-facing or irreversible, shipping with a known policy risk |
| PR policy | One PR per concern, opened by you when the slice is verified; the human merges |
| What the agent does unasked | Verify on every target, sweep for the same pattern, open the PR |
| How much effort for what | Heavy effort for audits and cross-cutting fixes; default for run, build and questions |
| Workspace policy | One concern per workspace; a separate one for store-console questions |
| Progress notes | One line every few minutes on long turns |

---

## 3. Store rules that become day-one decisions

A design can contradict a store rule without anyone noticing until the rejection. Check the inventory against these at intake. Each "if" that is true is either a decision for the kickoff message or a request to the backend. (Store rules change: before quoting a guideline in a store form, re-read the current text. The full audit and the links are in the app-store-play-store-submission skill — you do not need it yet.)

| If the app… | The rule | Day-one consequence |
|---|---|---|
| puts everything behind sign-in while some content is public | Apple 5.1.1(v): features that are not account-based must work without a login | Guest state and an account gate in the foundation. If the reviewer could name one feature as "not account based" (an AI assistant, browsing), decide now whether guests get a limited version of it |
| lets people create an account | Apple 5.1.1(v), Google Play: account deletion inside the app; Play also wants a web page | Screen + endpoint; request the endpoint if it is missing |
| offers Google, Facebook or another third-party login | Apple 4.8: an equivalent privacy-preserving option too (Sign in with Apple qualifies) | Apple sign-in on iOS, or no social login on iOS until the backend supports it |
| sells digital content or subscriptions | Apple 3.1.1: in-app purchase only, no button pointing to another way to pay. Google Play expects its own billing | Payment channel per platform behind a remote switch; any external payment is the owner's risk to accept |
| has subscriptions | Apple 3.1.1–3.1.2: what is bought, the period and the store's price before purchase; restore; Terms of Use and privacy links in the app **and** in the listing | Paywall elements the design may lack |
| sends personal data to a third-party AI | Apple 5.1.2(i): disclose it and get explicit permission first. Google Play: an in-app way to report or flag AI output | Consent step before the first send; a "report this answer" action; request an endpoint for reports |
| shows content written by other users | Apple 1.2: filter, report, block, published contact | Report and block in v1, or the feature ships switched off |
| asks for personal data no feature uses (a mandatory phone number) | Apple 5.1.1(v): no personal information that is not relevant to core functionality | Make it optional or drop it |
| uses camera, microphone, photos, notifications, location | Purpose strings in every language; the app works when refused | Strings and denied-state screens nobody drew |
| declares a capability it does not use (background audio added by a library default) | Apple 2.5.4 | Checked in the release audit; nothing to decide now |
| was designed for phones only | Reviewers test on tablets anyway | Tablet column in the screen primitive |

Also run every public endpoint in the API doc through one question: **does it return personal data?** A comments endpoint that returns each commenter's email is a privacy defect on the server, whatever the app does with it. Report it in the API requests.

---

## 4. Sorting a missing item

| Kind | Meaning | Examples | What you do |
|---|---|---|---|
| **Blocking** | Nothing depending on it can be verified | API address, a test account, bundle id, team id | Ask first; these cannot be defaulted |
| **Expensive to reverse** | A default exists but changing it later touches most screens | Navigation paradigm, guest policy, payment channel, tablet support, a feature that needs moderation | A decision in the kickoff message, with options and a recommendation |
| **Assumed** | A sensible default exists and is cheap to change | Default language, permission timing, offline behaviour, PR policy | Record it in the brief; mention it in the message only if the owner would care |
| **Confirm before use** | You may propose it, but must not act on it until confirmed | Store category, age rating, legal URLs, product names | Propose it; keep it out of every form and listing until a yes |
| **Human task** | Only the owner can do it, and it has a lead time | Agreements, app records, products, OAuth clients, push keys | Hand over on day one with exact steps |

To tell *assumed* from *expensive to reverse*, ask what a retrofit touches. "Every route" or "every text element" means expensive.

Keep the decisions to about six. More than that and the important ones are lost among the cheap ones.

---

## 5. The kickoff message

This is the first thing the human reads from you. Its job is to get one reply. **Budget: under about 600 words, answerable in two minutes.** Everything that does not need an answer goes into the files, and the message links to them.

```markdown
I've read all <n> screens and every endpoint. Short version: the screens are buildable as designed;
<k> things in the design or the API would get the app rejected or leak data, and I need <m> facts only
you have. Details are in docs/ — you only need to answer what is below.

## Decisions — reply with the numbers, or "all recommended"

1. **Navigation** — A) system tab bar, your colours · B) the drawn bar with the raised button
   Recommend A: platform behaviour and accessibility for free. Changing later touches every screen header.
2. **Guests** — A) browse without an account, sign in at the first account action · B) everything behind sign-in
   Recommend A: App Review rejects B when any feature is not account-based; retrofitting touches every route.
3. **Payments on Android** — A) Play Billing · B) bank transfer only
   Recommend A. B works today but is a policy risk — your call; either way it sits behind a remote switch.
4. **Comments** — A) with report and block (needs backend) · B) switched off in v1
   Recommend A, falling back to B if the endpoints are late.

## I need from you (nothing can be verified without these)

- The real API address, and two test accounts (free, paid) — put them in `.env.local`, not in chat.
- Bundle id, Apple team id, Play account type (organisation or personal).

## Start today — these have lead times

- Paid-apps agreement, banking, tax (days) · privacy policy and account-deletion page live (days)
- Forward docs/API_REQUESTS.md to the backend: 6 requests, 3 of them block submission.
Full list: docs/HUMAN_TASKS.md

## What I assumed (veto any) — the rest is in docs/PROJECT_BRIEF.md

Default language follows the phone · tablets get one centred column · crash reporting on, analytics off ·
local builds, no over-the-air updates · reports in <language>.

## Reply like this

    1A 2A 3A 4A · API: https://… · bundle id: … · team id: … · Play: organisation

Then I verify the API and prove the build toolchain, and come back to you twice more: once to approve the
look on real devices, once to approve the release.
```

Rules for the message:

- **Always recommend.** A question without a recommendation hands the work back.
- **Say what reversing touches**, in the owner's terms ("every screen header"), not as a file count from another project.
- **State policy risks plainly** and leave the choice to the owner. On the case-study project the owner chose a manual payment channel on Android and a guest mode that lives only in the app, knowing the review risk; both were legitimate decisions made with the facts.
- **List only the assumptions the owner would care about.** Engineering defaults (TypeScript, the router, the test runner) belong in the brief.
- **Never ask for a secret by value.**
- **Plain words.** No "Phase 0", no "packs", no "gates" — say "first I check the API", "the sign-in check".
- **Do not include** the phase plan, the architecture, the screen inventory, the full task list or the full list of API requests. They are in the files. If the human asked for "a report of what you will do", add a five-line outline of the order of work — not a chapter per phase.
- If an interactive question tool is available, use it for the decisions and keep the rest as text.

---

## 6. Where everything is recorded

| File | Holds | Why not somewhere else |
|---|---|---|
| `docs/PROJECT_BRIEF.md` | The seven packs as answered, every decision and assumption with its date and reason, accepted risks (`assets/PROJECT_BRIEF.template.md`) | Decisions that no amount of reading the code reveals; agent memory stays on one machine and one folder |
| `AGENTS.md` (plus `CLAUDE.md` `@AGENTS.md`) | The working agreement and the project's standing rules (`assets/CLAUDE.template.md`) | Loaded by every coding agent in every clone and worktree |
| `docs/HUMAN_TASKS.md` | Console and legal tasks, lead times, what to send back (`assets/HUMAN_TASKS.template.md`) | The human works from it without chat |
| `docs/SCREENS.md` | The screen inventory and its gaps | The route map, the gate per screen, the frame numbers for review rounds |
| `docs/API_REQUESTS.md` | Numbered requests to the backend: what is missing, why, and what the app does if it is not there in time | Forwardable as it is; the backend has lead time too |
| `.env.example` | Every key the app reads, with public values filled in | The only honest description of the environment |

Rows that cannot be exact yet — a task that needs the bundle id, a product id that only the live API knows — are written anyway and marked "after: bundle id" or "after: API check". A list delivered on day one with three blanks beats a complete list delivered in week two.

Update the brief when a decision changes — with the date. A brief that disagrees with the code is worse than none.

---

## 7. Signs that intake was skipped

Stop and go back if you catch yourself:

- hardcoding a URL, an id or a product name nobody gave you;
- choosing a team id or signing identity from a list of candidates;
- filling a store form with a category the owner has not confirmed;
- adding a sign-in method because the SDK makes it easy;
- putting every screen behind sign-in because the API needs a token;
- building on tabs, a drawer or a theme because the design happened to show it, without the Phase 3 confirmation;
- testing with an account whose owner you do not know;
- writing "the user can run this command" for something you could run;
- sending a first message longer than the human's patience.
