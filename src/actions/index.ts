import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { auctionStub } from '../gavel/room'
import { resolveAuth } from '../server/http-routes'

// The actor always comes from DeepSpace's verified bearer token. Both action
// names call the same transactional operations as the solo demonstration.
function auctionAction(op: 'bid' | 'close'): ActionHandler<Env> {
  return async ({ params, env, callerJwt }) => {
    if (
      typeof params.room !== 'string' ||
      !/^a-[a-f0-9-]{36}$/.test(params.room)
    )
      return { success: false, error: 'Invalid auction.' }
    const auth = await resolveAuth(
      new Request('https://internal', {
        headers: { Authorization: 'Bearer ' + callerJwt },
      }),
      env,
    )
    if (!auth) return { success: false, error: 'Sign in to continue.' }
    const actor = {
      id: 'user:' + auth.userId,
      name: String(auth.claims.name || 'Bidder').slice(0, 64),
      email:
        typeof auth.claims.email === 'string' ? auth.claims.email : undefined,
      signed: true,
    }
    const response = await auctionStub(env).fetch('https://auction/command', {
      method: 'POST',
      body: JSON.stringify({
        op,
        actor,
        room: params.room,
        input: {
          lot: params.lot,
          amount: params.amount,
          notify: params.notify === true,
          email: params.email,
        },
      }),
    })
    if (!response.ok) {
      const failure = await response.json<{ error: string }>()
      return { success: false, error: failure.error }
    }
    return { success: true, data: await response.json() }
  }
}
export const actions: Record<string, ActionHandler<Env>> = {
  placeBid: auctionAction('bid'),
  closeLot: auctionAction('close'),
}
