import type { ItemCard } from './items'
import { AuctionStore, Problem } from './store'

export interface SharedPreview {
  id: string
  owner: string
  expires: number
  card: ItemCard
}

// The browser carries the selected listing until the host opens the auction.
// Only the signing key survives a Worker restart.
export class SharedPreviews {
  constructor(private store: AuctionStore) {}

  private key() {
    const row = this.store.one('SELECT secret FROM preview_key WHERE id=1')
    const bytes = row
      ? Uint8Array.from(atob(String(row.secret)), (c) => c.charCodeAt(0))
      : crypto.getRandomValues(new Uint8Array(32))
    if (!row)
      this.store.rows(
        'INSERT INTO preview_key VALUES(1,?)',
        btoa(String.fromCharCode(...bytes)),
      )
    return crypto.subtle.importKey(
      'raw',
      bytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
  }
  async issue(owner: string, card: ItemCard) {
    const payload = JSON.stringify({
      id: crypto.randomUUID(),
      owner,
      expires: Date.now() + 86400000,
      card,
    } satisfies SharedPreview)
    const mac = await crypto.subtle.sign(
      'HMAC',
      await this.key(),
      new TextEncoder().encode(payload),
    )
    const sig = btoa(String.fromCharCode(...new Uint8Array(mac)))
    return { id: 'preview.' + sig + '.' + payload, card }
  }
  async read(token: string, owner: string): Promise<SharedPreview> {
    const invalid = new Problem(
      422,
      'Choose the item again. This preview is no longer valid.',
    )
    const match = /^preview\.([A-Za-z0-9+/]{43}=)\.(.+)$/s.exec(token)
    if (!match) throw invalid
    const sig = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0))
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await this.key(),
        sig,
        new TextEncoder().encode(match[2]),
      ))
    )
      throw invalid
    const preview: SharedPreview = JSON.parse(match[2])
    if (preview.owner !== owner || preview.expires <= Date.now()) throw invalid
    return preview
  }
}
