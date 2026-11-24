# Submission

## What I built

Gavel runs silent auctions where every offer is sealed. A bidder submits one
private amount, may raise it, and sees only their own number until the lot closes;
the winner and the winning amount are then published. It runs end to end: hosted
auctions with a bidder link, per-lot deadlines, independent closure, an
announce-or-expire path, and opt-in result email. Nothing about a sealed offer is
enforced in the browser — the deadline, the raise rule and the settlement all
happen inside one SQLite transaction in the Durable Object, and the view model has
no field for another bidder's amount.

It is deployed at https://gavel-ballot-box.app.space. A solo walkthrough with
simulated bidders needs no account: append `?practice=1`.

## Integrations

- **Exa** (`exa/search`, `exa/contents`) finds the real seller listing and its
  photos, so description and photo agree.
- **Anthropic** (`anthropic/chat-completion`, haiku) picks one product page and
  writes the one-sentence description; listing text is passed as data marked
  untrusted, and prices are stripped so the model cannot invent them.
- **Gemini** (`gemini/generate-image`) supplies an optional illustration, labelled
  a placeholder.
- **Email** (`email/send`) delivers the result to anyone who opted in.

The four left out are left out for a reason. Payments would be scenery — no money
moves, and a fake checkout would understate the problem. Photo uploads lose to the
seller's photo Exa already found. Messaging duplicates the lot page. Withdrawal
needs a bid state machine and changes the product, not just the code.

Four is what these flows needed; each one takes a decision off the organizer
instead of adding a feature to the list.

## The main tradeoff

The SDK's records API would have given realtime and an RBAC boundary for free over
four collections. I used a custom Durable Object with four SQLite tables and
server-built views instead, and wrote the client by hand on top of a five-second
poll.

Cost: the ergonomics, and a client that reimplements reads the API would have done.
One object holds every auction, so traffic serialises and the next step is sharding
by room.

Bought: only a transaction can compare an offer against the current high offer,
check the deadline against the server clock and publish a result without a
concurrent writer seeing a half-open lot. That is the product. If each collection
were read directly by the browser, the privacy rule would live in whichever
component rendered last.

Nothing the browser holds is authoritative either way. Integration keys stay
server-side, the bidder cookie only names an actor the server resolves, and every
view is built for one caller, so no payload carries a field that could be believed
over the transaction.

## What the agent did

The whole first draft: schema, routes, UI, tests. It got real things wrong and they
are in the log. It shipped a home page that said "Silent auctions" over an image
and two links, so the first human read was "I cannot tell what this does" — that
became a rules-first page and role-first practice. It left a bidder stranded with
no route back from a receipt. It built the practice clock to start before the item
had loaded, so it could expire before the item existed.

It also gave practice rounds ten seconds, which expired while I was still reading
the item. They run twenty now, and the bots arrive later to fill them, so the round
is company rather than silence. That is the kind of thing only a human play-through
finds.

## What I verified

The sealed boundary is the product, so I attacked it live, not in tests. Two
`@deepspace.test` accounts signed in against production and bid through the real
forms: one sealed $120 and its view carried `myBid: 120, result:
null` with no field for any other amount, the other sealed $140 and still saw only
140. A raise to 145 was accepted; a 140 after that was refused with "Your new bid
must be higher than your sealed bid." The organizer's read returned "2 sealed bids"
and no dollar figure. On a second lot both sealed $200 and the earlier seal won, so
a tie resolves by arrival. Closing published `{winner, amount, count}` and `mine`
was true for the winner only.

By `curl` against production: a bid of 315 returns `myBid: 315, result: null`;
after the deadline the same lot returns the published result. Origin mismatch and a
missing `Content-Type` both 403. A bid after the deadline is dropped rather than
queued and the lot still settles on the cron sweep. Hosts cannot bid on their own
auction — the server, not the disabled input. A result email arrived in a real
inbox from a real close, the only way to know the queue drains.

Locally: two isolated profiles bidding against each other, the losing side seeing
only its own number, a reload mid-round returning to the same lot. Mobile at
390×844 with `scrollWidth` equal to `innerWidth` — emulated, I have no handset.
Type-check, lint and the 17 unit tests pass, including a two-bidder case asserting
each caller's payload carries only their own amount.
