export interface SourcePrice {
  status: 'asking' | 'sold' | 'unavailable' | 'unknown'
  amount?: number
  indexed: boolean
  checkedAt: number
}
export interface ItemCard {
  sourcePrice?: SourcePrice
  title: string
  description: string
  image?: string
  source?: string
  photoCredit?: string
  example: boolean
  practicePrice?: number
}
export const samplePrint: ItemCard = {
  title: 'Ridge study, no. 4',
  description: 'Two-color landscape print on cotton paper. Edition of 25.',
  image: '/art/ridge.svg',
  example: true,
  practicePrice: 60,
}
export type Rarity = 'any' | 'everyday' | 'collectible'
