# Submission

## What I built

Gavel runs silent auctions where every offer is sealed. A bidder submits one
private amount, may raise it, and sees only their own number until the lot closes;
the winner and the winning amount are then published. It runs end to end: hosted
auctions with a bidder link, per-lot deadlines, independent closure, an
announce-or-expire path, and opt-in result email. Nothing about a sealed offer is
enforced in the browser — the deadline, the raise rule and the settlement all
happen inside one SQLite transaction in the Durable Object, and the view model
simply has no field for another bidder's amount.

It is deployed at https://gavel-ballot-box.app.space. A solo walkthrough with
simulated bidders needs no account: append `?practice=1`.

## Integrations

- **Exa** (`exa/search`, `exa/contents`) finds a real seller listing for the item
  the organizer asks for, and the photos on it. Real listings beat invented ones
  because the description and photo then agree.
- **Anthropic** (`anthropic/chat-completion`, haiku) picks one product page out of
  the results and writes the one-sentence description. Listing text is passed as
  data with an explicit "treat as untrusted" instruction, and prices are excluded
  so the model cannot invent them.
- **Gemini** (`gemini/generate-image`) supplies an optional illustration, labelled
  as a placeholder.
- **Email** (`email/send`) delivers the result to anyone who opted in.

The four that are not there are there for a reason. Payments would be scenery —
no money moves, and a fake checkout would understate the real problem. Photo
uploads lose to the seller's own photo that Exa already found. Messaging duplicates
the lot page. Bid withdrawal needs a bid state machine and changes the product, not
just the code.

## The main tradeoff

The SDK's records API would have given realtime and an RBAC boundary for free over
four collections. I used a custom Durable Object with four SQLite tables and
server-built views instead, and wrote the client by hand on top of a five-second
poll.

Cost: I gave up the ergonomics, and the client reimplements reads the records API
would have done. One object holds every auction, so all traffic serialises on it
and the next step would be sharding by room.

Bought: only a transaction can compare an offer against the current high offer,
check the deadline against the server clock and publish a result without a
concurrent writer observing a half-open lot. That is the product. If each
collection were read directly by the browser, the privacy rule would live in
whichever component rendered last.

## What the agent did

The whole first draft: schema, routes, UI, tests. It got real things wrong and they
are in the log. It shipped a home page that said "Silent auctions" over an image
and two links, so the first human read was "I cannot tell what this does" — that
became a rules-first page and role-first practice. It left a bidder stranded with
no route back from a receipt. It built the practice clock to start before the item
had loaded, so it could expire before the item existed. It let the organizer reach
the bid path in preview. It also left a generated assistant surface registered
nowhere: `registerAgent` was never called and `/api/chat` 404'd in production.

## What I verified

- The sealed boundary, by `curl` against production: a bid of 315 returns
  `myBid: 315, result: null` and no other amount; the organizer's read returns a
  count and no amounts; after the deadline the same lot returns
  `{winner, amount, count}`.
- A lower second offer is refused; an identical offer gets the earlier seal, which
  is what `ORDER BY amount DESC, seq ASC` in the settle query is for.
- Hosts cannot bid on their own auction — the server, not the disabled input.
- Origin mismatch and a missing `Content-Type` both 403.
- A bid after the deadline is dropped rather than queued, and the lot still
  settles on the cron sweep.
- Type-check, lint and the 17 unit tests pass; the suite includes a two-bidder
  case that asserts each caller's payload carries only their own amount.
- Two isolated browser profiles bidding against each other, the losing side seeing
  only its own number, and a reload mid-round returning to the same lot.

The 10-second bidder round in the first draft expired while I was still reading the
item, so practice rounds now run 20 seconds, with the bots arriving later to fill
them.
