import { SharedPreviews } from './shared-preview'
import { buildCronContext } from 'deepspace/worker'
import type { Env } from '../../worker'
import { AuctionStore, Problem } from './store'
import { exampleItem, listingPhotos, researchItem } from './discovery'
import type { ItemCard, Rarity } from './items'
import type { Actor, RoomCommand } from './model'

interface Illustration {
  base64Images?: string[]
}

export class AuctionRoom {
  private previews: SharedPreviews
  private store: AuctionStore
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {
    this.store = new AuctionStore(state.storage.sql)
    this.store.setup()
    this.previews = new SharedPreviews(this.store)
  }
  /** Every provider call goes through the app owner's credentials, never the
   *  visitor's — an unsigned bidder cannot spend the operator's billing. Errors
   *  are flattened to one 502 so provider messages never reach the browser. */
  private async integration<T>(
    name: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const client = buildCronContext(
      this.env,
      this.env.OWNER_USER_ID,
      'app:' + this.env.DEEPSPACE_APP_ID,
    )
    try {
      return (await client.integrations.call(name, body)) as T
    } catch {
      throw new Problem(
        502,
        'The provider could not finish. Your lot and bids are saved.',
      )
    }
  }
  private async assist(cmd: RoomCommand, lot: { id: string; title: string }) {
    const data = await this.integration<Illustration>('gemini/generate-image', {
      model: 'gemini-2.5-flash-image',
      aspectRatio: '4:3',
      prompt:
        'A minimal editorial illustration for an auction catalog. Subject: ' +
        lot.title +
        '. Charcoal, olive, pale green. Illustrative placeholder. No text, no words, no letters, no writing, no logos.',
    })
    // The image is stored inline in SQL, so cap it and require a real data URI
    // before it can bloat the row or break the /art response.
    const image = data.base64Images?.[0]
    if (
      !image ||
      image.length > 1700000 ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)
    )
      throw new Problem(502, 'The provider returned an unsupported image.')
    this.store.rows(
      'UPDATE lots SET image=? WHERE id=? AND image IS NULL',
      image,
      lot.id,
    )
    return this.store.view(
      this.store.auction(cmd.room, cmd.actor),
      cmd.actor,
      Date.now(),
    )
  }
  /** Two tabs previewing the same listing would otherwise each bill a lookup;
   *  the map joins the in-flight request instead. Keyed on source only, since
   *  photo URLs are the same for everyone. */
  private pendingPhotos = new Map<string, Promise<string[]>>()
  private async photos(cmd: RoomCommand) {
    const source = String(cmd.input.source ?? '')
    if (!source || source.length > 2000)
      throw new Problem(422, 'Invalid listing.')
    const preview =
      cmd.room.startsWith('a-') &&
      cmd.actor.signed &&
      !cmd.input.lot &&
      typeof cmd.input.preview === 'string'
        ? await this.previews.read(cmd.input.preview, cmd.actor.id)
        : undefined
    const saved = preview
      ? preview.card.source === source
      : cmd.room.startsWith('s-') || (cmd.actor.signed && !cmd.input.lot)
        ? this.store.one(
            "SELECT 1 FROM item_cards WHERE owner=? AND json_extract(card,'$.source')=? LIMIT 1",
            cmd.actor.id,
            source,
          )
        : this.store.one(
            "SELECT 1 FROM lots JOIN item_cards c ON c.auction='lot:' || lots.id WHERE lots.auction=? AND lots.id=? AND json_extract(c.card,'$.source')=?",
            cmd.room,
            String(cmd.input.lot),
            source,
          )
    if (!saved) throw new Problem(404, 'Listing unavailable.')
    const now = Date.now()
    // A day of cache: seller galleries churn slowly, and this is the call most
    // likely to be repeated by someone flicking between two candidate items.
    const cached = this.store.one(
      'SELECT urls FROM listing_photos WHERE source=? AND checked>?',
      source,
      now - 86400000,
    )
    if (cached) return JSON.parse(String(cached.urls)) as string[]
    const pending = this.pendingPhotos.get(source)
    if (pending) return pending
    if (this.env.DEEPSPACE_APP_ID === 'gavel-local-review') return []
    // Count the quota inside a transaction *before* awaiting the provider, so a
    // burst of concurrent previews cannot all pass the check and then bill.
    this.state.storage.transactionSync(() => {
      this.store.quota('photos:' + cmd.actor.id, 24, now)
      this.store.quota('photos', 120, now)
    })
    const lookup = listingPhotos(this.integration.bind(this), source)
      .then((urls) => {
        if (!preview)
          this.store.rows(
            'INSERT OR REPLACE INTO listing_photos VALUES(?,?,?)',
            source,
            JSON.stringify(urls),
            now,
          )
        return urls
      })
      .finally(() => this.pendingPhotos.delete(source))
    this.pendingPhotos.set(source, lookup)
    return lookup
  }
  private saveDraft(
    owner: string,
    query: string,
    rarity: Rarity,
    card: ItemCard,
    now: number,
  ) {
    const id = crypto.randomUUID()
    const stored = JSON.stringify(card)
    this.state.storage.transactionSync(() => {
      this.store.rows(
        'INSERT INTO item_cards(id,owner,created,card) VALUES(?,?,?,?)',
        id,
        owner,
        now,
        stored,
      )
      if (query)
        this.store.rows(
          'INSERT INTO item_lookups VALUES(?,?,?,?)',
          id,
          query,
          rarity,
          '[]',
        )
    })
    return { id, card }
  }
  private async discover(cmd: RoomCommand) {
    if (cmd.room.startsWith('a-')) {
      if (!cmd.actor.signed)
        throw new Problem(401, 'Sign in to choose an item.')
      const existing = this.store.one(
        'SELECT owner FROM auctions WHERE id=?',
        cmd.room,
      )
      if (existing) this.store.owner(existing, cmd.actor)
    } else if (!cmd.room.startsWith('s-'))
      throw new Problem(422, 'Choose a valid auction.')
    const prompt = String(cmd.input.prompt ?? '').trim()
    const rarity = String(cmd.input.rarity ?? 'any') as Rarity
    if (
      !['any', 'everyday', 'collectible'].includes(rarity) ||
      prompt.length > 140
    )
      throw new Problem(422, 'Describe the item in 140 characters or fewer.')
    if (cmd.input.retryPrices === true)
      throw new Problem(
        410,
        'Seller price checks have been removed. Refresh to continue.',
      )
    const now = Date.now()
    this.state.storage.transactionSync(() => {
      this.store.quota('discovery:' + cmd.actor.id, 18, now)
      this.store.quota('discovery', 120, now)
      this.store.rows(
        'DELETE FROM item_lookups WHERE id IN (SELECT id FROM item_cards WHERE created<?)',
        now - 86400000,
      )
      this.store.rows(
        'DELETE FROM item_cards WHERE auction IS NULL AND created<?',
        now - 86400000,
      )
    })
    const query = prompt.toLowerCase().replace(/\s+/g, ' ')
    if (query && !cmd.room.startsWith('a-')) {
      const hit = this.store.one(
        'SELECT c.card FROM item_lookups q JOIN item_cards c ON q.id=c.id WHERE c.owner=? AND q.query=? AND q.rarity=? AND c.created>? ORDER BY c.created DESC LIMIT 1',
        cmd.actor.id,
        query,
        rarity,
        now - 3600000,
      )
      if (hit)
        return this.saveDraft(
          cmd.actor.id,
          '',
          rarity,
          JSON.parse(String(hit.card)) as ItemCard,
          now,
        )
    }
    const previous = String(cmd.input.previous ?? '')
    const prompts =
      rarity === 'everyday'
        ? [
            'ceramic desk lamp',
            'closed-back headphones',
            'French press coffee maker',
          ]
        : rarity === 'collectible'
          ? [
              'vintage mechanical watch',
              '35mm film camera',
              'vintage portable typewriter',
            ]
          : [
              'portable record player',
              'compact digital camera',
              'steel chronograph',
              'studio headphones',
            ]
    const card =
      this.env.DEEPSPACE_APP_ID === 'gavel-local-review'
        ? exampleItem(prompt, rarity, previous)
        : await researchItem(
            this.integration.bind(this),
            prompt || prompts[Math.floor(Math.random() * prompts.length)],
            rarity,
          )
    if (cmd.room.startsWith('a-'))
      return this.previews.issue(cmd.actor.id, card)
    return this.saveDraft(cmd.actor.id, query, rarity, card, now)
  }
  /** Starting a surprise round is create-then-fill, so a double-submit (or the
   *  StrictMode double-mount in dev) would otherwise open two practice rooms.
   *  The key is room + actor, and the second caller awaits the first's promise. */
  private pendingBidderRounds = new Map<string, Promise<unknown>>()
  private async startSurpriseRound(cmd: RoomCommand) {
    if (this.store.one('SELECT id FROM auctions WHERE id=?', cmd.room))
      return this.state.storage.transactionSync(() => this.store.execute(cmd))
    const key = JSON.stringify([cmd.room, cmd.actor.id])
    const pending = this.pendingBidderRounds.get(key)
    if (pending) return pending
    const create = async () => {
      const draft = await this.discover({ ...cmd, input: {} })
      return this.state.storage.transactionSync(() =>
        this.store.execute(cmd, Date.now(), draft.id),
      )
    }
    const work = create().finally(() => this.pendingBidderRounds.delete(key))
    this.pendingBidderRounds.set(key, work)
    return work
  }
  private async deliver() {
    for (const n of this.store.rows(
      "SELECT * FROM notices WHERE status='pending' LIMIT 10",
    )) {
      // Claim by flipping the row to 'sending' first: two overlapping ticks, or
      // a retry, then skip work someone else already owns.
      const acquired = this.state.storage.transactionSync(() => {
        if (
          !this.store.one(
            "SELECT 1 FROM notices WHERE lot=? AND recipient=? AND status='pending'",
            n.lot,
            n.recipient,
          )
        )
          return false
        this.store.quota('mail', 40, Date.now())
        this.store.rows(
          "UPDATE notices SET status='sending' WHERE lot=? AND recipient=?",
          n.lot,
          n.recipient,
        )
        return true
      })
      if (!acquired) continue
      let status = 'sent'
      try {
        await this.integration('email/send', {
          to: n.recipient,
          subject: 'Gavel · Your auction result',
          text: n.message,
        })
      } catch {
        // Not 'failed': a timeout may still have delivered, so an unconfirmed
        // notice is never re-sent and never reported as undelivered.
        status = 'unconfirmed'
      }
      this.store.rows(
        'UPDATE notices SET status=? WHERE lot=? AND recipient=?',
        status,
        n.lot,
        n.recipient,
      )
    }
  }
  async fetch(request: Request) {
    try {
      const path = new URL(request.url).pathname
      if (path === '/tick') {
        this.state.storage.transactionSync(() => this.store.sweep(Date.now()))
        await this.deliver()
        return Response.json({ ok: true })
      }
      if (path === '/receipts') {
        const { bidder } = await request.json<{ bidder: string }>()
        return Response.json(this.store.receipts(bidder, Date.now()))
      }
      const cmd = (await request.json()) as RoomCommand
      if (cmd.op === 'listing-photo')
        return Response.json({ urls: await this.photos(cmd) })
      if (cmd.op === 'prepare') return Response.json(await this.discover(cmd))
      // Art is streamed from the row rather than carried in the view payload —
      // a 4:3 PNG is ~1 MB and would dominate every poll.
      if (path === '/art') {
        this.store.auction(cmd.room, cmd.actor)
        const row = this.store.one(
          'SELECT image FROM lots WHERE id=? AND auction=?',
          String(cmd.input.lot),
          cmd.room,
        )
        if (!row?.image) throw new Problem(404, 'No artwork available.')
        const [prefix, data] = String(row.image).split(',')
        return new Response(
          Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
          {
            headers: {
              'Content-Type': prefix.slice(5, -7),
              'Cache-Control': 'private, max-age=3600',
            },
          },
        )
      }
      if (
        cmd.op === 'sample' &&
        (cmd.input.role ?? 'bidder') === 'bidder' &&
        !cmd.input.item &&
        !cmd.input.source
      )
        return Response.json(await this.startSurpriseRound(cmd))
      const preview =
        (cmd.op === 'create' || cmd.op === 'add') &&
        cmd.room.startsWith('a-') &&
        typeof cmd.input.item === 'string' &&
        cmd.input.item.startsWith('preview.')
          ? await this.previews.read(cmd.input.item, cmd.actor.id)
          : undefined
      const result = this.state.storage.transactionSync(() =>
        this.store.execute(cmd, Date.now(), undefined, preview),
      )
      if (cmd.op === 'illustrate')
        return Response.json(
          await this.assist(cmd, result as { id: string; title: string }),
        )
      return Response.json(result)
    } catch (e) {
      if (e instanceof Problem)
        return Response.json({ error: e.message }, { status: e.status })
      // Name only: storage errors can carry row values.
      console.error(
        'Auction storage failure',
        e instanceof Error ? e.name : 'unknown',
      )
      return Response.json(
        { error: 'Could not save the auction. Please retry.' },
        { status: 500 },
      )
    }
  }
}
/** One object instance (`gavel/v1`) holds every auction, which is what makes a
 *  cross-room read like the receipt list a single query. The cost is that all
 *  traffic serialises here; sharding by room id is the next step if it matters. */
export function auctionStub(env: Env) {
  return env.AUCTIONS.get(env.AUCTIONS.idFromName('gavel/v1'))
}
export const guest: Actor = { id: 'visitor', name: 'Visitor', signed: false }
