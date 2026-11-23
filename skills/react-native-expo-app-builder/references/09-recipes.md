# Recipes — features that stay instructions, not code

Some features change with their vendor's SDK every few months: push notifications, in-app purchase, social sign-in,
crash reporting, over-the-air updates, analytics. Code for them in this skill would be out of date before the next app
started. So each is a recipe: when it is worth it, what the owner must do in a console (with lead times), how it plugs
into the starter, what went wrong on the case-study project, what the stores want declared, and how to prove it works.
Write the code at the time, from the vendor's current docs and Expo's official skills; install with `npx expo install`.

Every recipe ends up as a module of the app's own — a folder in `src/modules/<name>/` whose `index.ts` calls
`registerModule` — so the core stays untouched and the next agent finds the feature in one place.

## Contents

1. Push notifications
2. In-app purchase and subscriptions
3. Social sign-in (Apple, Google, others)
4. Crash reporting
5. Over-the-air updates
6. Analytics

---

## 1. Push notifications

**Worth it when** the app has something time-sensitive to say (a reply, a booking change), not as a marketing channel by default.

**Owner's tasks (start on day one):** an Apple push key (`.p8`) and the Firebase project's service account uploaded to
the push provider; the provider's app id; for iOS, the push capability on the app id. Hours, but each waits on a login.

**How it plugs in:** an `onSessionChange` listener from the auth module logs the backend user id into the push SDK on
sign-in and out on sign-out; a `Provider` initialises the SDK once; a tap handler routes through `href` builders (so a
tap from a terminated app lands on the right screen); the permission prompt is asked once, after onboarding, with one
sentence of reason. If the provider needs a notification-service extension (iOS), it comes from a config plugin.

**Seen on the case-study project:** nothing arrived and the backend logged "no recipient" — the SDK was never
initialised (missing app id) or the user was never logged into it. Production pushes never arrived from a build that
used the sandbox environment. The extension's deployment target, left at the plugin's default, was refused by a new
Xcode. Android devices never subscribed until the FCM service account was uploaded to the provider.
(`07-expo-react-native.md` §9.)

**Stores:** declare push and any identifiers in App Privacy and Data safety; the app must work when the permission is refused.

**Prove it:** a real device (simulators do not receive remote pushes reliably), a production build, a push sent from
the provider's console to the QA account; a tap from a terminated app opens the deep-linked screen.

## 2. In-app purchase and subscriptions

**Worth it when** the app sells digital content or features. Apple requires its in-app purchase for those (3.1.1);
Google Play expects its billing. Any other channel is the owner's policy risk to accept, in writing.

**Owner's tasks (days):** paid-apps agreement, banking and tax in both consoles; the subscription group and products
(ids from the backend's plan list), with review screenshots; a sandbox tester. Products load only after a build with
the bundle id has been uploaded.

**How it plugs in:** a store-billing provider in an iOS-only (or per-platform) file so other platforms never bundle it;
one purchase listener mounted with the signed-in stack (a `Provider` that reads the user from the auth module); the
backend verifies every transaction and owns the entitlement; the paywall reads the store's localized price; which
channel a platform offers is a remote switch (`slots.useFlag`) so a payment option can be hidden during review without
a release. Finish a transaction only after the server accepts it or refuses it for good — leave it open on a transient
error so it is replayed. (`07-expo-react-native.md` §10.)

**Seen on the case-study project:** subscriptions submitted without a Terms of Use link in the listing were blocked by
an automated check within hours; reviewers asked the owner to confirm unusually high prices.

**Stores:** purchase history in App Privacy and Data safety; on the paywall what is bought, the period, the price,
Restore, and links to the Terms of Use and the privacy policy — and a working Terms link in the listing.

**Prove it:** a sandbox purchase on a real device with an uploaded build: buy → verify → entitlement; restore; cancel;
a transaction replayed after killing the app mid-purchase.

## 3. Social sign-in (Apple, Google, others)

**Worth it when** the design or the market expects it. Offering any third-party login on iOS means offering Sign in
with Apple as well (4.8).

**Owner's tasks (hours, per environment):** OAuth clients — web, iOS, and one Android client **per signing
certificate** (debug, upload, and the store's re-signing key, whose fingerprint appears only after the first upload);
Apple's Sign in with Apple capability and service id; the backend endpoints that exchange the provider token.

**How it plugs in:** buttons in the auth module's `signInFooter` slot; the token exchange in the auth module's API;
the session starts exactly like an email sign-in. Hide a provider whose configuration is missing, and log a clear
development warning when it is hidden, or it looks deleted.

**Seen on the case-study project:** Google sign-in worked locally and failed for every store install until the store's
re-signing fingerprint had its own Android client — and editing the existing client to hold it broke local builds.
Apple returns the user's name only once. The buttons "disappeared" in three workspaces because a stale `.env` was
copied into them. (`07-expo-react-native.md` §2, §8.)

**Stores:** the provider SDK's data collection goes into both privacy forms.

**Prove it:** each provider on each platform, with a build signed the way users will get it (a store-signed build
for the store fingerprint).

## 4. Crash reporting

**Worth it when** always, before the first release. The case-study app shipped with an error boundary and no crash
reporter, and crashes on users' phones were invisible until a reviewer or a customer mentioned them.

**Owner's tasks:** an account with the vendor (or at least the stores' own crash pages); the DSN or key as an
environment variable name.

**How it plugs in:** a `Provider` that initialises the SDK; the core error boundary's `componentDidCatch` reports to it,
and a global handler catches errors outside render; `onSessionChange` attaches the user id (not the email). Upload
symbols with every release build — dSYMs, the R8 mapping file, JS source maps — or the stacks are guesses.

**Stores:** crash data in App Privacy and Data safety.

**Prove it:** a deliberate crash in a release build appears symbolicated in the dashboard.

## 5. Over-the-air updates

**Worth it when** copy and JavaScript fixes should ship without a store review.

**Owner's tasks:** the build service account and plan, if the vendor's service is used; a decision on channels
(production, preview) and who may publish.

**How it plugs in:** app config (runtime version policy, update URL) through config plugins — never by editing native
projects; the runtime version changes whenever native code changes, so an update never needs a native module the
installed binary lacks. Native configuration (permissions, plist strings, plugins) never ships over the air.

**Stores:** updates must stay within the stores' rules: no new native code, no change to the app's purpose.

**Prove it:** publish to a preview channel, install a release build on that channel, see the change arrive; roll back.

## 6. Analytics

**Worth it when** someone will act on the numbers. Default off; crash reporting comes first.

**Owner's tasks:** the vendor account, the events that matter (a short list), and the privacy policy wording.

**How it plugs in:** a `Provider` that initialises the SDK, an `onSessionChange` listener for the user id (hashed if
possible), and a small `track(event, props)` function features call — never the vendor SDK directly from screens. If
the app tracks across apps or sites, Apple's tracking prompt (App Tracking Transparency) comes first.

**Stores:** analytics data in App Privacy and Data safety, matching the policy.

**Prove it:** the events of one session appear in the vendor's debug view from a release build.
