export interface Actor { id: string; name: string; email?: string; signed: boolean }
export interface PublicResult { amount: number | null; winner: string | null; mine: boolean; count: number }
export interface Lot {
  id: string; title: string; description: string; myBid: number | null; result: PublicResult | null
  source: string | null; suggestion: string | null; hasArt: boolean
}
export interface Auction {
  id: string; title: string; sample: boolean; owner: boolean; closesAt: number; lots: Lot[]
}
export interface RoomCommand {
  op: string; room: string; actor: Actor; input: Record<string, unknown>
}
export const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
