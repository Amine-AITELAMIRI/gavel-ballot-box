# Gavel

Gavel is a sealed-bid silent auction. Try a single sample lot on your own, or host an auction and invite bidders. Each bidder can raise their own offer until the server closes the lot. Only the winner and winning amount become public.

## Local review

Run `npm ci --legacy-peer-deps` with a supported Node and npm version (see `package.json`), then `npm run review`. Open http://127.0.0.1:5198 on the same computer. The local review runs the React app, Worker, SQLite-backed Durable Object, and scheduled settlement. Login, catalog search, text, generated illustration and outgoing email use local fixtures. All review data stays on the machine.

Choose **Try a practice auction** on the homepage, then pick your role. As bidder, start a 10-second round and seal one whole-dollar offer alongside three simulated bidders. Your private receipt and the live activity feed stay visible until the full ten seconds elapse, then the winner appears. As host, choose the item and set a 5–60 second timer (default 5), watch three simulated bids arrive, then announce the winner. The server owns the deadline, scheduled offers and result. Refreshing resumes the same round.

**Host a live auction** opens shared auction setup. Setup stays in the tab until **Open auction** commits the auction and first item together. Leaving or refreshing discards the unfinished form. Choose the Organizer profile, name the auction, pick a duration and choose **Surprise me**, find a specific item, or enter item details manually. Generated items keep their photo, name and description on everyone’s bidder page. Hosts and bidders can opt into email notices and enter a notification address. The host dashboard shows the bidder link and the number of sealed bids for each selected item. Its bidder preview is read-only. To test an invitation on this computer, open the link in a private window and choose Alice or Bob. As host, you can add items and close bidding on each one independently. Items still open at the deadline close automatically. A signed-in bidder can return from the homepage to their receipt or result. The results keep the original item details and explain a tied losing offer. The organizer can illustrate the item under **Optional item tools**. Restarting the preview requires choosing the profile again. Auction records persist locally.

## How it works

| Part | Responsibility |
| --- | --- |
| DeepSpace auth and actions | Verify bearer tokens for hosted auctions. The worker derives each bidder's identity from the verified claims. |
| Auction Durable Object | Owns four domain tables: auctions, lots, bids and results. Each bid and close runs in a synchronous SQLite transaction. |
| Server-side views | Return only the caller's bid. Even the organizer receives no other bidder's amount before settlement. |
| CronRoom | Runs a minute sweep to settle expired lots and process opted-in email notices. Bidding checks the server clock on every write. |
| Presence | Shows the number of connected viewers on a shared lot. Room data refreshes every five seconds. |
| Integration proxy | Exa finds the seller’s listing and photo. Anthropic describes the item. Gemini supplies optional art. DeepSpace email handles optional notices. The local review uses fixtures for these providers. |

Highest bid wins. Equal bids go to the person who first reached that amount. A repeated close returns the recorded result. The solo demo and hosted rooms share these rules.

## Decisions and limits

Bids stay inside private SQLite tables behind the auction service. A single transaction can compare an offer, check the deadline and settle against concurrent requests. This design uses a custom Durable Object and server-side views in place of four browser-subscribed SDK collections. One object currently holds all auctions. At larger scale it would need partitioning and a separate design for global quotas.

In host practice, choose **Surprise me**, or describe an item to auction. After announcing the winner, the host can try a new bidder round with that same item. Standalone bidder practice draws from the same surprise-item search as the host. The ten-second timer starts after the item is ready, and refreshing keeps the same item. Bidders see the item name and description beneath its photo. Hosts can start as soon as the item appears. Repeating the same custom search and rarity in the same session can reuse the item for one hour. Discovery allows 18 requests per session or account and 120 total per day.

Organizer assistance is capped at three requests per account per day and twelve app-wide. The mail queue caps sends at forty per day. An uncertain mail delivery is recorded for inspection, so an automatic retry cannot send a duplicate. No delivery-status dashboard is included.

Payments, bid withdrawals, uploads, and messaging are outside the auction flow. The generated illustration is labeled as a placeholder. Live provider quality, billing, Google OAuth and delivery are pending separate end-to-end verification. This is a local review build.

## Checks

- `npm run type-check` and `npm run lint`
- `npm run test:unit` for the bidding rules, deadline, tie order, notifications and prerendering
- `npm run test:review` for isolated local browser tests, including three separate profiles and desktop/phone sample flows. This uses installed Chrome and a second loopback server with temporary data.
- `npm run build` for a local production build
- `npm run test:production` builds the app and checks the initial HTML and first screen for direct links, including bidder invitations.
