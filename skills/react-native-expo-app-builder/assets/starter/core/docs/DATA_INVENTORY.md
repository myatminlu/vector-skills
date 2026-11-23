# Data inventory

One table, three documents answered from it: the App Store's App Privacy answers, Google Play's Data safety form, and
the privacy policy. The in-app consent text comes from it too (ai-consent module). Trace each row from the backend's
code at its current checkout — never from assumptions — and update all of them together when a row changes.

| Data | Collected when | Stored where | Sent to (processor) | Purpose | Retention | Linked to the user? |
|---|---|---|---|---|---|---|
| Crash reports | `<if a reporter is added>` | `<vendor>` | `<vendor>` | stability | `<…>` | `<…>` |
<!-- module data: generated from modules.json by create-app / add-module; rows below this line are rewritten -->

**Never sent to a third party:** `<name, email, user id, …>` — confirm in the backend code.
