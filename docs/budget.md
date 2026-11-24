# Provider budget

Every browser-reachable integration call has a server-side counter. The browser
cannot raise a limit, and each counter is incremented inside a transaction before
the provider is awaited, so a burst of parallel requests cannot all pass the check
and then bill.

| Bucket | Limit | Window | Why this number |
| --- | --- | --- | --- |
| `discovery:<actor>` | 18 | UTC day | A person picking one item for one auction retries a handful of times; 18 is generous for that and cheap to waste |
| `discovery` | 120 | UTC day | Ceiling on the whole app if a link gets shared |
| `photos:<actor>` | 24 | UTC day | Photo lookups are cached a day per source, so this only bites on genuinely varied browsing |
| `photos` | 120 | UTC day | As above, app-wide |
| `assist:<actor>` | 3 | UTC day | One illustration per lot, plus a redo |
| `assist` | 12 | UTC day | Illustrations are the most expensive call in the app |
| `mail` | 40 | UTC day | One notice per opted-in address per lot |

All of them are per-`floor(now / 86400000)` rows in `usage`, pruned by each sweep.
Over-limit throws 429 with a fixed message; the message never names the provider.

## Caching in front of the counters

- Listing photos are cached per source URL for 24 hours (`listing_photos`).
- Concurrent lookups for the same source join one in-flight promise
  (`AuctionRoom.pendingPhotos`), so two open tabs cost one call.
- A repeated custom search at the same rarity in one session reuses the item for
  an hour (`item_lookups`).
- Draft item cards and their lookups are swept after a day.

## Failure behaviour

| Failure | Result |
| --- | --- |
| Provider error | 502, "The provider could not finish. Your lot and bids are saved." |
| Unusable search results | 422, ask for a more specific item |
| Malformed completion | 502 |
| Image over ~1.7 MB or not a data URI | 502, nothing stored |
| Email delivery uncertain | notice marked `unconfirmed`, never retried |

The local review build (`DEEPSPACE_APP_ID=gavel-local-review`) short-circuits the
provider calls entirely: fixture items and no photos.
