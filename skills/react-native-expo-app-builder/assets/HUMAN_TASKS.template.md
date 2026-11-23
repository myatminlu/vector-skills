# Your tasks — <App name>

> Things only the account owner can do. They have lead times, so start the long ones today — the build does not wait for them, and they should not wait for the build. Save as `docs/HUMAN_TASKS.md`.
>
> **For the agent filling this in:** replace every `<…>` with the exact value (bundle id, product ids, group names) so each row can be done without asking. Deliver the list on day one even though some values are not known yet: keep those rows and mark them `after: bundle id`, `after: API check` (product ids come from the live plan list) or `after: first upload`, then fill them in as the values arrive. Console layouts change — describe *what* to create and the values to enter, and add the click path only where you have verified it. Delete rows that do not apply. Never ask for a secret to be written here.

Legend: ⏳ lead time · ↩ what to send back (values only — no passwords or key contents)

---

## Start today — long lead times

| ☐ | Task | Where | ⏳ | ↩ |
|---|---|---|---|---|
| ☐ | Developer program enrolment (organisation accounts need a company identifier and verification) | Apple Developer | days – weeks | Team id |
| ☐ | Paid-apps agreement, banking and tax forms — **without it the paywall loads no products and shows no error** | App Store Connect → Business | days | "Active" |
| ☐ | Developer account and identity verification; note the **account type** (organisation or personal) | Google Play Console | days | Account type |
| ☐ | If the account is personal and new: plan the closed test — 12 testers opted in for 14 continuous days before production | Google Play Console | 2+ weeks | Tester list ready |
| ☐ | Privacy policy, terms, support page and account-deletion page **live** at their final URLs | Website | days | The four URLs |
| ☐ | Forward `docs/API_REQUESTS.md` to whoever owns the backend — some rows decide whether the app can be submitted at all | Backend owner | theirs | Which requests are accepted, and when |
| ☐ | Brand assets: app icon (1024 px), adaptive-icon layers, splash mark, single-colour notification icon | Designer | days | The files |

## Apple

| ☐ | Task | Values | ↩ |
|---|---|---|---|
| ☐ | Register the app identifier | `<bundle id>` with capabilities: <Push Notifications · App Groups `<group id>` · Sign in with Apple · In-App Purchase> | Done |
| ☐ | Register the notification-extension identifier (if push uses one) | `<bundle id>.<ExtensionName>` with the same app group | Done |
| ☐ | Create the app record | Name `<name>`, bundle id `<bundle id>`, primary language `<…>` | Done |
| ☐ | Create the subscription group and products — auto-renewable, one group | `<product id 1>`, `<product id 2>`, … (must equal the backend's plan list exactly) | Done; confirm prices |
| ☐ | Add each product's localisation and review screenshot; attach the products to the first version | — | Done |
| ☐ | Create a push key and upload it to the push provider | Team id + bundle id | Key id only |
| ☐ | Configure Sign in with Apple for the backend | Service / client id `<…>` | Done |
| ☐ | Create a sandbox tester account | — | Done (keep the login yourself) |
| ☐ | Review information: demo account, contact, notes | Notes drafted by the agent: `<path>` | Done |
| ☐ | App Privacy answers | Drafted by the agent from the data inventory: `<path>` | Done |
| ☐ | Terms of Use link in the listing (subscriptions) | Add `<EULA URL>` to the description, or upload a custom EULA | Done |
| ☐ | Upload screenshots | Produced by the agent: `<path>` — real captures of this platform | Done |

## Google

| ☐ | Task | Values | ↩ |
|---|---|---|---|
| ☐ | Create the app record | Name `<name>`; the first upload fixes the package `<application id>` forever | Done |
| ☐ | Upload the first bundle to internal testing (enrols store signing) | `<path to .aab>` | Done |
| ☐ | Copy the **app-signing** certificate SHA-1 (not the upload key's) | App integrity → App signing | The SHA-1 |
| ☐ | Data safety form, including the account-deletion URL | Drafted by the agent: `<path>` | Done |
| ☐ | Content rating, target audience, ads, category | Answers drafted by the agent: `<path>` | Done |
| ☐ | Store listing text and graphics | `<path>` | Done |
| ☐ | Payments profile (if selling through the store) | — | Done |

## Sign-in providers

| ☐ | Task | Values | ↩ |
|---|---|---|---|
| ☐ | OAuth consent screen | App name, support email, the privacy URL | Done |
| ☐ | OAuth client — Web | (the backend verifies tokens against this one) | Client id |
| ☐ | OAuth client — iOS | Bundle id `<bundle id>` | Client id |
| ☐ | OAuth client — Android, **debug** certificate | Package `<application id>` + SHA-1 `<debug SHA-1>` | Done |
| ☐ | OAuth client — Android, **upload** certificate | Package + SHA-1 `<upload SHA-1>` | Done |
| ☐ | OAuth client — Android, **store signing** certificate | Package + the SHA-1 copied from the store console (`after: first upload`) | Done |
| ☐ | Any other sign-in provider (each has its own developer app, and often its own review) | `<provider>` app for `<bundle id>` / `<application id>` | App id |

One client holds one fingerprint: **add** clients, do not edit an existing one — editing breaks whichever build used the old fingerprint.

## Push provider

| ☐ | Task | Values | ↩ |
|---|---|---|---|
| ☐ | Create the app in the push provider | — | App id (goes in `.env`) |
| ☐ | Upload the Apple push key | Team id, bundle id | Done |
| ☐ | Create a Firebase project for `<application id>` and upload its service-account credentials to the push provider | — | Done |

## This machine

| ☐ | Task | Notes |
|---|---|---|
| ☐ | The IDE is signed into the paid developer team | Needed for the archive |
| ☐ | Create the Android upload keystore **outside the repository**; back up the file and both passwords today | The agent gives the exact command |
| ☐ | Put the keystore path, alias and passwords in the user-level build properties file (owner-only permissions) | Never in the repo or in chat |
| ☐ | Put the complete `.env` in the repository's root directory | New workspaces copy it from there |
| ☐ | Put `QA_EMAIL` / `QA_PASSWORD` in `.env.local` | A test account that is safe to write with |

## At each release

| ☐ | Task |
|---|---|
| ☐ | Approve the version and build numbers the agent proposes |
| ☐ | Archive and upload the iOS build (if you hold the signing identity); close and reopen the workspace first when the agent says the native project was regenerated |
| ☐ | Upload the Android bundle from `<artifact folder>` |
| ☐ | Paste the review notes; submit |
| ☐ | When the reviewer answers, paste the **whole** message to the agent |
