# Screen inventory

One row per screen. Gaps in either direction (a screen with no endpoint, an endpoint with no screen) are findings.
Replace the example rows with the app's as soon as the design arrives.

| # | Screen | Route (deep link) | Reached from | Shows (endpoint) | Does (endpoint) | States | Gate |
|---|---|---|---|---|---|---|---|
| 1 | Home | `/` | launch | `GET /items` | open item | loading, empty, error, offline | public |
| 2 | Item | `/item/[id]` | home | `GET /items/:id` | module actions | loading, error | public |
| 3 | Account | `/account` | home header or tab | — | language, legal links | — | public |
| 4 | Gallery | `/dev/gallery` | account (dev/QA builds) | — | — | — | dev only |
<!-- module screens: generated from modules.json by create-app / add-module; rows below this line are rewritten -->
