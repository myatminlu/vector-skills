# Design — from a static export to an approved look (Phases 0 and 3)

A design export is a hypothesis about what the owner wants. On the case-study project the 39-screen prototype was built faithfully in a day — and the day after, having used it, the owner replaced the navigation paradigm and restyled the core screen. Nothing was wrong with the build. The design simply had not been tested by a person holding it.

This file is about shortening that loop: read the design completely, settle the expensive questions on a real device early, and collect feedback in rounds instead of one screenshot at a time.

## Contents

1. What a design hand-off must contain
2. The screen inventory
3. Where the design and the platform disagree
4. The states designs never draw
5. Tokens before screens
6. On-device sign-off
7. Review rounds
8. Change requests
9. Type, copy and brand assets
10. Native feel

---

## 1. What a design hand-off must contain

| Part | Needed for | If missing |
|---|---|---|
| Every screen, sheet and modal, with the flow between them | The route map | Ask; do not invent screens |
| Tokens — colours, type scale, spacing, radii | The theme module | Extract them from the export and confirm the extraction |
| The string table in every language | Localisation from day one | Build with keys anyway; ask for the missing language |
| Brand assets — app icon, adaptive-icon layers, splash mark, logo, notification icon | Native config | Ask for them in the kickoff message; an icon that arrives later means the launcher and splash are done twice |
| Two or three reference apps ("it should feel like…") | The feel no static frame carries | Ask — the reference apps arrived on day 2 as phone screenshots and changed the whole shell |
| What "native" means to the owner | Component choices | Ask (section 3) |

## 2. The screen inventory

Before any code, turn the design into a table — one row per screen, like the example row below — and save it as `docs/SCREENS.md`. It is the coverage matrix of Phase 0 and the map every later phase uses.

| # | Screen | Route | Reached from | Shows (endpoint) | Does (endpoint) | States | Gate |
|---|---|---|---|---|---|---|---|
| 12 | Habit list | `/habits` | drawer, home card | `GET /habits`, `GET /habits/today` | toggle → `PUT /habits/:id/log` | loading, empty, error, offline | account |

- **Gate** is one of *public*, *account*, *consent*, *plan* — decided here, enforced by the foundation (see `04-architecture.md`).
- Rows with no endpoint, and endpoints with no row, are the gap list: they become decisions in the kickoff message or rows in `docs/API_REQUESTS.md`.
- Add the screens a store requires that nobody drew — account deletion, a consent step, a sign-in prompt for guests, report and block — as rows of their own.
- The **Route** column becomes the typed route builders and the deep links; the **#** becomes the frame number in every review round.

## 3. Where the design and the platform disagree

Designs often draw custom versions of things the platform already provides: a tab bar with a raised centre button, a hand-made bottom sheet, a custom picker. Each one is a place where "pixel-perfect" and "feels native" pull apart, and only the owner can say which wins.

Ask once, in the kickoff message:

> Where the design draws its own version of a system control — tab bar, sheets, menus, pickers, sliders — should I (A) use the system control in the design's colours, or (B) rebuild the drawn one? I recommend A: it gets platform behaviour, accessibility and future OS styling for free.

On the case-study project "native UI" was the first thing the agent had to ask about. The answer was: one codebase, platform primitives everywhere — system stack headers, system sheets, pull-down menus, system pickers and sliders, the platform's own material on iOS. The drawn tab bar's raised button was dropped on purpose. Record the answer in the brief so nobody "restores" the drawn control later.

Two controls are never yours to restyle: Apple's sign-in button and Google's logo. Use the official ones.

## 4. The states designs never draw

A design shows each screen once, full of perfect data. A person meets these instead — define each one **once** in the design system and compose it everywhere:

| State | Decide |
|---|---|
| Loading | Skeleton or spinner; never a blank screen |
| Empty | Icon, one sentence, the next action |
| Error | Localised message, retry; the error is selectable text so it can be reported |
| Offline | A banner, and what still works |
| Permission denied | What the feature needs and a route to settings |
| Long text | Wrap, or truncate with "read more" |
| Largest text size | Nothing clips; fixed-height boxes opt out explicitly |
| Second language / tall script | Line height from the font, not from the Latin design |
| Keyboard up | The focused field and the primary action stay visible — on both platforms |
| Tablet width | One centred reading column; forms narrower still |
| End of a list, pull to refresh | — |
| Destructive action | Confirmation sheet |
| Guest | What the screen shows without an account, or the sign-in prompt |

If the design is silent, pick the convention, show it in the first review round, and move on.

## 5. Tokens before screens

- Extract colours, the type scale, spacing, radii and layout widths into one theme module. Screens contain no literal colours or sizes.
- Give the palette a type even when only one theme ships, so a second palette is an addition rather than a rewrite.
- Define two content widths early: a **reading column** for lists, chat and articles, and a narrower **form column** for inputs and their buttons. A full-width text field on a tablet reads as a mistake.
- Keep the design's own numbers in the type scale and apply any global enlargement as **one multiplier**. On the case-study project "make the text a little bigger" became a one-constant change only after the text primitive was rebuilt around a multiplier.

## 6. On-device sign-off

This is checkpoint 2 and the cheapest moment the look and feel will ever have to change.

**Build:** sign-in, the navigation shell, and the one flow that is the product — against the real API.

**Capture:** a contact sheet with iPhone, Android phone and tablet; every language; one frame at the largest text size; one with the keyboard up.

**Ask, explicitly:**

1. Navigation — is this the right shell (tabs, drawer, something else)? If there is any doubt, show the alternative as a second screenshot now.
2. Component feel — system controls and materials as shown?
3. Type size — comfortable for your users at the default?
4. Default language on a fresh install?
5. The core interaction — message style, composer, the primary action's position?
6. Anything that simply feels off?

Then stop and wait. Fanning out to forty screens on an unapproved shell is how one sentence ("I think we should use a drawer") turns into a 34-file change.

## 7. Review rounds

Feedback that arrives one screenshot at a time costs a turn per sentence. Replace it with rounds:

1. After each batch of slices, send a **numbered contact sheet** — one frame per screen per platform, numbered from the inventory.
2. Ask for **everything in one message**, by number: "12: move the streak above the list. 14: too much space under the tip."
3. Fix all of it, then resend **only the frames that changed**.

Two rounds usually settle a screen that would otherwise take ten prompts.

**When a screenshot arrives with no words:** say what you think it shows and what you take the request to be. If it shows an obvious defect, fix it. If it shows a console or a settings page, the question is almost always "what do I do next?" — answer that. Guessing broadly wastes the turn; asking one precise question does not.

## 8. Change requests

A design change is fully specified by five lines:

```
What:       restore-purchases becomes a text link
Where:      plans screen, under the subscribe button
Reference:  <screenshot or app>
Done when:  link under the button on phone and tablet, both languages
Not in it:  the paywall sheet
```

People rarely write all five. When a request arrives as one sentence, restate it in this shape in two lines and proceed — do not block on a form. Block only when the change is expensive to reverse (the shell, a gate, a theme).

**"What do you think?"** means the owner wants a recommendation, not a list of options. Give one, with the reason, in two or three sentences. Whether you then proceed or wait is set by the working agreement.

## 9. Type, copy and brand assets

- **Non-Latin scripts:** take line height from the font's own metrics, not from the Latin numbers in the design. Text inputs choose the font from the placeholder too, or a placeholder in the second script falls back to a system font and clips. Check the tallest glyph clusters in titles, chips and inputs, on both platforms — they clip differently.
- **Reading text:** start body and chat text at about 16 pt. If the audience skews older or reads a dense script, plan an in-app text-size setting; it is a foundation feature, not a late one.
- **Copy rules** from the brief become a search you run before every commit that touches strings.
- **Every string goes through localisation from the first screen,** in every language, guarded by a parity test.
- **One splash path:** native splash → an identical in-app overlay → first screen. Three different launch visuals in a row was a real bug report.

## 10. Native feel

- System navigation: stack headers, the back gesture, large titles where the platform expects them.
- System sheets with detents; system pull-down and context menus; system pickers, date pickers and sliders.
- Haptics on the few actions that deserve them.
- Platform materials through **platform-specific files**, not a forest of `if (platform)` — the other platform should not even bundle the code.
- Safe areas and edge-to-edge handled by one screen primitive.
- Respect the OS text size and reduced-motion settings.
