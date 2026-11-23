# API contract — verify before you build (Phase 1)

An API reference is a claim written for the happy path. The app is built against what the server actually does: its shapes, its errors, its limits, its opinions about files. Finding those out with a script on day one costs an hour. Finding them out from a human holding a phone costs a prompt each.

## Contents

0. OpenAPI first
1. Contract checklist
2. The smoke script
3. Two documents: API requests and the gap report
4. Fallback policy for gaps
5. Working with the backend side
6. What the contract means for the client
7. Probe without a token
8. When the API is not there yet

---

## 0. OpenAPI first

A prose reference describes the API someone remembers. An OpenAPI file generated from the backend's own code
describes the API that runs — if it is regenerated on every change. Ask for that before asking for anything else.

**What to ask the backend for** (put it at the top of `docs/API_REQUESTS.md`):

1. An OpenAPI 3 export generated from the code (NestJS `@nestjs/swagger`, FastAPI, Spring, … all do it), committed to
   the backend repo — ideally a subset with only the endpoints the app calls.
2. Every endpoint the app calls is in it, with a 2xx response schema; the error envelope as one shared schema; streams
   described (`text/event-stream` with a schema for one event, a discriminated union on `type`).
3. A CI check that fails when the committed file is stale ("regenerate and commit"), and one line in the backend's
   agent instructions saying so.

**What it found on the case-study backend** (one request, one agent turn): three endpoints the app called were
filtered out of the mobile spec; five operations — including the two whose shape the app had been guessing — had no
response schema; the stream's terminal event was `complete`, not the `done` the docs and the request assumed; four
auth endpoints returned 201 where the spec said 200; nullable columns were documented as non-null. None of that was
visible from the app.

**What the app does with it:**

- Generate types: `npx openapi-typescript@latest <spec> -o src/types/openapi.d.ts` (the starter's `npm run api:types`).
  Run it through `npx` rather than installing it: its TypeScript peer range can lag the TypeScript the app uses.
  Derive the app's API types from the generated `components['schemas']` instead of hand-writing a second description
  of the same contract.
- Check the live API against it: the smoke script (section 2) with `--spec` compares each live response's required
  fields and top-level types with the spec.
- Regenerate when the backend's file changes; whatever stops compiling is the contract changing.

**No OpenAPI possible?** Fall back to the smoke script's printed shapes as the contract of record, and keep them in the
repo next to the hand-written types.

---

## 1. Contract checklist

For each area, know the answer or put the question in the gap report. "Observed" is a real surprise from the case-study project.

| Area | Know this | Observed |
|---|---|---|
| **Auth** | Login, register and social endpoints; token lifetimes; the refresh call and whether refresh tokens rotate; what a 401 means on *each* endpoint; which endpoints answer with a full auth body | A profile-picture endpoint returned fresh tokens. `DELETE /me` answered 401 for a wrong password, not a dead session. A social endpoint's 401 meant "provider token rejected" |
| **Error envelope** | Fields (code, message, details, trace id); which are stable; the validation-error shape | An exhausted quota was detectable only from a message prefix. Upload errors were raw English sentences naming MIME types |
| **Pagination and order** | Page/limit or cursor; default order; totals | Messages came oldest-first |
| **Shapes** | The exact response of every endpoint; nullable fields; enums; numbers that are strings | One response shape was undocumented, so the client had to accept three plausible variants; prices were strings |
| **Rate limits** | Per-second and per-minute limits; the 429 body | 3 requests per second — a screen that mounts five queries trips it |
| **Uploads** | Accepted types, size caps, magic-byte validation, field names, where files go, how long a signed URL lives | The default phone audio and photo formats were rejected; bytes were checked against the claimed type; signed URLs were minted at read time and must never be cached |
| **Streaming** | Protocol, event types, the terminal event, in-stream errors, keep-alives | New event types appeared mid-project; errors arrived inside the stream, after a 200 |
| **Public vs authenticated** | Which endpoints work without a token | This list *is* the guest experience |
| **Time** | Whose time zone decides "today"; date-key formats | Daily content depended on a server-side zone the app had to keep in sync |
| **Language codes** | The codes the API speaks | The server said `my`, the app said `mm` |
| **Nulls** | Whether request bodies may carry `null` | They could not, except on nullable fields |
| **Remote config** | Config or feature-flag endpoints; headers they depend on | The payment channel was switched per platform by a header the client had to send |
| **Idempotency** | Whether a retried POST is safe | "Send once" had to be enforced in the client |
| **Push** | How a device is tied to a user | No device table: the app must log the backend user id into the push SDK, or nothing is delivered |
| **Purchases** | The verify endpoint; which statuses are final and which mean "retry later" | Finish the store transaction only after a success, or after a final refusal; leave it open on transient errors |
| **Account deletion** | Endpoint and required confirmation fields | Needed by both stores |

---

## 2. The smoke script

Write it before the first screen, keep it in the repo, and rerun it whenever the backend says something changed.

**Rules**

- Plain Node with `fetch`; base URL and QA credentials come from the environment; a non-zero exit on any unexpected status.
- **Throttle** to the documented limit — otherwise the script measures the rate limiter.
- **Reversible writes only.** Create a temporary record, read it back, delete it. Never touch payments, subscription cancellation, password change or account deletion.
- Print, per call: `method path → status · shape`. The shape is what you compare with the docs.
- Never print tokens or the password. Run it against production only with an account created for the purpose.
- If the tool sandbox blocks network calls, run this one with network allowed — a bare "fetch failed" is the sandbox, not the API.

**Shape printer** (the useful part — it turns a response into something diffable):

```js
function shape(value, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return value.length ? `[${shape(value[0], depth + 1)} ×${value.length}]` : '[]';
  if (typeof value === 'object') {
    if (depth > 2) return '{…}';
    return '{' + Object.entries(value).map(([k, v]) => `${k}:${shape(v, depth + 1)}`).join(', ') + '}';
  }
  return typeof value;
}
```

**Cover, in this order:** auth (login, me, refresh, a deliberately wrong token) → every read the first slices need → one reversible write per domain → one tiny upload per accepted type and one rejected type → one short streaming turn → the error cases you will have to render (404, 400 validation, 403, 413, 429).

Empty arrays hide shapes. Seed the QA account so each list has at least one row, or create one and delete it.

---

## 3. Two documents: API requests and the gap report

They answer different questions and go out at different times.

| | `docs/API_REQUESTS.md` | `docs/API_GAPS.md` |
|---|---|---|
| Question | What is **missing**? | Where does the live API **differ** from its reference? |
| Source | Reading the design, the reference and the store rules | Running the smoke script |
| When | Phase 0, day one — the backend has a lead time too | Phase 1, once |
| Each row | The request, why it is needed (a screen, a store rule, a privacy problem), and what the app does if it is not there in time | Doc says / server does / impact / proposed resolution |

Split the requests into "blocks submission" (account deletion, a sign-in provider a store requires, a leaking endpoint, reporting) and "needed for the design as drawn". Numbered rows can be forwarded as they are.

The gap report is one document, sent once, to whoever owns the backend. (The rows below are illustrative.)

```markdown
# Contract gaps — <date>, against <base url>

| # | Endpoint | Doc says | Live API does | Impact on the app | Proposed resolution |
|---|---|---|---|---|---|
| 1 | GET /habits/summary | `{ total, done }` | `{ days: [{ date, done, total }] }` | Week grid cannot render | Update the doc; client follows the live shape |
| 2 | POST /files/audio | accepts m4a | 400 for `audio/x-m4a` | Voice notes fail | Allow it server-side, or the client records AAC |

## Screens with no endpoint
- Bookmark a video — no endpoint. Proposed: hide the control in v1.

## Questions
- What does a 401 from DELETE /me mean — wrong password or dead session?
```

Keep the table factual: what the doc says, what the server did, the status and body you saw. The backend side can act on that without a meeting.

---

## 4. Fallback policy for gaps

For every screen or control the API cannot serve yet, choose one and record it in the brief:

| Option | Use when | Example from the case study |
|---|---|---|
| **Ship a fallback** | A lesser version is still honest and useful | No "change password" endpoint → send the emailed reset code instead |
| **Hide behind a switch** | The backend will add it soon | Sign in with Apple built behind a flag until its endpoint went live |
| **Cut from v1** | No honest fallback exists | Phone OTP, bookmarks on videos |

Do not ship a control that calls nothing, and do not invent an endpoint. The human decides which option when the cut is visible to users; you decide when it is not.

**No remote-config endpoint?** Ask for a small public one (payment channel per platform, feature switches, minimum supported version). Until it exists, resolve those switches in **one function** backed by build-time values, so that pointing it at the endpoint later changes one module and no screen.

---

## 5. Working with the backend side

On the case-study project the human relayed messages between a frontend agent and a backend agent by copy and paste. That works, but only if what is relayed is a contract.

- **Requests go out numbered and exact:** the endpoint, the field, the shape you need and why. Keep them in `docs/API_REQUESTS.md` so both sides see the same list.
- **Answers come back as contract text** — endpoint, request, response JSON, error cases — pasted verbatim. Prose summaries lose the field that matters.
- **When a new API guide arrives with "implement this":** read it all → probe the endpoints → implement → update types, normalisers and tests → note where the guide and the server disagree. A guide attached to a clear ask was the most efficient prompt pattern on the whole project; keep it that way by verifying rather than trusting.
- **If the backend repository is readable, read it** — the controller and DTO at the *current* checkout beat any document. Confirm which checkout is current first, and never open its env or key files.
- **Report what only the backend can fix.** If a public endpoint exposes data it should not, say so plainly in your report; do not work around it silently.

---

## 6. What the contract means for the client

- **One client module** owns the auth header, single-flight token refresh, time-outs, the 401 policy, rate-limit scheduling and any header the server keys behaviour on. Screens never call `fetch`.
- **A 401 policy per endpoint class.** A session-bound 401 → refresh once → sign out only if the *server* refused the refresh. A transient failure (offline, timeout, 5xx, 429) never ends a session. Endpoints where 401 means "wrong input" opt out explicitly.
- **Normalise at the boundary.** Where a shape is undocumented or unstable, one tested normaliser per endpoint accepts the plausible variants and returns the app's type. Nothing above the API layer sees raw responses.
- **Branch on stable codes.** If the only signal is a message, isolate that match in one named function and ask the backend for a code.
- **Map errors to localised messages centrally,** with endpoint-specific mappers where the server's text is unusable for a person.
- **Types mirror verified shapes,** not the document.
- **A scheduler in front of every request** when the limit is low; long-lived streams bypass it.
- **Uploads get their own path** — longer time-out, the platform's native upload transport, type and size checked before sending, and error copy a person can act on.

---

## 7. Probe without a token

Call every GET with no credentials and write down what answers. That list tells you three things at once:

1. what a guest can be shown (see the guest gate in `04-architecture.md`);
2. what the store reviewer can reach before signing in;
3. whether anything public exposes personal data — an endpoint that returns other users' rows is a server defect, whatever the app does with it. Report it to the backend owner in the API requests; do not work around it in the client.

---

## 8. When the API is not there yet

Sometimes the request is "build the screens now, we'll wire the API later", or the server simply is not deployed. Do not let that put fixtures inside screens. A small local mock server that implements the endpoints the first screens need (the starter ships one, `npm run mock-api`) is often better than fixtures: the real HTTP client, the refresh flow and the error envelope all get exercised, and e2e flows have a backend that behaves the same on every run.

- Build the **API layer first, with its real interface** — the same `api.<domain>.<call>()` functions and types the live client will have — and back each domain with a typed fixture module.
- Mark every fixture-backed domain **unverified** in `docs/SCREENS.md` and in the reports. A screen built on a guessed shape is a screen that may change.
- If an API document exists, type the fixtures from it; if not, type them from the design and list every assumed field as a question for the backend.
- Still build the error, empty and loading paths: let a fixture be told to fail, be empty or be slow.
- The day the API is reachable, run the smoke script, write the gap report, and replace fixture modules one domain at a time. Screens should not need to change; where they do, the fixture had hidden a wrong assumption.
