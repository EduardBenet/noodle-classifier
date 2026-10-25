# Noodle Index — Implementation Plan

Multi-user ratings · Submission queue · Community averages

---

## Completed

- `GET /api/noodles` — merges aggregates into every response
- `POST /api/ratings` — incremental average update with optimistic concurrency (etag retry)
- Owner role check on `POST`/`PUT /api/noodles`
- Aggregate + rating seeding when owner adds a noodle (unrated defaults to 3/3 via `api/src/lib/noodle.js`)
- `POST /api/submissions` — authenticated users submit new noodles
- `GET /api/submissions` — owner-only queue listing
- `PUT /api/submissions` — owner approve (seeds aggregate) / reject
- Shared `parsePrincipal` auth helper (`api/src/lib/auth.js`)
- `auth.js` routes nav "Add" by role; sets `window.currentUser`
- Code review fixes #1–4
- **Phase 2 — Community ratings display** (see below)
- **Mobile card layout** — the ≤600px rules used to stack title / image / stats vertically, leaving most of a phone's width empty. Now a compact list row: 64px thumbnail left, name over brand, then one line of stars · spice · price (price pinned right). Brand parentheses moved from `cards.js` into CSS so they can be dropped when the brand sits on its own line; `<360px` drops the rating count to keep that line intact. Desktop layout unchanged. Verified at 320 / 360 / 412px with no horizontal overflow.

- **Everything since Phase 7** — see *Since the Last Plan Update* below. Two of those changes supersede wording in the older sections: the **`aggregates` container no longer exists** (community scores are fields on the noodle document), and the **owner's score is no longer stored on the noodle** (it is a row in `ratings` like anyone else's).

---

## Phase 1 — Backend Polish `done`

| Task | File |
|------|------|
| Shared `CosmosClient` + container refs; all three functions import from it (finding #5) | `api/src/lib/cosmos.js` |
| `?id=` is now a point read on `packages` **and** `aggregates` — no scan on either (finding #6) | `api/src/functions/noodles.js` |
| `mergeAggregates` point-reads whenever there is exactly one result, and scans only for multi-result lists | `api/src/functions/noodles.js` |

---

## Phase 2 — Community Ratings Display `done`

> The frontend now reads `avgRating`/`avgSpicy`/`ratingCount` everywhere. Owner's static `rating`/`spicy` remain on the document and are still what the add/edit form edits — they seed the aggregate and act as the fallback if an aggregate row is ever missing.

| Task | File |
|------|------|
| `communityRating()`/`communitySpicy()` helpers — `avgRating ?? rating ?? 0` | `assets/js/cards.js` |
| Fractional score meter: clipped coloured glyph row over a grey track, so 3.7 fills 74% | `assets/js/cards.js`, `assets/css/style.css` |
| Exact score in a CSS tooltip — hover on a mouse, tap-to-toggle on touch (native `title` never fires on touch). Tap `stopPropagation`s so it doesn't also open the overlay | `assets/js/cards.js`, `assets/css/style.css` |
| `ratingCount` shown as a small `(4)` next to the stars | `assets/js/cards.js` |
| Sort options renamed `avgRating-*`/`avgSpicy-*`; `sortNoodles` resolves them through the helpers | `assets/js/list.js`, `src/list.html` |
| Overlay uses the meters plus a `community-summary` line | `assets/js/overlay.js` |
| Profile stats, star distribution (bucketed to nearest whole star) and highlights use the averages | `assets/js/profile.js` |
| Verified in Chrome against a stubbed `/api/noodles`: fractional fills, tooltip on hover + tap, all four sort orders, overlay, profile | — |

---

## Phase 3 — Rating Widget `done`

> Logged-in users rate from the overlay. Pre-fill uses a per-noodle point read rather than caching every rating at page start, so it stays flat as the catalogue grows.

| Task | File |
|------|------|
| `GET /api/ratings?noodleId=` — caller's own score via point read; 401 unauthenticated, 400 without `noodleId`, `null` when unrated | `api/src/functions/ratings.js` |
| `POST /api/ratings` now returns the **stored** (rounded) averages, not the raw maths, so the client's copy matches a later read | `api/src/functions/ratings.js` |
| Rating UI (stars + spice, reusing the add-form radio styling) in the overlay, hidden by default | `src/_includes/overlay.html`, `assets/css/style.css` |
| `window.authReady` promise so the widget waits on `/.auth/me` instead of racing it | `assets/js/auth.js` |
| Widget shown only when authenticated; pre-filled from the endpoint; guarded by an open-token so a slow fetch can't populate the wrong noodle | `assets/js/overlay.js` |
| Submit updates the community meters, summary and `ratingCount` in place | `assets/js/overlay.js` |
| `window.refreshNoodleCards` hook so the list card behind the overlay picks up the new average | `assets/js/list.js` |
| Verified in Chrome: pre-fill, re-rate (count held at 3, avg 3.7→4.0), first rating (count 1→2), reset between noodles, widget hidden when logged out | — |

---

## Phase 4 — Submission Flow `done`

> Non-owners already get routed to `/submit` from the nav. Build the page.

| Task | File |
|------|------|
| Extract toast, barcode scanner and Open Food Facts autofill out of `add.js` into a shared module — `initScanner(onBarcode)` takes a per-page callback | `assets/js/noodle-form.js` |
| `submit.html` — `add.html`'s fields minus rating/spice (the owner assigns those at approval), scanner included | `src/submit.html` |
| Form handler — POST to `/api/submissions`; 409 duplicate, 401, network and generic errors each handled | `assets/js/submit.js` |
| Duplicate check also runs on barcode blur/scan, before the user fills the rest of the form | `assets/js/submit.js` |
| `?search=` deep link on the list page, so the duplicate message can link straight to the existing noodle | `assets/js/list.js` |
| Nav label reads "Suggest" for non-owners, "Add" for the owner | `assets/js/auth.js`, `src/_includes/header.html` |
| Protect `/submit` and `/submit.html` at `authenticated` role | `src/staticwebapp.config.json` |
| Verified in Chrome: duplicate barcode → message + working "View it" link; new barcode → 201, correct payload shape, form reset; `add.html` prefill still works after the refactor | — |

---

## Phase 4.5 — My List `done`

> Ratings were being written with no way to read them back in bulk. "My List" is the personal counterpart to the catalogue list: the same cards, but with your own score under each one. For the owner the row set is effectively `packages` (adding a noodle seeds an owner rating), but the page still earns its place — it shows where your score differs from the community's.

| Task | File |
|------|------|
| `GET /api/ratings` with no `noodleId` returns the caller's history, each row joined with its noodle document and aggregate | `api/src/functions/ratings.js` |
| `ratedAt` stamped on every rating write, so the list can be ordered | `ratings.js`, `noodles.js`, `submissions.js` |
| `mylist.html` — cards with descriptions plus a "YOU" row; sortable by recently rated / my rating / my spice / price; empty state links to the list | `src/mylist.html`, `assets/js/mylist.js` |
| Overlay keeps `myRating`/`mySpicy`/`ratedAt` current after a save, so re-rating from My List updates the row in place | `assets/js/overlay.js` |
| "My List" nav entry, revealed for signed-in users | `src/_includes/header.html`, `assets/js/auth.js` |
| Protect `/mylist` and `/mylist.html` at `authenticated` role | `src/staticwebapp.config.json` |
| Verified: rows scoped to the caller, ratings for deleted noodles skipped, re-rating from My List updates the YOU row and re-sorts, empty state, nav visibility | — |

**Scaling note:** `ratings` is partitioned by `userId`, so the history is a single-partition query followed by point reads per rated noodle — cost scales with how much *you* have rated, not with the catalogue size.

---

## Code Review Fixes (round 2) `done`

> All eight findings from the `/code-review high` pass. The first three API findings shared a root cause — four places each hand-rolled the rating + aggregate update — so they are fixed once in `api/src/lib/rating.js` (`applyRating`), now used by `POST /api/ratings`, owner add, owner edit and submission approval.

| # | Finding | Fix |
|---|---------|-----|
| 1 | **High** — a rating losing an etag race was stored but silently excluded from the average forever; the retry re-read the row it had just written and treated a new rating as an edit | Read the caller's existing rating **once**, outside the retry loop; write the rating before the aggregate |
| 2 | No type/range validation — `rating: 1000` permanently skewed the average, `"abc"` produced `NaN` → `null` | `parseScore` requires a whole number 1–5; 400 otherwise |
| 3 | Approving a duplicate submission reset the aggregate to `ratingCount: 1`, discarding real ratings | Approval goes through `applyRating`, folding the owner's score into any existing aggregate |
| 4 | `PUT /api/noodles` updated the package only, so editing a rating changed nothing the site displays | `PUT` routes the owner's score through `applyRating` |
| 5 | `refreshNoodleCards` re-rendered the paged list, wiping active search results and restoring pagination | Track `searchResults`; re-render the active set, and patch the `allNoodles` copy from the noodle the overlay passes back |
| 6 | Anonymous writes returned 403, making `add.js`'s 401 login branch dead code | 401 without a principal, 403 without the role |
| 7 | Approve ran the publish and the delete concurrently; a repeat approve 404'd and reported 500 for work that succeeded | Sequential publish → rate → delete, tolerating 404 on the delete |
| 8 | Barcode lookups had no `catch`, so a failed fetch was an unhandled rejection with no user feedback | Both lookups swallow and surface errors |

**Verification:** 33 API checks pass. The #1 regression test was proved meaningful by temporarily reintroducing the bug — it fails (count stuck at 2, average unmoved) and passes once the fix is restored. #5 verified in the browser: rating a search result keeps the results on screen and updates the cached average once the search is cleared. #8 verified by forcing `fetch` to reject and confirming a toast appears with no unhandled rejection.

---

## Score Scales `done`

> Spice runs **0–5** (0 = not spicy at all); stars run **1–5**. Previously `0` was used as the "not entered" marker everywhere, so a genuinely not-spicy noodle was silently rewritten to 3 on every save, and the rating API rejected spice 0 outright.

| Task | File |
|------|------|
| `withRatingDefaults` only defaults when a value is absent or out of range, with per-field minimums | `api/src/lib/noodle.js` |
| `parseScore(value, min)` — rating 1–5, spice 0–5 | `api/src/lib/rating.js`, `api/src/functions/ratings.js` |
| "None" pill added to the spice picker on the add form and the overlay widget; sits outside `.spice-chilies` so the checked-sibling fill still works for 1–5 | `src/add.html`, `src/_includes/overlay.html`, `assets/css/style.css` |
| The form sends `null`, never `0`, when nothing is selected | `assets/js/add.js` |
| Backfill preserves a stored spice 0 verbatim; only a missing/out-of-range field falls back (aggregate first, then 3) | `api/scripts/backfill-ratings.js` |

**Verified:** 40 API checks and 22 backfill checks pass, including spice 0 accepted end-to-end, spice −1 rejected, owner POST/PUT preserving spice 0, and null scores still defaulting to 3. In the browser: unset sends `null`, the None pill submits 0 and styles correctly on both forms, prefill selects None for a stored 0, and rating a noodle with spice None moved the community average 4.75 → 3.8.

---

## Ratings Partition Key `done`

> The `ratings` container was created with a **hierarchical** partition key `/UserId, /NoodleId`, while the code writes `userId`/`noodleId` and passed a single scalar key. Cosmos property paths are case-sensitive, so every backfilled document landed with no partition key value, and nothing could read them back — the container was effectively write-only. That is why My List stayed empty.

| Task | File / action |
|------|---------------|
| Point reads pass both levels: `ratings.item(id, [userId, noodleId])` | `api/src/lib/rating.js`, `api/src/functions/ratings.js` |
| History query relies on the `c.userId` equality filter for routing — **not** a `{ partitionKey: [userId] }` feed option, which 500s (see below) | `api/src/functions/ratings.js` |
| Test harness models real partition keys — wrong level count throws 400, mismatched key does not resolve | `api-check.js` (scratchpad) |
| Recreated the `ratings` container with `/userId, /noodleId` (lowercase, `MultiHash` v2) `done` | `az rest` PUT against the ARM API — `az cosmosdb sql container create` takes only one `--partition-key-path`, even on 2.89.1; multi-path needs the `cosmosdb-preview` extension |
| Re-ran the backfill with `--apply` against the recreated container `done` | `api/scripts/backfill-ratings.js` |
| Confirmed `packages`, `aggregates` and `submissions` are all `Hash` on `/id` (lowercase) `done` | `az cosmosdb sql container list` |

**Prefix partition keys are not supported on the query path.** After the container was recreated, My List still returned 500. Application Insights gave the real error — `Partition key provided either doesn't correspond to definition in the collection`, thrown from `ClientContext.queryFeed`, not from any point read. `@azure/cosmos` 4.x implements prefix partition keys **only for the change feed**: `isPrefixPartitionKey` and `getEPKRangeForPrefixPartitionKey` exist solely under `dist/commonjs/client/ChangeFeed/`. On `items.query()` the SDK forwards the one-component key verbatim and the gateway rejects it against the two-component definition. Removing the feed option is not a downgrade — an equality filter on the first level of a hierarchical key is routed by the backend to only the physical partitions holding that prefix, so `WHERE c.userId = @userId` already provides the scaling the feed option was meant to buy.

**The harness missed this.** It modelled a one-component key in `FeedOptions` as a valid prefix, so all 40 checks passed while production 500'd on every request. Any future harness needs to reject a partial key in `FeedOptions` while still accepting a partial key on the change feed.

**Verified:** 40 API checks pass against a harness that now enforces the two-level key; reverting one point read to a scalar makes 2 checks fail, so the harness genuinely catches this. The backfill also now prints its target endpoint and reads its own writes back, so a silent write-to-nowhere is reported rather than assumed.

---

## Phase 5 — Owner Review Queue `done`

> Owner reviews, edits, and approves or rejects pending submissions.

| Task | File |
|------|------|
| Create `queue.html` — owner-only, lists pending submissions | `src/queue.html` |
| Render each submission as an editable card; owner can tweak any field and assign a rating | `assets/js/queue.js` |
| Approve: `PUT /api/submissions` with `action: "approve"` + final noodle payload; reject: `action: "reject"` | `assets/js/queue.js` |
| Protect route at `owner` role | `src/staticwebapp.config.json` |
| Add queue link to owner nav — hidden in the markup, revealed by `auth.js` for the owner | `src/_includes/header.html`, `assets/js/auth.js` |

**Notes**

- Oldest first: the queue is a backlog, so the longest wait is reviewed first.
- Reject is confirmed, approve is not. Reject deletes the suggestion and nothing else records it; approve publishes what is on screen and is visible in the index immediately.
- Approve is a real `submit`, so the browser's own `required` validation blocks a half-filled card before any request goes out.
- **This is the only page that renders text other people typed.** Every submitted field goes through `.value`/`.textContent`; the sole `innerHTML` builds the radio pickers from loop indices. A submission named `<img src=x onerror=…>` renders as literal text.
- Rating and spice are per-card radio groups (`q-rating-<idx>`), so the pure-CSS `input:checked ~ label` fill works without cards interfering with each other.

**Verified:** 22 browser checks against a stubbed `/api/submissions` — render order, prefill (including a submitted spice 0 preselecting "None"), unique radio groups, approve carrying edits with keywords back to an array, `required` blocking a blank field, reject gated by the dialog and sending no `noodle`, cancel sending nothing, and the empty state appearing once drained. Each check was proved meaningful by mutation: rendering the name with `innerHTML` fails the escaping checks *and* executes the payload, dropping the sort fails nine, sending `noodle` on reject fails one, and removing the confirm gate fails three.

---

## Owner Add vs. the Queue `done`

> A submission queues legitimately — its barcode is not in the catalogue yet. The owner then adds that noodle directly. The queue entry is now stale, and approving it later runs `packages.items.upsert`, **overwriting the catalogue entry with the submitter's name, brand, price and description**. That was the one path by which a non-owner could rewrite catalogue text, arriving as a routine-looking approval card weeks after the fact. Adding is now refused while a suggestion for that barcode is pending, so the queue stays the only way in.

| Task | File |
|------|------|
| `POST /api/noodles` queries `submissions` for `c.noodle.id` and returns 409 with the `submissionId` when one is pending | `api/src/functions/noodles.js` |
| The add form turns that 409 into an error toast linking to the queue, leaving the form filled in | `assets/js/add.js` |

**Scope:** `POST` only. `PUT` is an edit of something already in the catalogue, where a stale queue entry is a pre-existing hazard that blocking the edit would not fix — the owner would just be locked out of their own noodle. Submitters were already blocked from queueing a barcode that is in the catalogue (`submissions.js`, 409 on `POST`), so the two checks now cover both directions.

**Verified:** 15 API checks against a stubbed Cosmos — pending barcode returns 409 with the submission id and writes nothing to `packages` or the aggregate, a clean barcode still returns 201 and seeds the owner's score, an unrelated queue entry does not interfere, `PUT` is unaffected, the role checks still run first, and a payload with no id skips the lookup rather than throwing. Mutation-tested: neutering the guard fails five checks, pointing the query at `c.id` fails the shape check, extending the guard to `PUT` fails one. Plus 6 browser checks on the add form: the toast appears, links to `queue.html`, explains itself, is dismissable, leaves the form filled, and fires no second request.

**Harness caveat:** the stub filters submissions in JavaScript rather than executing the SQL, so a wrong query *path* is caught only by the assertion on the query text, not by behaviour. A query that is valid but wrong in some other way would still pass.

---

## Overlay Height on Mobile `done`

> The overlay card had no height cap and was centred with `align-items: center`. A card taller than the visible viewport therefore split its overflow evenly above and below, putting the close button **above** the top of the screen — under the browser's address bar — with `overflow: visible` meaning nothing could scroll it back into view. Reported on Brave, and that is not a coincidence: Brave keeps its address bar (and bottom bar) on screen more persistently than Chrome, so the same phone yields roughly 520px of visible height instead of 600px. The card was identical; Brave simply crossed the threshold Chrome did not.

**Measured before:** at 520px visible height a 583px card sat at `top: -31px`, close button at `-19px`. At 460px, `-49px`.

| Task | File |
|------|------|
| Cap the card at the overlay's content box and scroll only `#overlay-body`, so the title and close button stay pinned | `assets/css/style.css` |
| `box-sizing: border-box` on the card — with no global border-box rule, its 1.5rem padding was added outside the cap and overflowed it by exactly 48px | `assets/css/style.css` |
| `height: 100dvh` (with a `vh` fallback) so the overlay tracks the address bar rather than being sized to the viewport with it retracted | `assets/css/style.css` |
| Replace `align-items: center` with `margin: auto` plus `overflow-y: auto` on the overlay — auto margins centre identically when the card fits and collapse to zero when it does not, so the card can never overflow upwards | `assets/css/style.css` |
| Escape closes the overlay, alongside the close button and the existing backdrop click | `assets/js/overlay.js` |

**Which change does the work:** the cap. With `max-height` in place, re-adding `align-items: center` no longer breaks anything — proved by mutation. `margin: auto` is the backstop for the case where content cannot shrink: with the cap removed, a 625px card in a 520px viewport still keeps the close button reachable at `top: 28` instead of `-19`, and the overlay scrolls.

**Verified:** at 360 / 460 / 520 / 600px of visible height the card is exactly `viewport - 2rem`, the close button sits at `top: 28` and is fully on screen, the rating widget stays reachable, and the body scrolls internally to its end. Still centred when it fits (900px viewport → `top: 138`). Mutation-tested: dropping the cap or the `box-sizing` line clips the rating widget out of view, and each is caught by a distinct check. Screenshot at 520px confirms the layout.

**Caveat:** headless Chromium will not open a window narrower than 540px, so the phone width was simulated by pinning the card to the 343px a 375px phone would give it. The overflow mechanism is width-independent — width only decides when the card gets tall enough to trigger it — but the fix is still worth a look on a real handset in Brave.

---

## Sign-In Page `done`

> The 401 override sent every gated route (`/mylist`, `/profile`, `/submit`, `/queue`) straight to `/.auth/login/aad`, picking one of the two providers for the visitor. A GitHub user following a link to My List got a Microsoft login with no GitHub button anywhere on the screen — and on a phone already holding a Microsoft session the redirect completed *silently*, landing them on the page signed in as an identity they never chose, looking at an empty list. Ratings are scoped to `userId`, and `/.auth/logout` ends only the Static Web Apps session, so they could not switch back without clearing the Microsoft session in that browser.

| Task | File |
|------|------|
| Public `signin.html` offering both providers, with the same icons as the header menu | `src/signin.html` |
| `?to=` sets `post_login_redirect_uri` on both buttons, validated as a same-site path | `assets/js/signin.js` |
| Signed-in visitors get "Already signed in as …" instead of the buttons — the owner-only routes send *signed-in* non-owners here too, where a sign-in prompt would be nonsense | `assets/js/signin.js`, `src/signin.html` |
| 401 override repointed from `/.auth/login/aad` to `/signin.html` | `src/staticwebapp.config.json` |

**`?to=` is an open-redirect surface** — it ends up in a redirect the visitor follows immediately after handing over credentials. Rejected: anything not starting with `/`, anything starting with `//` (protocol-relative), and anything containing a backslash (some browsers normalise `/\host` to `//host`). Everything rejected falls back to `/`.

**Verified:** 11 browser checks on the target handling (paths and query strings preserved, fragment preserved, absent/empty/relative/`javascript:`/protocol-relative/backslash all falling back to `/`), plus 7 on the signed-in panel (buttons and intro hidden, heading changed, identity shown, Continue honouring `?to=`, sign-out link present). The backslash cases assert on the value the page actually received, after an early version of the harness silently lost the backslash to a shell heredoc and tested nothing.

**Unverified:** the SWA routing half. Whether the 401 override actually lands on `/signin.html` cannot be checked without deploying — nothing here emulates Static Web Apps' auth. Worth opening `/mylist.html` signed out as the first check after deploy.

**Still open — `prompt=select_account`.** This page makes the *provider* choice explicit but cannot make Microsoft ask *which account*. That needs `auth.identityProviders.azureActiveDirectory.login.loginParameters`, which requires a custom Entra app registration (client ID and secret as app settings) and, per the SWA docs, the Standard hosting plan. The tenant scope chosen at registration also decides whether personal Microsoft accounts can sign in at all.

---

## Phase 6 — Installable on Android (PWA) `done`

> Nothing PWA-related exists yet, so Chrome on Android only offers "Add to Home screen" as a bookmark — it opens in a browser tab with the URL bar, not as an app. Four pieces are needed before Chrome will offer a real install.

| Task | File |
|------|------|
| `manifest.webmanifest` — `name`, `short_name`, `start_url`, `display: "standalone"`, `theme_color`, `background_color`, `icons` | `src/manifest.webmanifest` |
| PNG icons at 192×192 and 512×512, plus a `purpose: "maskable"` variant so the launcher's adaptive icon isn't letterboxed. Today's favicon is an inline SVG emoji data URI, which Android won't accept | `src/assets/icons/` |
| Service worker with a fetch handler — Chrome requires one on Android before offering installation | `src/sw.js` |
| `<link rel="manifest">` + `<meta name="theme-color">`; register the service worker | `src/_includes/base.html` |

**Already satisfied:** HTTPS (Azure Static Web Apps) and the responsive viewport meta.

**Watch out for:**

- **`start_url` must be public** — `/` or `/list.html`, never `/profile.html`. That route is gated to `authenticated`, and the `401` override redirects to `/.auth/login/aad`, so a cold launch from the home screen would open straight into a Microsoft login.
- **Caching strategy** — pages are static but all content comes from `/api/noodles`. Cache-first would serve stale ratings, which defeats Phase 2/3. Needs network-first for `/api/*`, cache-first for the shell.
- **Two cross-origin dependencies** — Google Fonts and the unpkg zxing scanner (`base.html:11-14`). A precache list naming them will fail to install; use runtime caching or leave them out.
- Camera access for the barcode scanner works fine in an installed PWA.

**Out of scope:** a Play Store listing, which needs a Trusted Web Activity wrapper (Bubblewrap) built on top of the PWA.

**What was built**

| Task | File |
|------|------|
| `manifest.webmanifest` — standalone display, `start_url: "/"`, brand theme/background colours | `src/manifest.webmanifest` |
| Icons drawn from geometry and PNG-encoded with Node's own `zlib` — no image library, no build dependency, and regenerable rather than committed as opaque binaries | `scripts/generate-icons.js` → `src/assets/icons/` |
| 192, 512 and a `purpose: "maskable"` 512 whose art is scaled to 72% so the launcher's adaptive mask cannot crop it | `src/assets/icons/` |
| Service worker: network-first for navigations and `/api/noodles`, cache-first for the shell | `src/sw.js` |
| `<link rel="manifest">`, `theme-color`, `apple-touch-icon` (iOS ignores the manifest's icons), and registration on `load` | `src/_includes/base.html`, `assets/js/sw-register.js` |
| Passthrough copy for the manifest and the worker — the worker **must** land at the site root, since a worker under `/assets/` could only ever control `/assets/` | `.eleventy.js` |
| `.webmanifest` mime type, and `cache-control: no-cache` on `/sw.js` so a stale worker cannot pin itself | `src/staticwebapp.config.json` |

**How the caching decisions fell out**

- **Gated routes are not precached.** `/add`, `/queue`, `/mylist`, `/profile`, `/submit`, `/suggest-edit` all answer 302 to the sign-in page when signed out; caching that redirect would pin it for signed-in visitors too.
- **`/.auth/*` is never intercepted.** `/.auth/me` decides who the client believes it is — a stale copy would show a signed-out visitor as signed in, or one account as another.
- **Only `/api/noodles` is cached.** `/api/ratings` and `/api/submissions` are scoped to the caller, and the cache is per-device rather than per-user, so caching them risks showing one account's list to whoever opens the app next.
- **`cache.add` per entry, not `cache.addAll`.** `addAll` is atomic, so one renamed asset would leave the app with no offline shell at all. Each entry now fails independently.
- **Cross-origin is passed straight through**, as the plan required: the Google Fonts stylesheet and the unpkg ZXing bundle are never named in the precache list.

**Verified:** the build emits `/sw.js` and `/manifest.webmanifest` at the site root with all three icons; the manifest parses as JSON; all 14 precache URLs resolve to real files in `_site` (checked programmatically, since a permanently-missing entry would fail silently forever); and both rendered icons were inspected — the maskable variant's art sits inside the safe zone.

**Unverified:** everything that needs a real device or a deploy — whether Chrome on Android actually offers the install prompt, how the maskable icon is cropped by a specific launcher, and offline behaviour. Worth checking Lighthouse's installability audit after deploy.

---

## Phase 7 — Shareable Noodle Links `done` (simpler than planned)

> A noodle can now be linked to. The overlay's share button builds `/list.html?id=<barcode>`; `list.js` reads `?id=` on load, shows the list, and opens that noodle on top of it. Built as commit `08155e1`, and deliberately smaller than the original plan: the link is made on demand rather than kept in the address bar.

| Task | File |
|------|------|
| `?id=` on load opens the overlay; unknown id shows a "That noodle could not be found" toast over the plain list | `assets/js/list.js` |
| Cold-load path: when the id is not in the catalogue the page already holds, point-read it with `GET /api/noodles?id=` (`[noodle] = await res.json()` — an empty array is the not-found branch) | `assets/js/list.js` |
| Canonical link always targets `list.html`, which is public — `/mylist` and `/profile` are gated, so a link built from the current page would bounce a stranger to sign-in | `assets/js/overlay.js` (`noodleLink`) |
| Share action in the overlay's three-dot menu: `navigator.share` where it exists, otherwise `clipboard.writeText`, otherwise an `execCommand('copy')` fallback, otherwise the URL in an error toast. Cancelling the share sheet is not treated as a failure | `assets/js/overlay.js`, `src/_includes/overlay.html` |
| `?search=` still honoured for links made before `?id=` existed | `assets/js/list.js` |

**Not built, from the original plan:**

- **The address bar does not change when the overlay opens**, so copying the URL from the browser gives the list, not the noodle. The share button is the only way to get a link.
- **Back does not close the overlay** — no `pushState`/`popstate`. On a deep-linked load Back leaves the page.
- Both are cheap to add later if wanted; neither blocks sharing.

**Since the search moved in-memory** (`d760ae6`) the `?search=` re-render is synchronous rather than racing the overlay, so the original worry about it closing the overlay just after it opens no longer applies.

---

## Since the Last Plan Update `done`

> Everything below landed after Phase 7 was written up, in roughly this order. Commit hashes are given so the reasoning in each message can be looked up.

| Change | Why it matters | Commit |
|--------|----------------|--------|
| **Suggest an edit** — signed-in non-owners can propose changes to an existing noodle; arrives in the owner's queue as an `edit` submission carrying `targetId`. Rating/spice deliberately absent (opinions, set via the rating widget) | `suggest-edit.html`, `suggest-edit.js`, `submissions.js` | `c657056`, `4e28127` |
| **Overlay three-dot menu** — Share link, Edit and Delete (the last two role-gated) behind one trigger; card top row realigned | `overlay.html`, `overlay.js`, `style.css` | `0407258`–`bab4259` |
| **My List rework** | `mylist.js`, `ratings.js` | `851672d` |
| **Remove your own rating**; the average no longer drifts when a rating is replaced or removed. Removing the last rating clears the score fields | `rating.js`, `ratings.js`, overlay | `eb6e284` |
| **Committed API test suite** — `api/test/` (`node --test`) over a fake Cosmos; runs in CI before every deploy against the locked dependency tree | `api/test/*`, workflow | `e1e432d`, `8817372`, `25b7b88` |
| **Dependabot** watches both npm trees and the actions | `.github/dependabot.yml` | `201b7ee` |
| **Toasts announced to screen readers** | `base.html` | `bb962df` |
| **Delete a noodle** — `DELETE /api/noodles?id=`, owner only. Removes the row, every rating anyone wrote against it, and any pending suggestion pointing at it; catalogue row first so an interrupted delete cannot leave a live noodle with destroyed ratings. Hard delete, confirmed by a dialog that names the noodle. Pages react through a new `window.noodleRemoved` hook (list/My List drop the card, home/profile reload). The confirm dialog became a shared promise-based `confirm.js` | `catalogue.js`, `confirm.js`, `overlay.js` | `a80d214` |
| **Search runs over the catalogue already in memory** instead of a server query. Search results are now sorted and paged like the normal list — this fixes the old "search skips sorting" deferred item | `list.js`, `noodles.js` | `d760ae6` |
| **Noodle of the day picked in the API** — `GET /api/noodles?ofTheDay=YYYY-MM-DD`; the home page no longer downloads the whole catalogue. Date comes from the caller so the changeover stays at the visitor's midnight | `catalogue.js`, `home.js` | `67058f1` |
| **`aggregates` container merged into the noodle document** — community scores are fields on the noodle. Rating writes use `IfMatch` against the owner's edit form; `keepScores()` stops any wholesale replace from erasing scores. Rating a nonexistent noodle is a 404. One read fewer per page. The migration script has since been deleted | `rating.js`, `noodles.js`, `submissions.js` | `c41273b`, `0db97d2` |
| **Owner score no longer stored on the noodle** — `splitScores()` replaces `withRatingDefaults`. A blank picker means *unrated* (not a defaulted 3), and the UI can now show "not yet rated"; unrated noodles sort to the end in both directions. Two `querySelector` interpolations of API data removed. Seed-score cleanup script has been run and deleted | `noodle.js`, `cards.js`, `add.js`, `overlay.js` | `668be77` |
| **Profile stats computed in the API** — `GET /api/stats` returns the figures instead of the page downloading the catalogue. Unrated noodles excluded from every score-derived figure; `avgRating` is `null` rather than 0.0 for an unrated catalogue | `stats.js`, `profile.js` | `65e23da` |
| **README, LICENSE, footer** — PolyForm Strict 1.0.0 licence, copyright line, footer linking to `terms.html` | `LICENSE`, `README.md`, `base.html` | `6b4d1d4` |
| **Search bar on My List**; phone layout gives the search box the larger share of the filter row | `mylist.js`, `style.css` | `7ba4423` |

**Open: `terms.html` is not committed.** The footer on every page already links to `terms.html` and that commit is on `origin`, so the deployed site currently links to a 404. `src/terms.html` exists locally but is untracked. Commit and push it. It also still needs a decision on gating — the page should be public, which `staticwebapp.config.json` already allows by default.

---

## Deferred

- **A user can submit the same noodle twice** — the duplicate check only looks at `packages`, not at pending submissions, so two people (or one person twice) can queue the same barcode. The owner sees both in the queue. Approving one no longer leaves the other able to overwrite it (see *Owner Add vs. the Queue*), but the second card still has to be rejected by hand. (Approving both is no longer destructive after review fix #3, but the duplicate entries remain.)
- **Spice 0 may already have been corrupted** — until the score-scale fix, every save through the add/edit form rewrote a stored spice 0 to 3. Any noodle edited in that window has lost its real value, and the backfill can't recover it (the aggregate would have been overwritten too). Worth spot-checking noodles you know are not spicy.
- **Scores are never recalculated from source** — `applyRating` updates the fields on the noodle incrementally, so any historical drift (including ratings dropped by review bug #1 before it was fixed) persists. A rebuild-from-`ratings` job would correct existing rows (the sums now live on the noodle document, so it is a single pass).
- **Profile stats don't refresh after rating** — `window.refreshNoodleCards` is defined by `list.js` and `mylist.js` only, so rating from a profile highlight updates the overlay but leaves the summary stats and distribution stale until reload. (Deleting a noodle *does* reload the profile.)
- ~~**No committed test suite**~~ — done: `api/test/`, run in CI before deploy. Still open: the role checks and handler-level paths (ratings/submissions endpoints) are covered less than the `lib/` maths, and the fake Cosmos does not execute SQL, so a wrong query is only caught by asserting on its text.
- **Star distribution on the profile is coarse** — fractional averages rounded to whole-star buckets; a histogram of the raw ratings would need a new aggregate or a `GET /api/ratings` scan.
- Personal lists — users bookmark or collect favourites
- **Profile page is entirely community data** — it is auth-gated and titled like a personal page, but every stat on it is catalogue-wide. Now that My List exists, the profile should either show *your* stats (your average, your distribution, how often you differ from the crowd) or stop looking personal.
- **Existing ratings have no `ratedAt`** — rows written before this change sort last under "Recently rated" until they are re-rated. A one-off backfill would fix the ordering.
- Functional list improvements: keyword filter, "showing X of Y" count (the empty-search state now exists)
- **Address bar / Back button for the overlay** — see Phase 7, *Not built*.
- Duplicate identity detection (same person via GitHub vs Entra ID)
