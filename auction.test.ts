import { DatabaseSync } from 'node:sqlite'
import { describe, it, expect, vi } from 'vitest'
import { AuctionRoom } from './src/gavel/room'
import { BIDDER_SECONDS } from './src/constants'
import type { Env } from './worker'
const provider = vi.hoisted(() => vi.fn())
vi.mock('deepspace/worker', () => ({
  buildCronContext: () => ({ integrations: { call: provider } }),
}))
import { AuctionStore, type Database } from './src/gavel/store'
import type { Actor, Auction } from './src/gavel/model'
const actors = ['Host', 'Alice', 'Bob'].map((name) => ({
  id: name,
  name,
  signed: true,
}))
const [host, alice, bob] = actors
function setup() {
  const sql = new DatabaseSync(':memory:')
  const db: Database = {
    exec(q, ...args) {
      if (q.includes('CREATE TABLE')) {
        sql.exec(q)
        return { toArray: () => [] }
      }
      const rows = sql.prepare(q).all(...args)
      return {
        toArray: () =>
          rows as ReturnType<ReturnType<Database['exec']>['toArray']>,
      }
    },
  }
  const store = new AuctionStore(db)
  store.setup()
  const start = 100000
  const run = (
    op: string,
    actor: Actor,
    input: Record<string, unknown> = {},
    now = start,
  ) => store.execute({ op, room: 'auction', actor, input }, now) as Auction
  const room = run('create', host, {
    title: 'Studio',
    minutes: 1,
    lotTitle: 'Print',
    description: 'Edition of 25',
  })
  const lot = room.lots[0].id
  return { run, lot, store, start, sql, db }
}
describe('sealed bidding', () => {
  it('shows each caller only their private bid, then publishes just the winner', () => {
    const { run, lot } = setup()
    run('bid', alice, { lot, amount: 51 })
    run('bid', bob, { lot, amount: 80 })
    expect(run('view', host).lots[0]).toMatchObject({
      myBid: null,
      result: null,
    })
    const bobLot = run('view', bob).lots[0]
    expect(bobLot.myBid).toBe(80)
    expect(bobLot.sealedCount).toBeUndefined()
    expect(run('view', host).lots[0].sealedCount).toBe(2)
    expect(run('view', alice).lots[0].myBid).toBe(51)
    const result = run('close', host, { lot }).lots[0].result
    expect(result).toEqual({ winner: 'Bob', amount: 80, count: 2, mine: false })
    expect(run('close', host, { lot }).lots[0].result).toEqual(result)
    expect(run('view', bob).lots[0].result?.mine).toBe(true)
  })
  it('enforces ownership, positive whole-dollar raises, lot scope and deadline', () => {
    const { run, lot, start } = setup()
    run('bid', alice, { lot, amount: 50 })
    expect(() => run('bid', host, { lot, amount: 200 })).toThrow(
      /Hosts can preview/,
    )
    for (const amount of [0, -1, 10.5, 50, 49, 1000001])
      expect(() => run('bid', alice, { lot, amount })).toThrow()
    expect(() => run('close', bob, { lot })).toThrow(/organizer/)
    expect(() => run('bid', alice, { lot: 'other', amount: 80 })).toThrow(
      /Lot not found/,
    )
    expect(() => run('bid', alice, { lot, amount: 80 }, start + 60000)).toThrow(
      /closed/,
    )
    expect(run('view', host, {}, start + 60000).lots[0].result?.amount).toBe(50)
  })
  it('finds a signed bidder’s receipts by item, including closed and pre-existing bids', () => {
    const { run, lot, store, start } = setup()
    const other = run('add', host, { title: 'Bowl', description: 'Blue glaze' })
      .lots[1].id
    run('bid', alice, { lot: other, amount: 37 })
    run('bid', bob, { lot, amount: 52 })
    const receipt = {
      room: 'auction',
      auctionTitle: 'Studio',
      lot: other,
      itemTitle: 'Bowl',
      closed: false,
    }
    expect(store.receipts(alice.id, start)).toEqual([receipt])
    expect(store.receipts(host.id, start)).toEqual([])
    expect(store.receipts(alice.id, start + 60001)).toEqual([
      { ...receipt, closed: true },
    ])
  })
  it('resolves ties in order of reaching that amount and maintains one current bid', () => {
    const { run, lot } = setup()
    run('bid', alice, { lot, amount: 50 })
    run('bid', bob, { lot, amount: 80 })
    run('bid', alice, { lot, amount: 80 })
    expect(run('close', host, { lot }).lots[0].result).toMatchObject({
      winner: 'Bob',
      count: 2,
    })
  })
  it('queues notices only for opted-in recipients at their entered addresses', () => {
    const { store, start } = setup()
    const run = (op: string, actor: Actor, input: Record<string, unknown>) =>
      store.execute(
        { op, actor, input, room: 'shared-email' },
        start,
      ) as Auction
    const live = run('create', host, {
      title: 'Live',
      lotTitle: 'Camera',
      description: 'Boxed',
      minutes: 60,
      notify: true,
      email: 'host-choice@example.invalid',
    })
    const lot = live.lots[0].id
    expect(() =>
      run('bid', alice, { lot, amount: 40, notify: true, email: 'bad' }),
    ).toThrow(/email/)
    run('bid', alice, {
      lot,
      amount: 40,
      notify: false,
      email: 'unchecked@example.invalid',
    })
    run('bid', bob, {
      lot,
      amount: 80,
      notify: true,
      email: '  bidder-choice@example.invalid ',
    })
    expect(JSON.stringify(run('view', host, {}))).not.toContain('bidder-choice')
    run('close', host, { lot })
    expect(
      store
        .rows('SELECT recipient FROM notices ORDER BY recipient')
        .map((x) => x.recipient),
    ).toEqual(['bidder-choice@example.invalid', 'host-choice@example.invalid'])
  })
  it('settles empty lots and suppresses duplicate notifications across a cron/close race', () => {
    const { run, lot, store, start } = setup()
    run(
      'bid',
      { ...bob, email: 'test@example.invalid' },
      { lot, amount: 5, notify: true },
    )
    run('close', host, { lot })
    const second = run('add', host, {
      title: 'Unused',
      description: 'No offers',
    }).lots[1]
    store.sweep(start + 60001)
    run('close', host, { lot: second.id }, start + 60002)
    expect(store.rows('SELECT * FROM notices')).toHaveLength(1)
    expect(run('view', host).lots[1].result).toMatchObject({
      count: 0,
      amount: null,
      winner: null,
    })
  })
})

describe('timed practice', () => {
  const visitor = { id: 'guest:test', name: 'You', signed: false }
  function practice(role: string, seconds: number) {
    const { store, start } = setup()
    store.rows(
      'INSERT INTO item_cards(id,owner,created,card) VALUES(?,?,?,?)',
      'draft',
      visitor.id,
      start,
      JSON.stringify({
        title: 'Clock',
        description: 'A desk clock.',
        example: true,
        practicePrice: 50,
      }),
    )
    const run = (
      op: string,
      input: Record<string, unknown> = {},
      elapsed = 0,
    ) =>
      store.execute(
        { op, room: 'practice', actor: visitor, input },
        start + elapsed,
        role === 'bidder' ? 'draft' : undefined,
      ) as Auction
    const auction = run('sample', {
      role,
      seconds,
      item: role === 'host' ? 'draft' : undefined,
    })
    return { run, lot: auction.lots[0].id, store, start }
  }
  it('persists scheduled arrivals and withholds the host result until announcement', () => {
    const { run, lot, start, store } = practice('host', 5)
    expect(run('view').practice?.arrivals).toEqual([])
    expect(run('view', {}, 2500).practice?.arrivals).toEqual(['Alex', 'Riley'])
    expect(run('view', {}, 2500).lots[0].sealedCount).toBe(2)
    expect(() => run('announce', { lot }, 4999)).toThrow(/Wait/)
    expect(() => run('bid', { lot, amount: 91 })).toThrow(/Hosts/)
    expect(() => run('close', { lot })).toThrow(/automatically/)
    store.sweep(start + 5000)
    expect(run('view', {}, 5000).lots[0].result).toBeNull()
    expect(run('view', {}, 5000).practice?.awaitingAnnouncement).toBe(true)
    const result = run('announce', { lot }, 5000).lots[0].result
    expect(result?.count).toBe(3)
    expect(run('announce', { lot }, 5100).lots[0].result).toEqual(result)
  })
  it('seals the first bidder offer atomically and enforces the bidder deadline', () => {
    const { run, lot } = practice('bidder', 60)
    expect(run('view').practice?.duration).toBe(BIDDER_SECONDS)
    // Bots arrive at a quarter, a half and three quarters of the round.
    const submitted = run('bid', { lot, amount: 91 }, 2600)
    expect(submitted.practice?.arrivals).toEqual(['You'])
    expect(submitted.lots[0]).toMatchObject({ myBid: 91, result: null })
    // A second, lower offer is refused rather than queued.
    expect(run('bid', { lot, amount: 125 }, 3000).lots[0].myBid).toBe(91)
    expect(run('view', {}, 6000).practice?.arrivals).toEqual(['You', 'Alex'])
    expect(run('view', {}, 11000).practice?.arrivals).toEqual([
      'You',
      'Alex',
      'Riley',
    ])
    expect(run('view', {}, 11000).lots[0].result).toBeNull()
    expect(run('view', {}, BIDDER_SECONDS * 1000).lots[0].result).toMatchObject({
      mine: true,
      amount: 91,
      count: 4,
    })
    // A seal landing after the deadline is dropped rather than queued: the
    // round expires and the lot settles on the bots alone.
    const late = practice('bidder', 5)
    const expired = late.run('bid', { lot: late.lot, amount: 91 }, 21000)
      .lots[0]
    expect(expired.myBid).toBeNull()
    expect(expired.result?.count).toBe(3)
  })
})

it('starts a host round as soon as the item is ready and caches independent drafts without price research', async () => {
  const { db } = setup()
  provider.mockClear()
  const source = 'https://seller.example/headphones'
  provider.mockImplementation(async (name, body) => {
    if (name === 'exa/search')
      return {
        results: [
          {
            url: source,
            title: 'Studio headphones',
            text: 'Asking $110.',
            image: 'https://seller.example/photo.jpg',
          },
        ],
      }
    expect(name).toBe('anthropic/chat-completion')
    expect(body.system).not.toContain('Favor sellers with a visible')
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            primary: 0,
            title: 'Studio headphones',
            description: 'Closed-back headphones.',
          }),
        },
      ],
    }
  })
  const server = new AuctionRoom(
    {
      storage: { sql: db, transactionSync: (fn: () => unknown) => fn() },
      waitUntil: () => {},
    } as unknown as DurableObjectState,
    { DEEPSPACE_APP_ID: 'live-test' } as Env,
  )
  async function request(
    op: string,
    room: string,
    input: Record<string, unknown>,
    actor = host,
  ) {
    const response = await server.fetch(
      new Request('https://auction/command', {
        method: 'POST',
        body: JSON.stringify({ op, room, input, actor }),
      }),
    )
    expect(response.status).toBe(200)
    return response.json()
  }
  const search = { prompt: 'Studio headphones', rarity: 'any' }
  const preview = await request('prepare', 's-first', search)
  expect(preview.card).toMatchObject({
    title: 'Studio headphones',
  })
  expect(preview.card.sourcePrice).toBeUndefined()
  const started = await request('sample', 's-round', {
    role: 'host',
    item: preview.id,
  })
  expect(started.practice.item).toEqual(preview.card)
  expect(provider.mock.calls.map(([name]) => name)).toEqual([
    'exa/search',
    'anthropic/chat-completion',
  ])
  const calls = provider.mock.calls.length
  const repeat = await request('prepare', 's-second', {
    ...search,
    prompt: '  STUDIO   headphones  ',
  })
  expect(repeat.id).not.toBe(preview.id)
  expect(repeat.card).toEqual(preview.card)
  expect(provider.mock.calls.length).toBe(calls)
  const other = await request('prepare', 's-another', search, alice)
  expect(other.card.sourcePrice).toBeUndefined()
  expect(provider.mock.calls.length).toBe(calls + 2)
})

it('starts the bidder clock after surprise discovery and keeps one item across concurrent starts and retries', async () => {
  const { store, db } = setup()
  const source = 'https://seller.example/desk-radio'
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  provider.mockClear()
  provider.mockImplementation(async (name, body) => {
    if (name === 'exa/search') {
      expect(body.contents.highlights).toBeUndefined()
      await gate
      return {
        results: [
          { title: 'Desk radio', url: source, text: 'Radio for sale.' },
        ],
      }
    }
    expect(name).toBe('anthropic/chat-completion')
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            primary: 0,
            title: 'Desk radio',
            description: 'A tabletop radio.',
            status: 'asking',
            quote: '$42',
          }),
        },
      ],
    }
  })
  const server = new AuctionRoom(
    {
      storage: { sql: db, transactionSync: (fn: () => unknown) => fn() },
      waitUntil: () => {},
    } as unknown as DurableObjectState,
    { DEEPSPACE_APP_ID: 'live-test' } as Env,
  )
  const start = () =>
    server
      .fetch(
        new Request('https://auction/command', {
          method: 'POST',
          body: JSON.stringify({
            op: 'sample',
            room: 's-surprise',
            actor: alice,
            input: { role: 'bidder' },
          }),
        }),
      )
      .then(async (res) => {
        expect(res.status).toBe(200)
        return (await res.json()) as Auction
      })
  const first = start(),
    second = start()
  await vi.waitFor(() => expect(provider).toHaveBeenCalled())
  expect(
    store.one('SELECT id FROM auctions WHERE id=?', 's-surprise'),
  ).toBeUndefined()
  release()
  const [a, b] = await Promise.all([first, second])
  expect(a.practice?.item).toMatchObject({
    title: 'Desk radio',
    source,
    description: 'A tabletop radio.',
  })
  expect(a.closesAt - a.practice!.serverNow).toBe(BIDDER_SECONDS * 1000)
  expect(b.lots[0].id).toBe(a.lots[0].id)
  expect((await start()).closesAt).toBe(a.closesAt)
  expect(provider.mock.calls.map(([name]) => name)).toEqual([
    'exa/search',
    'anthropic/chat-completion',
  ])
})

it('persists shared setup only when opening succeeds, including after a worker restart', async () => {
  const { db, store, sql } = setup()
  const state = {
    storage: {
      sql: db,
      transactionSync: (fn: () => unknown) => {
        sql.exec('BEGIN')
        try {
          const result = fn()
          sql.exec('COMMIT')
          return result
        } catch (error) {
          sql.exec('ROLLBACK')
          throw error
        }
      },
    },
  } as unknown as DurableObjectState
  const env = { DEEPSPACE_APP_ID: 'gavel-local-review' } as Env
  let server = new AuctionRoom(state, env)
  const room = 'a-private-setup'
  const request = (op: string, input: Record<string, unknown>, actor = host) =>
    server.fetch(
      new Request('https://auction/command', {
        method: 'POST',
        body: JSON.stringify({ op, input, room, actor }),
      }),
    )
  const preview = await (await request('prepare', { prompt: 'camera' })).json()
  const clean = () => {
    expect(
      store.one('SELECT id FROM auctions WHERE id=?', room),
    ).toBeUndefined()
    expect(store.rows('SELECT id FROM lots WHERE auction=?', room)).toEqual([])
    expect(store.rows('SELECT id FROM item_cards')).toEqual([])
    expect(store.rows('SELECT id FROM item_lookups')).toEqual([])
  }
  clean()
  server = new AuctionRoom(state, env)
  const form = { title: 'Gallery', minutes: 60, item: preview.id }
  expect((await request('create', form, bob)).status).toBe(422)
  expect(
    (
      await request('create', {
        ...form,
        item: preview.id.replace(preview.card.title, 'Replacement'),
      })
    ).status,
  ).toBe(422)
  expect(
    (await request('create', { ...form, notify: true, email: 'invalid' }))
      .status,
  ).toBe(422)
  clean()
  const opened = await request('create', form)
  expect(opened.status).toBe(200)
  expect((await opened.json()).lots[0].item).toEqual(preview.card)
  expect((await request('create', form)).status).toBe(200)
  expect(store.rows('SELECT id FROM item_cards')).toHaveLength(1)
})
