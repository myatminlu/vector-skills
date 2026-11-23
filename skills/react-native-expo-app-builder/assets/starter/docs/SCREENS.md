# Screen inventory

One row per screen. Gaps in either direction (a screen with no endpoint, an endpoint with no screen) are findings.
Replace the template's rows with the app's as soon as the design arrives.

| # | Screen | Route (deep link) | Reached from | Shows (endpoint) | Does (endpoint) | States | Gate |
|---|---|---|---|---|---|---|---|
| 1 | Sign in | `/sign-in` | launch when signed out | — | `POST /auth/login`; continue as guest | error | public |
| 2 | Home | `/` | tab | `GET /items` (persisted) | open item; open saved | loading, empty, error, offline | public |
| 3 | Item | `/item/[id]` | home, saved | `GET /items/:id` | save → `POST /me/saved`; ask | loading, error | public; save/ask: account |
| 4 | Ask | `/ask?itemId=` | item | — | `POST /ask` (SSE) | thinking, streaming, error, switched off | account + consent + flag `ask.enabled` |
| 5 | Saved | `/saved` | home header | `GET /me/saved` | open item | loading, empty, error | account |
| 6 | Account | `/account` | tab | user | language, text size, consent withdraw, legal links, sign out, delete | guest variant | public (signed-in rows: account) |
| 7 | Sign-in required | sheet | any account-only action by a guest | — | sign in / cancel | — | — |
| 8 | AI consent | sheet | first send to the AI | — | allow / not now | — | account |
| 9 | Delete account | sheet | account | — | `DELETE /auth/me` | busy, error | account |
| 10 | Gallery | `/dev/gallery` | account (dev/QA builds) | — | — | — | dev only |
