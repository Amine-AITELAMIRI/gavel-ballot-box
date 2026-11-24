# Who may do what, and where it is enforced

Client-side filtering is not a boundary. Every rule below is enforced inside the
Durable Object's write transaction, the HTTP route, or both — never in a
component.

| Rule | Enforced in | Response when broken |
| --- | --- | --- |
| Only the organizer closes a lot or adds one | `AuctionStore.owner`, called from every `close`/`announce`/`add`/`illustrate` branch | 403 |
| The organizer cannot bid on their own auction | `store.execute`, `bid` branch, before any write | 403 |
| A bid needs a signed identity | `routes.ts` rejects cookie-only writes; `actions/index.ts` requires a bearer token | 401 |
| A practice bid needs the room's own cookie | `routes.ts` hashes the cookie to the actor; a foreign `s-` room is a 404 | 404 |
| No bid after the deadline | `store.execute` compares against `Date.now()`, never the client's clock | 409, or the settle is triggered instead |
| A raise must exceed your own offer | `store.execute`, `previous.amount >= amount` | 409 |
| One live offer per bidder per lot | `UNIQUE(lot,bidder)`; a raise deletes then re-inserts | — |
| Amounts are whole dollars, $1–$1,000,000 | `store.execute` | 422 |
| Nobody sees another's amount before close | The `Lot` type has no field for it; `view` only reads `bidder = actor.id` | — |
| Only the organizer sees the sealed count | `view` sets `sealedCount` under `owner()` | omitted |
| Writes are same-origin JSON | `routes.ts`, before the actor is resolved | 403 |
| Body size | `routes.ts` 4 kB, 24 kB for create/add/photo | 413 |
| Daily quotas | `AuctionStore.quota`, counted in a transaction before the await | 429 |
| Provider calls bill the operator | `AuctionRoom.integration` always builds an owner-scoped context | 502 |
| Exactly one settlement per lot | `settle` early-returns on an existing result; called inside the write transaction | — |

The auth boundary itself is `resolveAuth` in `src/server/http-routes.ts`. Anything
after it runs with the identity it produced; see the trust-model note at the top
of `src/server/action-routes.ts`.

## What is deliberately open

- A shared room id is a capability: anyone holding the link can read the lots and,
  while signed in, bid. That is the invitation model, not a leak — the amounts are
  the secret, not the existence of the auction.
- `/api/gavel/receipts` lists only the caller's own receipts, from their own
  token.
