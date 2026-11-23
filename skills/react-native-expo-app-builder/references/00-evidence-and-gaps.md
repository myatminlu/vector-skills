# Evidence and gaps — the case study behind this skill

Every rule in this skill traces back to something that actually cost time on one real project. This file is that record. Read it once per project so the rules read as reasons rather than rituals.

## Contents

1. The case
2. Where 165 prompts went
3. The eight gaps
4. What each retrofit cost
5. What stays human
6. The target for the next app
7. Measuring the next project

---

## 1. The case

- **Product:** an AI assistant app — streaming chat with image / PDF / voice attachments and long-term memory, a content library, a tracker feature, subscriptions (store billing on iOS, a manual payment channel elsewhere), push notifications, two UI languages (one in a tall non-Latin script), phone and tablet.
- **Stack:** Expo (React Native), expo-router, TanStack Query. At the fifth submitted build: about 22,800 lines of TypeScript in 282 files, 65 route files, 36 unit-test files, 82 commits, 21 PRs.
- **People:** one human acting as product owner and release manager; AI coding agents in parallel workspaces; a separate backend team with its own agent.

| When | What happened |
|---|---|
| Weeks before | First attempt in a visual app builder: 15 screens, then abandoned — it could not consume the streaming endpoints or bind an uploaded file to a request |
| Weeks before | Code project started; first version of the app (98 files) |
| Day 1 | Design export (39 screens) and an API reference handed over. Four decisions asked and answered. The app was rebuilt to the design in one approved turn — 25 commits that day |
| Day 2 | 45 prompts in one day: tab bar replaced by a drawer, chat restyled, backend changes relayed, social sign-in wired — 28 commits |
| Days 3–4 | In-app purchase, onboarding changes, profile picture, tablet layout, push, release notes |
| Days 4–8 | Store consoles walked by screenshot; signing set up; Android keyboard fixed; first build submitted |
| Day 8 | Automated block: subscriptions without a Terms of Use link in the listing |
| Day 12 | Rejected, 2.1(a): crash at launch on the newest iPadOS |
| Day 15 | Rejected, 2.3.10 + 5.1.1(i)/5.1.2(i) + 2.5.4: wrong-platform screenshots, third-party AI without consent, unused background audio |
| Day 21 | Rejected, 5.1.1(v): registration required for a feature the reviewer judged not account-based |
| Day 33 | Fifth build, with guest browsing, submitted (the outcome was not recorded) |

The feature build was one day. First submission to the fifth submitted build was 25 days.

---

## 2. Where 165 prompts went

Each prompt was given one primary label by the author of this skill. Borderline prompts exist (a bug report that also carries a design wish), so read the numbers as proportions, not measurements.

| Prompts | Share | Label | Typical prompt |
|---|---|---|---|
| 51 | 31% | Release, store consoles, rejections | a console screenshot and "what do I do next?"; a pasted rejection email |
| 29 | 18% | Human as tester | a simulator screenshot and "why is this happening?"; "can you test all features?"; "run it on Android too" |
| 23 | 14% | Operating the agent | "continue", "create PR", "can you run the app", "are you still working?" |
| 18 | 11% | Design iteration | "move this below the button", "use a drawer instead", reference screenshots of other apps |
| 15 | 9% | Product decisions and new requirements | "split app language from AI reply language", "no guest accounts in the database" |
| 14 | 8% | Identity, environment, credentials | client ids pasted into chat, "why are the sign-in buttons gone in this workspace?" |
| 8 | 5% | Backend contract | a new API guide and "implement this"; a message relayed from the backend agent |
| 7 | 4% | Kickoff and go-aheads | the design + API hand-over, "approved", "ok do it" |

Other facts worth keeping in mind: the median prompt was 55 characters; 80 of 95 attachments were screenshots; 11 prompts were an attachment with no words; several prompts contained a password; the largest turns were cut off 7 times (six session limits, one expired login) and each needed a "continue".

---

## 3. The eight gaps

Each gap is a difference between what the human handed over and what the agent needed in order to finish without them.

### Gap 1 — Decisions the inputs did not contain

**Observed.** A copy rule (call the AI "the AI", never by a professional title) arrived after the screens were written. Separating the app's language from the AI's reply language took eight prompts across two workspaces. The default language was set, then reversed. Whether a visitor can use the app without an account was only decided after a rejection — and then constrained by a product rule the agent could not have known (no guest accounts on the server).

**Why.** A design shows screens and an API shows endpoints. Neither says who may see what, what is sold where, what the app is *not*, or which words are off limits.

**Closes it.** The decisions asked once, in the kickoff message of Phase 0 (`01-intake.md`), and recorded in `docs/PROJECT_BRIEF.md`.

### Gap 2 — Design intent that only appears on a device

**Observed.** The prototype had a tab bar; one day after seeing it run, the human asked for a chat-first shell with a side drawer, modelled on other AI apps (34 files). The sign-in screen took five prompts in thirty minutes. The brand logo arrived after the first build, and the splash then showed three different designs in sequence.

**Why.** People judge an interface by using it. A static export is a hypothesis.

**Closes it.** Build the shell and the core flow first and get them approved on a device before building everything else (Phase 3); collect feedback in batched review rounds; ask for reference apps and brand assets up front (`03-design.md`).

### Gap 3 — API reality versus API docs

**Observed.** Field names, paging order and one whole response shape differed from the reference. The server rejected the audio type and the photo format the phone produces by default, validated magic bytes, throttled at 3 requests per second, signalled an exhausted quota only through a message prefix, and returned fresh tokens from an endpoint nobody expected to. A requirement on the push integration reached the mobile agent days later, relayed by hand from the backend agent.

**Why.** The reference was prose written for the happy path; the mobile agent had no test account at kickoff and no channel to the backend except the human's clipboard.

**Closes it.** A QA account and a smoke script before any screen (Phase 1), one gap report, an agreed fallback per gap, and a written handoff protocol between the two sides (`02-api-contract.md`).

### Gap 4 — Identity, environment and credentials

**Observed.** A developer team id was taken from git history and was the wrong one. OAuth client ids arrived one message at a time. Social sign-in buttons vanished in three workspaces on three days — first because env values were read dynamically and never inlined into release bundles, then because the git-ignored `.env` every new worktree copied was a month old and missing most of the variables. The same stale file pointed the privacy link at template text. Passwords were typed into chat.

**Why.** None of this is in a design or an API doc, and all of it is invisible until a release build.

**Closes it.** The identity & environment pack, a complete `.env.example`, files-to-copy plus a setup script that fails loudly, a release build in Phase 1, secrets by channel and never by value.

### Gap 5 — The agent could not see or touch the app

**Observed.** Uploads failed the first time a person tried them. A streaming caret kept blinking after the reply ended — reported four times. Tall-script text was clipped at the top. The tablet layout was broken. Composers stayed under the keyboard on Android, found a week in on a real phone because every earlier check ran on the iOS simulator. The human asked "can you test all features?" on day one and "run it on Android too" three times.

**Why.** Typecheck and a screenshot of the first frame are not a test. The agent had no tap automation on iOS, no standing instruction to cover Android or tablets, and no test account until one was typed into chat.

**Closes it.** Build the instruments before the features (QA tour, deep links, Maestro flows on both platforms, log markers), declare the device matrix in the brief, and make "seen running on every target" part of done (`06-verification.md`). Maestro was installed and proven on both platforms after this analysis — the iOS tap gap is closed.

### Gap 6 — Store and release knowledge arriving last

**Observed.** About 35 prompts were a console screenshot with "what next?". Agreements, app records, subscription products, capabilities, signing keys and the three certificate fingerprints that social sign-in needs were all discovered at the moment they blocked. Four rejections followed; three were standard checks for an AI app with accounts and subscriptions.

**Why.** Release was treated as the step after the app was finished, and nobody audited against the guidelines before submitting.

**Closes it.** The human-task list with lead times on day one, the submission audit before every upload, and a release-build launch test on the newest OS (the mobile-store-release skill).

### Gap 7 — Standing instructions that did not travel

**Observed.** "Always report in <the owner's language>" was saved as an agent memory in four different project folders and typed again in three workspaces. "Create PR" was typed four times, "continue" seven, "are you still working?" twice. The human was once told to run a command the agent could have run.

**Why.** Preferences lived in per-folder agent memory and in the human's head; the repository carried no instructions.

**Closes it.** `CLAUDE.md` in the repo from Phase 0 (`assets/CLAUDE.template.md`) — it travels with every clone and every worktree.

### Gap 8 — Depth of fix

**Observed.** "Find the root cause" was asked six times. The blinking caret took four prompts; the missing buttons took three workspaces. Each ended the moment the cause, not the symptom, was fixed — and the launch-crash rejection ended with a guard for the whole class (builds that are green and die before the first frame) because the human asked for the same pattern to be hunted.

**Why.** The first response to a report was the smallest change that made that screenshot look right.

**Closes it.** Root cause and same-pattern sweep as the default behaviour, not an escalation.

---

## 4. What each retrofit cost

Files changed by the commit that added the capability after the fact. Each would have been close to free in the foundation.

| Added late | Trigger | Files changed |
|---|---|---|
| Guest browsing with an account gate on every account-only route | Rejection 5.1.1(v) | 62 (35 routes wrapped) |
| Tablet layout — one centred content column everywhere | A human opened it on an iPad | 51 |
| Tab bar → drawer shell, new chat style | Human saw it running | 34 |
| In-app text size on every text element | A customer comment | 30 |
| Consent gate before sending data to the AI provider | Rejection 5.1.1(i)/5.1.2(i) | 20 |
| Review findings fixed at their root causes | An agent code review | 103 |

The pattern: **cross-cutting policies and layout rules are cheap on day one and touch every screen afterwards.** That is why the foundation phase builds the gates, the content column, the text primitive and the device matrix before any feature.

---

## 5. What stays human

No instruction set removes these. Plan around them instead of pretending otherwise.

- **Legal and commercial identity** — developer accounts, agreements, banking and tax forms, the legal entity.
- **Actions behind the owner's login** — creating app records and products, enabling capabilities, uploading builds, submitting for review, replying to reviewers. The agent prepares every value and writes the exact click path.
- **Taste** — approving the look and feel on a device.
- **Risk acceptance** — shipping with a known policy risk is the owner's call; the agent's job is to state the risk and the lever that removes it.
- **Secrets** — creating and holding keys and passwords.
- **Things simulators cannot do** — real push delivery, a sandbox purchase, the camera, how the keyboard feels on a cheap phone.
- **The reviewer** — an audit removes the known rejection classes; it does not guarantee approval, and platform SDK changes (a new OS requiring a new life-cycle) can only be caught by launching the release build on the newest OS.

---

## 6. The target for the next app

Not zero prompts — a different shape:

1. **Kickoff** with the brief (or with design + API, after which the agent returns one short message of decisions).
2. **One reply** to it.
3. **One on-device sign-off**, plus one or two batched review rounds.
4. **Console work** done from the written task list, on the human's own time, without chat.
5. **One release approval.**
6. **Whatever reviewers raise** — pasted verbatim.

That is on the order of ten to twenty prompts instead of 165. Treat it as a target to measure against, not a promise: count the prompts on the next project, label them the same way, and tighten whichever phase leaked.

---

## 7. Measuring the next project

The numbers in section 2 came from Conductor's local history; count the next project the same way and compare.

1. **Dump the prompts** with `assets/conductor/prompt-census.py --repo <name>` — it opens Conductor's local database
   read-only, prints prompts per workspace and session, and redacts any line that mentions a password, token or key.
   Write the dump only under the temp directory, never into the repository or the workspace notes: people paste
   secrets into prompts, and the case-study history held several.
2. **Label every prompt once** with the eight categories of section 2 (release/console, tester, operating the agent,
   design iteration, product decisions, identity/environment, backend relay, kickoff/approvals).
3. **Compare the shares** with the case study. A category that is still large points at the phase that leaked:
   tester → verification instruments; operating → `CLAUDE.md`; design → the Phase 3 sign-off; release → the
   human-task list and the store-release skill.
4. **Feed it back**: add the lesson to this skill (or the project's `CLAUDE.md`), with the evidence, so the next app
   does not pay for it again.
