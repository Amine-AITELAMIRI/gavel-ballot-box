import type { SharedPreview } from './shared-preview'
import type {
  Actor,
  Auction,
  BidReceipt,
  Lot,
  PracticeRole,
  RoomCommand,
} from './model'
import { samplePrint, type ItemCard } from './items'
export class Problem extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
type Value = string | number | null
type Row = Record<string, Value>
export interface Database {
  exec(query: string, ...args: Value[]): { toArray(): Row[] }
}
const day = 86400000
export function field(value: unknown, max: number, fallback = '') {
  const text = String(value ?? fallback).trim()
  if (!text || text.length > max)
    throw new Problem(422, 'Enter text between 1 and ' + max + ' characters.')
  return text
}
function notificationEmail(input: Record<string, unknown>, actor: Actor) {
  if (input.notify !== true) return null
  const value = input.email === undefined ? actor.email : input.email
  if (
    typeof value !== 'string' ||
    value.trim().length > 254 ||
    !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value.trim())
  )
    throw new Problem(422, 'Enter a valid notification email address.')
  return value.trim()
}
export class AuctionStore {
  constructor(private db: Database) {}
  setup() {
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS auctions (id TEXT PRIMARY KEY, title TEXT NOT NULL, owner TEXT NOT NULL, email TEXT, sample INTEGER NOT NULL, closes INTEGER NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS lots (id TEXT PRIMARY KEY, auction TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, source TEXT, suggestion TEXT, image TEXT);
      CREATE INDEX IF NOT EXISTS lots_auction ON lots(auction);
      CREATE TABLE IF NOT EXISTS bids (seq INTEGER PRIMARY KEY AUTOINCREMENT, lot TEXT NOT NULL, bidder TEXT NOT NULL, alias TEXT NOT NULL, email TEXT, amount INTEGER NOT NULL, UNIQUE(lot,bidder));
      CREATE INDEX IF NOT EXISTS bids_by_bidder ON bids(bidder,seq DESC);
      CREATE INDEX IF NOT EXISTS bids_rank ON bids(lot,amount DESC,seq);
      CREATE TABLE IF NOT EXISTS item_cards (id TEXT PRIMARY KEY, owner TEXT NOT NULL, created INTEGER NOT NULL, card TEXT NOT NULL, auction TEXT UNIQUE);
      CREATE TABLE IF NOT EXISTS preview_key(id INTEGER PRIMARY KEY CHECK(id=1), secret TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS item_lookups(id TEXT PRIMARY KEY, query TEXT NOT NULL, rarity TEXT NOT NULL, candidates TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS item_lookup_query ON item_lookups(query,rarity);
      CREATE TABLE IF NOT EXISTS listing_photos (source TEXT PRIMARY KEY, urls TEXT NOT NULL, checked INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS practice_rounds (auction TEXT PRIMARY KEY, role TEXT NOT NULL, announced INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS practice_offers (lot TEXT NOT NULL,bidder TEXT NOT NULL,alias TEXT NOT NULL,amount INTEGER NOT NULL,arrives INTEGER NOT NULL,PRIMARY KEY(lot,bidder));
      CREATE TABLE IF NOT EXISTS results (lot TEXT PRIMARY KEY, winner TEXT, alias TEXT, amount INTEGER, count INTEGER NOT NULL, closed INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS usage (bucket TEXT, period INTEGER, n INTEGER, PRIMARY KEY(bucket,period));
      CREATE TABLE IF NOT EXISTS notices (lot TEXT, recipient TEXT, message TEXT, status TEXT, PRIMARY KEY(lot,recipient));`)
  }
  rows(q: string, ...args: Value[]) {
    return this.db.exec(q, ...args).toArray()
  }
  one(q: string, ...args: Value[]) {
    return this.rows(q, ...args)[0]
  }
  quota(bucket: string, limit: number, now: number) {
    const period = Math.floor(now / day)
    this.db.exec(
      'INSERT INTO usage VALUES(?,?,1) ON CONFLICT(bucket,period) DO UPDATE SET n=n+1',
      bucket,
      period,
    )
    if (
      Number(
        this.one(
          'SELECT n FROM usage WHERE bucket=? AND period=?',
          bucket,
          period,
        ).n,
      ) > limit
    )
      throw new Problem(429, 'Daily allowance reached. Try again tomorrow.')
  }
  owner(a: Row, actor: Actor) {
    if (a.owner !== actor.id)
      throw new Problem(403, 'Only the organizer can do that.')
  }
  auction(id: string, actor: Actor) {
    const a = this.one('SELECT * FROM auctions WHERE id=?', id)
    if (!a || (a.sample && a.owner !== actor.id))
      throw new Problem(404, 'This auction is unavailable in this session.')
    return a
  }
  private receivePracticeOffers(lot: Value, now: number) {
    this.db.exec(
      `INSERT INTO bids(lot,bidder,alias,amount)
       SELECT p.lot,p.bidder,p.alias,p.amount FROM practice_offers p
       WHERE p.lot=? AND p.arrives<=? AND NOT EXISTS
         (SELECT 1 FROM bids b WHERE b.lot=p.lot AND b.bidder=p.bidder)
       ORDER BY p.arrives`,
      lot,
      now,
    )
  }
  settle(lot: Row, a: Row, now: number) {
    if (this.one('SELECT 1 FROM results WHERE lot=?', lot.id)) return
    if (a.sample) this.receivePracticeOffers(lot.id, now)
    const best = this.one(
      'SELECT * FROM bids WHERE lot=? ORDER BY amount DESC,seq ASC LIMIT 1',
      lot.id,
    )
    const count = this.one(
      'SELECT count(*) AS n FROM bids WHERE lot=?',
      lot.id,
    ).n
    this.db.exec(
      'INSERT INTO results VALUES(?,?,?,?,?,?)',
      lot.id,
      best?.bidder ?? null,
      best?.alias ?? null,
      best?.amount ?? null,
      count,
      now,
    )
    if (!a.sample) {
      const message = best
        ? 'Winning bid: $' + best.amount + ' from ' + best.alias + '.'
        : 'This lot closed without bids.'
      for (const email of new Set([best?.email, a.email])) {
        if (email)
          this.db.exec(
            "INSERT OR IGNORE INTO notices VALUES(?,?,?,'pending')",
            lot.id,
            email,
            String(lot.title) + ' — ' + message,
          )
      }
    }
  }
  sweep(now: number) {
    const due = this.rows(
      'SELECT l.* FROM lots l JOIN auctions a ON a.id=l.auction LEFT JOIN results r ON r.lot=l.id WHERE a.closes<=? AND r.lot IS NULL LIMIT 100',
      now,
    )
    for (const l of due)
      this.settle(
        l,
        this.one('SELECT * FROM auctions WHERE id=?', l.auction),
        now,
      )
    this.db.exec(
      'DELETE FROM usage WHERE period < ?',
      Math.floor(now / day) - 1,
    )
  }
  receipts(bidder: string, now: number): BidReceipt[] {
    return this.rows(
      `SELECT a.id AS room,a.title AS auctionTitle,l.id AS lot,l.title AS itemTitle,
              (r.lot IS NOT NULL OR a.closes<=?) AS closed
         FROM bids b JOIN lots l ON b.lot=l.id JOIN auctions a ON l.auction=a.id
         LEFT JOIN results r ON l.id=r.lot
        WHERE b.bidder=? AND a.sample=0 ORDER BY b.seq DESC`,
      now,
      bidder,
    ).map((row) => ({
      room: String(row.room),
      auctionTitle: String(row.auctionTitle),
      lot: String(row.lot),
      itemTitle: String(row.itemTitle),
      closed: Boolean(row.closed),
    }))
  }
  view(a: Row, actor: Actor, now: number): Auction {
    const round = a.sample
      ? this.one(
          'SELECT role,announced,card FROM practice_rounds LEFT JOIN item_cards USING(auction) WHERE auction=?',
          a.id,
        )
      : undefined
    const hideResult = round?.role === 'host' && !round.announced
    const lots: Lot[] = this.rows(
      "SELECT l.id,l.title,l.description,l.source,l.suggestion,l.image IS NOT NULL AS hasArt,c.card FROM lots l LEFT JOIN item_cards c ON c.auction='lot:' || l.id WHERE l.auction=? ORDER BY l.rowid",
      a.id,
    ).map((l) => {
      if (Number(a.closes) <= now) this.settle(l, a, now)
      else if (round) this.receivePracticeOffers(l.id, now)
      const r = hideResult
        ? undefined
        : this.one('SELECT * FROM results WHERE lot=?', l.id)
      const own = this.one(
        'SELECT amount,email FROM bids WHERE lot=? AND bidder=?',
        l.id,
        actor.id,
      )
      return {
        id: String(l.id),
        title: String(l.title),
        description: String(l.description),
        source: a.owner === actor.id ? (l.source as string | null) : null,
        suggestion:
          a.owner === actor.id ? (l.suggestion as string | null) : null,
        hasArt: Boolean(l.hasArt),
        ...(l.card ? { item: JSON.parse(String(l.card)) as ItemCard } : {}),
        ...(own?.email ? { myNotificationEmail: String(own.email) } : {}),
        ...(a.owner === actor.id && !r
          ? {
              sealedCount: Number(
                this.one('SELECT count(*) AS n FROM bids WHERE lot=?', l.id).n,
              ),
            }
          : {}),
        myBid: own ? Number(own.amount) : null,
        result: r
          ? {
              winner: r.alias as string | null,
              amount: r.amount as number | null,
              count: Number(r.count),
              mine: r.winner === actor.id,
            }
          : null,
      }
    })
    return {
      id: String(a.id),
      title: String(a.title),
      sample: Boolean(a.sample),
      ...(round
        ? {
            practice: {
              role: round.role as PracticeRole,
              ...(round.card
                ? { item: JSON.parse(String(round.card)) as ItemCard }
                : {}),
              serverNow: now,
              duration: (Number(a.closes) - Number(a.created)) / 1000,
              awaitingAnnouncement: hideResult && now >= Number(a.closes),
              arrivals: this.rows(
                'SELECT alias FROM bids WHERE lot=? ORDER BY seq',
                lots[0].id,
              ).map((row) => String(row.alias)),
            },
          }
        : {}),
      owner: a.owner === actor.id,
      closesAt: Number(a.closes),
      lots,
    }
  }
  private addSharedLot(
    room: string,
    actor: Actor,
    input: Record<string, unknown>,
    now: number,
    title: unknown,
    preview?: SharedPreview,
  ) {
    const id = crypto.randomUUID()
    let description = input.description
    if (preview) {
      if (this.one('SELECT id FROM item_cards WHERE id=?', preview.id))
        throw new Problem(409, 'This item has already been added.')
      title = preview.card.title
      description = preview.card.description
      this.rows(
        'INSERT INTO item_cards(id,owner,created,card,auction) VALUES(?,?,?,?,?)',
        preview.id,
        actor.id,
        now,
        JSON.stringify(preview.card),
        'lot:' + id,
      )
    } else if (input.item) {
      const draft = this.one(
        'SELECT card FROM item_cards WHERE id=? AND owner=? AND auction IS NULL AND created>?',
        String(input.item),
        actor.id,
        now - day,
      )
      if (!draft)
        throw new Problem(
          422,
          'Choose the item again. This preview has expired.',
        )
      const card = JSON.parse(String(draft.card)) as ItemCard
      title = card.title
      description = card.description
      this.rows(
        'UPDATE item_cards SET auction=? WHERE id=?',
        'lot:' + id,
        String(input.item),
      )
    }
    this.rows(
      'INSERT INTO lots(id,auction,title,description) VALUES(?,?,?,?)',
      id,
      room,
      field(title, 90),
      field(description, 480),
    )
  }
  execute(
    { op, room, actor, input }: RoomCommand,
    now = Date.now(),
    surpriseDraft?: string,
    preview?: SharedPreview,
  ): unknown {
    if (op === 'sample' || op === 'create') {
      const sample = op === 'sample'
      if (!sample && !actor.signed)
        throw new Problem(401, 'Sign in to organize an auction.')
      const existing = this.one('SELECT * FROM auctions WHERE id=?', room)
      if (existing) {
        this.owner(existing, actor)
        return this.view(existing, actor, now)
      }
      this.quota('rooms:' + actor.id, 24, now)
      this.quota(sample ? 'samples' : 'rooms', sample ? 1500 : 150, now)
      const title = sample ? 'Studio benefit' : field(input.title, 80)
      const minutes = sample ? 1440 : Number(input.minutes)
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080)
        throw new Problem(422, 'Choose a deadline within seven days.')
      const role = input.role ?? 'bidder'
      const seconds = role === 'host' ? Number(input.seconds ?? 5) : 10
      if (
        sample &&
        ((role !== 'bidder' && role !== 'host') ||
          !Number.isInteger(seconds) ||
          seconds < 5 ||
          seconds > 60)
      )
        throw new Problem(
          422,
          'Choose a practice role and a duration from 5 to 60 seconds.',
        )
      let item = samplePrint
      if (sample && role === 'bidder' && input.item)
        throw new Problem(422, 'The host chooses the auction item.')
      if (sample && role === 'bidder' && input.source) {
        const hosted = this.one(
          "SELECT c.card FROM auctions a JOIN practice_rounds r ON r.auction=a.id LEFT JOIN item_cards c ON c.auction=a.id WHERE a.id=? AND a.owner=? AND r.role='host'",
          String(input.source),
          actor.id,
        )
        if (!hosted)
          throw new Problem(
            404,
            'This host round is unavailable in this browser.',
          )
        if (hosted.card) {
          item = JSON.parse(String(hosted.card)) as ItemCard
          this.rows(
            'INSERT INTO item_cards(id,owner,created,card,auction) VALUES(?,?,?,?,?)',
            crypto.randomUUID(),
            actor.id,
            now,
            hosted.card,
            room,
          )
        }
      }
      const draftId = role === 'host' ? input.item : surpriseDraft
      if (sample && !draftId && !(role === 'bidder' && input.source))
        throw new Problem(
          422,
          'Choose an auction item before starting the round.',
        )
      if (sample && draftId) {
        const draft = this.one(
          'SELECT card FROM item_cards WHERE id=? AND owner=? AND auction IS NULL AND created>?',
          String(draftId),
          actor.id,
          now - day,
        )
        if (!draft)
          throw new Problem(
            422,
            'Choose the item again. This preview has expired.',
          )
        item = JSON.parse(String(draft.card)) as ItemCard
        this.rows(
          'UPDATE item_cards SET auction=? WHERE id=?',
          room,
          String(draftId),
        )
      }
      const duration = sample ? seconds * 1000 : minutes * 60000
      this.db.exec(
        'INSERT INTO auctions VALUES(?,?,?,?,?,?,?)',
        room,
        title,
        actor.id,
        sample ? null : notificationEmail(input, actor),
        Number(sample),
        now + duration,
        now,
      )
      if (!sample)
        this.addSharedLot(room, actor, input, now, input.lotTitle, preview)
      else {
        const id = crypto.randomUUID()
        this.rows(
          'INSERT INTO lots(id,auction,title,description) VALUES(?,?,?,?)',
          id,
          room,
          item.title,
          item.description,
        )
        this.db.exec(
          'INSERT INTO practice_rounds(auction,role) VALUES(?,?)',
          room,
          String(role),
        )
        const reference = item.sourcePrice?.amount ?? item.practicePrice
        const low = reference ? Math.max(1, Math.floor(reference * 0.75)) : 45
        const high = reference
          ? Math.min(1000000, Math.ceil(reference * 1.05))
          : 80
        const bidders = ['Alex', 'Riley', 'Sam']
        bidders.forEach((alias, index) => {
          const draw = crypto.getRandomValues(new Uint32Array(1))[0]
          this.db.exec(
            'INSERT INTO practice_offers VALUES(?,?,?,?,?)',
            id,
            'practice:' + alias,
            alias,
            low + (draw % (high - low + 1)),
            now + Math.floor((duration * (index + 1)) / 4),
          )
        })
      }
    }
    const a = this.auction(room, actor)
    if (['view', 'create', 'sample'].includes(op))
      return this.view(a, actor, now)
    if (op === 'add') {
      this.owner(a, actor)
      if (a.sample || Number(a.closes) <= now)
        throw new Problem(409, 'This auction cannot accept new lots.')
      if (
        Number(
          this.one('SELECT count(*) AS n FROM lots WHERE auction=?', room).n,
        ) >= 12
      )
        throw new Problem(422, 'This auction has reached 12 lots.')
      this.addSharedLot(room, actor, input, now, input.title, preview)
      return this.view(a, actor, now)
    }
    const lot = this.one(
      'SELECT id,title,auction FROM lots WHERE id=? AND auction=?',
      String(input.lot ?? ''),
      room,
    )
    if (!lot) throw new Problem(404, 'Lot not found.')
    const closed = this.one('SELECT 1 FROM results WHERE lot=?', lot.id)
    const round = a.sample
      ? this.one('SELECT role FROM practice_rounds WHERE auction=?', room)
      : undefined
    if (op === 'announce') {
      this.owner(a, actor)
      if (round?.role !== 'host' || now < Number(a.closes))
        throw new Problem(409, 'Wait until practice bidding ends.')
      this.settle(lot, a, now)
      this.db.exec(
        'UPDATE practice_rounds SET announced=1 WHERE auction=?',
        room,
      )
      return this.view(a, actor, now)
    }
    if (op === 'bid') {
      if (round?.role === 'host')
        throw new Problem(403, 'Hosts can only announce the winner.')
      if (round?.role === 'bidder' && (closed || now >= Number(a.closes)))
        return this.view(a, actor, now)
      if (!a.sample && !actor.signed)
        throw new Problem(401, 'Sign in to place a bid.')
      if (!a.sample && a.owner === actor.id)
        throw new Problem(
          403,
          'Hosts can preview their auction. Only invited bidders can place bids.',
        )
      if (closed || Number(a.closes) <= now)
        throw new Problem(409, 'Bidding has closed.')
      const amount = input.amount
      if (
        typeof amount !== 'number' ||
        !Number.isSafeInteger(amount) ||
        amount < 1 ||
        amount > 1000000
      )
        throw new Problem(
          422,
          'Enter a whole-dollar bid from $1 to $1,000,000.',
        )
      const previous = this.one(
        'SELECT amount FROM bids WHERE lot=? AND bidder=?',
        lot.id,
        actor.id,
      )
      if (round?.role === 'bidder') {
        if (previous) return this.view(a, actor, now)
        // Give already-arrived offers their sequence numbers before accepting this bid.
        this.receivePracticeOffers(lot.id, now)
      }
      if (previous && Number(previous.amount) >= amount)
        throw new Problem(
          409,
          'Your new bid must be higher than your sealed bid.',
        )
      this.db.exec(
        'DELETE FROM bids WHERE lot=? AND bidder=?',
        lot.id,
        actor.id,
      )
      this.db.exec(
        'INSERT INTO bids(lot,bidder,alias,email,amount) VALUES(?,?,?,?,?)',
        lot.id,
        actor.id,
        actor.name,
        a.sample ? null : notificationEmail(input, actor),
        amount,
      )
    } else if (op === 'close') {
      if (round) throw new Problem(409, 'Timed practice closes automatically.')
      this.owner(a, actor)
      this.settle(lot, a, now)
    } else if (op === 'illustrate') {
      this.owner(a, actor)
      if (!actor.signed || a.sample || closed || Number(a.closes) <= now)
        throw new Problem(403, 'Assistance is available for open, hosted lots.')
      const existing = this.one(
        'SELECT image IS NOT NULL AS hasArt FROM lots WHERE id=?',
        lot.id,
      )
      if (existing.hasArt)
        throw new Problem(409, 'This lot already has that asset.')
      this.quota('assist:' + actor.id, 3, now)
      this.quota('assist', 12, now)
      return { id: lot.id, title: lot.title }
    } else throw new Problem(404, 'Unknown operation.')
    return this.view(a, actor, now)
  }
}
