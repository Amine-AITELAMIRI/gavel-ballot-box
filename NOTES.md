# Decision log

Working notes in order. Each entry records what was asked or observed, what
changed, what it cost, and what was actually checked — by the agent and by a
person, kept apart.

Task invited 2026-11-20 13:02 UTC. Build ran 2026-11-22 13:25 → 2026-11-23 00:21
UTC, then verification and cleanup on 2026-11-24. The history was re-cut into
logical commits on 2026-11-24 before the first push; nothing had been pushed
earlier, so no published history was rewritten.

## Nov 22 13:25 — Design and bid privacy

**Decision** — Implement the chosen Ballot Box direction. One practice visitor
gets their own auction with server-seeded opponents, and their session survives a
reload. Practice and shared auctions run the same bidding and settlement code.

**Cost** — A sample demonstrates the experience but cannot prove the privacy
boundary on its own; that needs independent sessions. Automated checks stay
logged separately from anything a person confirmed.

**Human checked** — Selected direction B in Figma.

## Nov 22 20:05 — Local review build

**Decision** — Signed bids go through a verified action, the solo sample gets a
browser-scoped HttpOnly cookie, and both end in one transactional settlement
path. Reviewer profiles and simulated provider responses live in a separate
loopback process so the review build never needs credentials.

**Agent checked** — Drove the sample at 1080 and 390 px and exercised hosted
auctions across three isolated browser profiles. Inspected bid privacy in the
server response, owner-only close, a persistent receipt and both the winning and
losing reveals. Ran the production build, type checker, linter and unit suite.

## Nov 22 21:42 — First usability review

**Observed** — Amine tried the sample and said neither the purpose nor the
hosting flow was understandable.

**Changed** — The home screen now states the rules before offering practice or a
hosted auction. Practice introduces the bidder and host roles in sequence.
Opening a shared auction takes its creator to a host dashboard with the bidder
link first. Closing a lot asks for confirmation and names the lot.

**Cost** — A longer home page. Accepted: the previous one was one word and two
links, and a reviewer could not tell what the thing did.

## Nov 22 22:40 — Returning to a bid, and the reveal

**Observed** — In the walkthrough, a bidder who left a receipt had no way back.

**Changed** — The home page retrieves that account's bids and links to the exact
lot; a receipt explains how to return via the original invitation. Practice shows
a bidder receipt and a separate host view of the sealed count. Organizers can
preview the bidder page. Equal bids explain themselves on a losing result. Item
details and pickup notes stay visible after close.

**Agent checked** — Walked the reveal at phone width, found receipts again as two
separate profiles, and covered a tie, a second lot and the organizer
restrictions.

## Nov 23 00:05 — One role up front

**Asked** — Amine asked for a single role choice before the clock starts, rather
than both roles at once.

**Changed** — Practice asks bidder or host before anything is timed. Role copy
appears first. Sealing locks only the tester's offer while the round continues
around them.

**Cost** — Two screens instead of one, and earlier practice rooms keep their data
under a link rather than the new flow.

## Nov 24 00:30 — Second-pass review and cleanup

**Observed** — Reviewing against the task brief: the repo had two commits, no
comments in the three files that do the actual work, and a dead assistant
surface. `src/ai/*` was never registered, so `GET /api/chat` returned 404 in
production, and 15 of 17 `components/ui` primitives, `products.ts`,
`subscriptions.ts`, `nav.ts` and `lib/utils.ts` had no references.

**Changed** — Deleted the unreferenced surface and the four dependencies that only
served it. Added comments at the decisions a reader would otherwise have to
reverse-engineer: the settle transaction, the tie order, the cookie hash, the
in-flight dedupes, the quota-before-await, the unconfirmed-notice rule. Made the
`?host=` primary action explain why it is disabled instead of just dimming.

**Cost** — Reviewers lose the SDK's example primitives kit as a reference; the
surfaces are bespoke and `studio.css` is their only source. Choosing the kit would
have meant a design that fights it.

## Nov 24 00:45 — Bidder clock

**Observed** — The 10-second bidder round expired while a first-time reader was
still parsing the item, and a late seal is rejected outright, so a slow first run
scored nothing.

**Changed** — Bidder rounds run 20 seconds, from one named constant. Bots arrive
at a quarter, a half and three quarters of the round, so the extra time is more
company rather than more silence.

## Nov 24 00:55 — Verification

**Agent checked** — Anonymous read of a shared room. Sealed bid at $315 returning
`myBid: 315, result: null` and no other amount. A lower second offer rejected. A
host announce after close publishing `{winner, amount, count}`. Origin mismatch
and missing content type both 403. Late bid after the deadline dropped while the
lot still settled. `tsc --noEmit`, `eslint .` and 17 unit tests green, on the
deleted tree as well as this one.

## Nov 24 07:05 — Live pass on the deployment

**Asked** — Amine asked for whatever would make the build worth reading, rather
than a checklist of things already asserted elsewhere.

**Agent checked, in a real browser against production** — A practice bidder round:
the item took 2.5 s to arrive, an offer of $315 sealed, and a reload with 13 s
left returned the same lot with the offer intact and no stale sealed view; the
round ended with 4 bidders and that offer winning at $315. A practice host round:
sealed bids appeared as a count at each of the quarter marks and never as amounts,
and announcing published `{Alex, $75, 3}`. A shared auction created on the host
dashboard, its bidder preview showing zero bid inputs, and the bidder page opened
from the link. Both flows at 390×844 with `scrollWidth` equal to `innerWidth`.

**Found** — A background tab looks frozen because the poll is gated on
`document.visibilityState`. That is intended, but it makes a driven browser lie
about a live view until the tab is focused.

**Still open** — A second signed-in account. Google sign-in gives one identity per
browser profile and a host cannot bid on their own auction, so two bidders have not
yet met in production; the three-context review suite covers it locally. Neither
round above ran on a real handset, only an emulated 390 px viewport.

**Not repeated by hand, already asserted** — The tie order, the raise rule and the
dropped late bid are in `auction.test.ts` and were reproduced by curl above.
A moved system clock is covered the same way: the deadline is decided server-side,
so a client clock only changes a countdown.

## Next

- Withdrawal before close, which needs a bid state rather than a bare row.
- Shard the auction object by room id once a single object is the limit.
- A delivery status view for queued notices.
