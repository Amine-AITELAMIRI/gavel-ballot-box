import type { CronTask } from 'deepspace/worker'
import type { Env } from '../worker'
import { auctionStub } from './gavel/room'
export const tasks: CronTask[] = [
  { name: 'settle-auctions', intervalMinutes: 1 },
]
export async function runTask(name: string, env: Env) {
  if (name !== 'settle-auctions') return
  const res = await auctionStub(env).fetch('https://auction/tick', {
    method: 'POST',
  })
  if (!res.ok) throw Error('Auction settlement sweep failed.')
}
