import type { ItemCard } from './items'
export interface Actor {
  id: string
  name: string
  email?: string
  signed: boolean
}
export interface PublicResult {
  amount: number | null
  winner: string | null
  mine: boolean
  count: number
}
/** The only payload the browser ever receives for a lot. Privacy is expressed
 *  in the type: another bidder's `amount` has no field here, so a view cannot
 *  leak it by accident — `myBid` is the caller's own, `sealedCount` is a count,
 *  and every amount arrives at once through `result` at close. */
export interface Lot {
  item?: ItemCard
  myNotificationEmail?: string
  id: string
  title: string
  description: string
  sealedCount?: number
  myBid: number | null
  result: PublicResult | null
  source: string | null
  suggestion: string | null
  hasArt: boolean
}
export type PracticeRole = 'bidder' | 'host'
export interface TimedPractice {
  item?: ItemCard
  role: PracticeRole
  serverNow: number
  duration: number
  awaitingAnnouncement: boolean
  arrivals: string[]
}
export interface Auction {
  practice?: TimedPractice
  id: string
  title: string
  sample: boolean
  owner: boolean
  closesAt: number
  lots: Lot[]
}
export interface RoomCommand {
  op: string
  room: string
  actor: Actor
  input: Record<string, unknown>
}
export const money = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)

export interface BidReceipt {
  room: string
  auctionTitle: string
  lot: string
  itemTitle: string
  closed: boolean
}
