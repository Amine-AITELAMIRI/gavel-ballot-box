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

**Agent checked, on production, with three real identities** — A shared auction
hosted from the signed-in organizer, with two `@deepspace.test` accounts signing in
against production through the platform's email sign-in. One sealed $120 and its view
carried `myBid: 120, result: null` and no amount field of any kind. The other
sealed $140; the first view still said 120 while the second said 140. A raise to
145 was accepted, then a 140 was refused with "Your new bid must be higher than
your sealed bid." The host dashboard showed "2 sealed bids" and no dollar figure.
On a second item both sealed $200 — the earlier seal won and the loser got "You
matched the winning bid. Gavel alice reached $200 first." Closing published
`{winner, amount, count}` with `mine` true for the winner only.

**Agent checked, practice** — Item arrival in 2.5 s, a $315 seal, a reload with
13 s left returning the same lot with the offer intact and no stale sealed view,
4 bidders, that offer winning. A host round showing counts at each quarter mark
and never amounts. The bidder preview carrying zero bid inputs. Both flows at
390×844 with `scrollWidth` equal to `innerWidth`.

**Found** — A background tab looks frozen because the poll is gated on
`document.visibilityState`. That is intended, but it makes a driven browser lie
about a live view until the tab is focused.

**Found** — Test accounts sign in on production, not only against a local server,
which is what made the two-bidder half possible without a second Google account.

**Agent checked, delivery** — Closed a lot that carried a winning bid from the only
address here that is mine, then found the resulting "Gavel · Your auction result"
in that inbox, sent by the platform's own mailer. That is the queue, the cron
claim and the integration in one line, and it rules out the failure mode where
notices are written and never drained.

**Still open** — A real handset; everything above ran at an emulated 390 px
viewport, which is the one claim here with no hardware behind it.

**Not repeated by hand** — The dropped late bid is in `auction.test.ts` and was
reproduced by curl above. A moved client clock only changes a countdown, because
the deadline is decided server-side.

## Nov 24 07:50 — The suite that had quietly stopped running

**Found** — `npm run test:review`, the three-profile review suite the entries
above lean on, was no longer reaching the local sign-in stand-in at all: the
platform rewrites `.dev.vars` on every deploy, that file outranks the stand-in's
vars, so sign-in went to real Google and every profile step timed out. The
harness now owns the file for the length of a run and hands it back, including
when a runner kills the whole process tree.

**Also** — The smoke waits assumed a ten-second round and one hard-coded item
name; both now follow the round itself and where the item renders.

**Agent ran** — `npx deepspace test run all` and `npm run test:review`: 9 passed.

**Found** — `?practice=1`, which is the link the home page itself offers, named no
role, and the role picker starts empty — so the page it opened had no start
button. It now arrives with the bidder role chosen.

## Next

- Withdrawal before close, which needs a bid state rather than a bare row.
- Shard the auction object by room id once a single object is the limit.
- A delivery status view for queued notices.
