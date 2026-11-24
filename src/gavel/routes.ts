import type { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import type { AppContext } from '../../worker'
import { resolveAuth } from '../server/http-routes'
import { auctionStub, guest } from './room'
import type { Actor } from './model'

/** Room ids are `s-<uuid>` (visitor practice) or `a-<uuid>` (shared auction).
 *  The prefix is checked, not the length, so a typo cannot reach the DO and the
 *  mode is decided in one place. */
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
export function registerAuctions(app: Hono<AppContext>) {
  app.get('/api/gavel/receipts', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const auth = await resolveAuth(c.req.raw, c.env)
    if (!auth) return c.json({ error: 'Sign in to find your bids.' }, 401)
    const result = await auctionStub(c.env).fetch('https://auction/receipts', {
      method: 'POST',
      body: JSON.stringify({ bidder: 'user:' + auth.userId }),
    })
    return c.body(result.body!, result.status as 200, {
      'Content-Type': 'application/json',
    })
  })
  app.all('/api/gavel/:room/:op', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const { room, op } = c.req.param()
    if (
      !['s', 'a'].includes(room[0]) ||
      room[1] !== '-' ||
      !uuid.test(room.slice(2))
    )
      return c.json({ error: 'Invalid auction link.' }, 404)
    const sample = room.startsWith('s-')
    if ((op === 'sample' && !sample) || (op === 'create' && sample))
      return c.json({ error: 'Invalid auction type.' }, 422)
    if (!sample && (op === 'bid' || op === 'close'))
      return c.json({ error: 'Use the signed auction action.' }, 404)
    const read = op === 'view' || op === 'art'
    if (c.req.method !== (read ? 'GET' : 'POST'))
      return c.json({ error: 'Method unavailable.' }, 405)
    // Every write is JSON-only and same-origin. That is what makes the cookie
    // path safe: a form-encoded cross-site POST cannot reach these routes, and
    // the sample actor is derived from a cookie the page never reads.
    if (
      !read &&
      ((c.req.header('Origin') &&
        c.req.header('Origin') !== new URL(c.req.url).origin) ||
        !c.req.header('Content-Type')?.startsWith('application/json'))
    )
      return c.json({ error: 'Invalid request origin or format.' }, 403)
    let actor: Actor = guest
    if (sample) {
      // The raw cookie value is never the actor id; it is hashed, so a leaked
      // id from a response cannot be replayed as a session.
      let key = getCookie(c, 'gavel_session')
      if (!key || !uuid.test(key)) {
        if (op !== 'sample' && op !== 'prepare')
          return c.json(
            {
              error:
                'This sample belongs to a different browser. Start your own sample.',
            },
            404,
          )
        key = crypto.randomUUID()
        setCookie(c, 'gavel_session', key, {
          httpOnly: true,
          secure: new URL(c.req.url).protocol === 'https:',
          sameSite: 'Strict',
          path: '/api/gavel',
          maxAge: 2592000,
        })
      }
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(key),
      )
      actor = {
        id:
          'guest:' +
          Array.from(new Uint8Array(digest), (v) =>
            v.toString(16).padStart(2, '0'),
          ).join(''),
        name: 'You',
        signed: false,
      }
    } else {
      const auth = await resolveAuth(c.req.raw, c.env)
      if (auth)
        actor = {
          id: 'user:' + auth.userId,
          name: String(auth.claims.name || 'Bidder').slice(0, 64),
          email:
            typeof auth.claims.email === 'string'
              ? auth.claims.email
              : undefined,
          signed: true,
        }
      if (!read && op !== 'listing-photo' && !auth)
        return c.json({ error: 'Sign in with DeepSpace to continue.' }, 401)
    }
    let input: Record<string, unknown> = {}
    if (read) input = { lot: c.req.query('lot') }
    else {
      const raw = await c.req.text()
      // Bodies carry at most a query, an amount and an item id. The photo
      // lookup takes a URL, so it gets the wider bound; a bid gets 4 kB.
      if (
        raw.length >
        (['create', 'add', 'listing-photo'].includes(op) ? 24000 : 4000)
      )
        return c.json({ error: 'Request too large.' }, 413)
      try {
        input = JSON.parse(raw)
        if (!input || typeof input !== 'object' || Array.isArray(input))
          throw Error()
      } catch {
        return c.json({ error: 'Invalid auction request.' }, 422)
      }
    }
    const result = await auctionStub(c.env).fetch(
      'https://auction/' + (op === 'art' ? 'art' : 'command'),
      { method: 'POST', body: JSON.stringify({ room, op, actor, input }) },
    )
    return c.body(result.body!, result.status as 200, {
      'Content-Type': result.headers.get('Content-Type') || 'application/json',
    })
  })
}
