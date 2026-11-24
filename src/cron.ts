import type { CronTask } from 'deepspace/worker'
import type { Env } from '../worker'
import { auctionStub } from './gavel/room'
/** One minute is the slack a sealed deadline is allowed before the lot settles
 *  on its own. Settlement is idempotent, so a request that crosses the deadline
 *  first just makes this tick a no-op (see `AuctionStore.settle`). */
export const tasks: CronTask[] = [
  { name: 'settle-auctions', intervalMinutes: 1 },
]
export async function runTask(name: string, env: Env) {
  if (name !== 'settle-auctions') return
  const res = await auctionStub(env).fetch('https://auction/tick', {
    method: 'POST',
  })
  // Throwing surfaces the tick as failed instead of silently leaving lots open.
  if (!res.ok) throw Error('Auction settlement sweep failed.')
}
