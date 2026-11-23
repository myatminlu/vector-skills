# Data inventory

One table, three documents answered from it: the App Store's App Privacy answers, Google Play's Data safety form, and
the privacy policy. The in-app consent text (`src/features/consent/disclosure.ts`, `consent_*` strings) comes from it
too. Trace each row from the backend's code at its current checkout — never from assumptions — and update all four
together when a row changes (and raise `CONSENT_VERSION` if the AI rows change).

| Data | Collected when | Stored where | Sent to (processor) | Purpose | Retention | Linked to the user? |
|---|---|---|---|---|---|---|
| Email, password hash | sign-up / sign-in | backend database | — | account | until account deletion | yes |
| Questions and the item asked about | Ask | backend | `<AI provider>` | generate the answer | `<provider's retention>` | `<yes/no>` |
| Saved items | Save | backend database | — | the Saved list | until removed or account deletion | yes |
| Crash reports | `<if a reporter is added>` | `<vendor>` | `<vendor>` | stability | `<…>` | `<…>` |

**Never sent to the AI provider:** `<name, email, user id, …>` — confirm in the backend code.

**The AI provider's terms:** training on inputs `<yes/no, plan>`, retention `<…>`. Say exactly this in the privacy
policy; "never used for training" is only true on a plan that guarantees it.
