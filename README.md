# Gavel

Sealed-bid silent auctions. Every offer is private, one server clock decides when
a lot closes, and only the winner and the winning amount are ever published.

- **Live:** https://gavel-ballot-box.app.space
- **Try it alone, no account:** https://gavel-ballot-box.app.space/?practice=1
- **Host side:** https://gavel-ballot-box.app.space/?host=1

Bidder practice runs a real 20-second round against three simulated bidders. Host
practice walks the setup and the announce. Neither needs a sign-in, and neither
writes anything outside that practice room.

## How it works

| Part | Responsibility |
| --- | --- |
| Auth and actions | Bids and closes on a shared auction go through a DeepSpace action, which rejects a cookie-only session. The worker derives identity from verified claims and nothing else. |
| Auction Durable Object | Owns four domain tables: auctions, lots, bids and results. Each bid and close runs in a synchronous SQLite transaction, so the deadline, the raise rule and the settlement are decided in one write. |
| Server-side views | Return only the caller's own bid. Even the organizer gets no other bidder's amount before settlement. |
| CronRoom | One-minute sweep. Settles expired lots, then drains queued email notices. Settlement is idempotent, so a request crossing the deadline first makes the tick a no-op. |
| Presence | Connected-viewer count on a shared lot. Room data repolls every five seconds. |
| Integrations | Exa for the seller's listing and photo, Anthropic to pick and describe one, Gemini for optional art, DeepSpace email for opt-in notices. |

Highest bid wins. Equal bids go to whoever reached that amount first, resolved by
an autoincrementing `seq` rather than by arrival time. A repeat close returns the
recorded result. Practice and shared auctions run the same rules through the same
code — practice differs only in who may act, not in what the rules are.

## Decisions and limits

Bids live in private SQLite tables behind a custom Durable Object, and the
browser receives hand-built views instead of subscribing to four SDK collections.
That is the main tradeoff. It costs the SDK's realtime ergonomics and a lot of
scaffold: realtime is a five-second poll, and the client reimplements what the
records API would have given free. It buys the thing this product is about —
only a transaction can compare an offer, check the deadline and settle against a
concurrent writer, and the privacy rule is exactly the part that would break if
each collection were read directly by the browser.

One object holds every auction, which is what makes a cross-room read like the
receipt list a single query. The cost is serialisation on one object; sharding by
room is the next step if it ever matters.

Deliberately out of scope: payments (no money moves), photo uploads (sellers
already have better photos than a phone shot), messaging (the lot page is the
conversation), and bid withdrawal before close (a sealed offer is a commitment).
The generated illustration is labelled a placeholder.

Quotas are all daily and all server-side: 18 discovery calls per session or
account and 120 app-wide, 24 photo lookups per account and 120 app-wide, 3
illustrations per account and 12 app-wide, 40 queued emails. An uncertain mail
delivery is recorded as unconfirmed and never retried, so a retry cannot send a
duplicate. There is no delivery dashboard.

## Where things are

| Path | |
| --- | --- |
| `src/gavel/store.ts` | Tables, quota counters, view builder, transactional bid and settle |
| `src/gavel/room.ts` | The Durable Object: command dispatch, provider calls, notice delivery |
| `src/gavel/routes.ts` | HTTP in front of it: origin, content type, body caps, cookie actor |
| `src/actions/index.ts` | Signed bid and close entry point |
| `src/gavel/discovery.ts` | Listing search, selection prompt, photo resolution |
| `src/gavel/Studio.tsx` | The single page, switched by `?room=` / `?host=` / `?practice=` |
| `src/gavel/studio.css` | The whole surface; `themes.css` carries the `ballot` palette |
| `auction.test.ts` | The bid rules, incl. privacy, deadline, tie order |
| `SUBMISSION.md` | The writeup: what this is, the tradeoff, what was verified |
| `NOTES.md` | Build log in order, including what is still open |

## Checks

```sh
npm ci
npm run build          # also generates src/router.ts, which is gitignored
npm run type-check
npm run lint
npm run test:unit      # bid rules, deadline, tie order, notices, prerender
npm run test:review    # Playwright: isolated profiles, desktop and phone
npm run test:production # the public entry points, against the deployment
```

`npm run test:review` and the two collab specs need the loopback sign-in
stand-in, so they only run under that command: `npx deepspace test run all`
reports them as skipped rather than failing them.

`npm run build` must come before `type-check` on a fresh clone: `src/router.ts` is
produced by generouted at build time, so a bare `tsc` on a clean checkout cannot
resolve the router.

Requires Node 22 and npm 11.6 or newer (see `engines`); older npm crashes
resolving the template's peer dependencies.

## Local run

```sh
npx deepspace auth login     # once
npm run dev                  # http://127.0.0.1:5173
```

`npm run review` instead starts an offline build on http://127.0.0.1:5198 with
local fixtures for OAuth, catalog search, text, illustration and email, on top of
a throwaway SQLite database. Nothing leaves the machine.
