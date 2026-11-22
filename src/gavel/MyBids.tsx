import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { accessToken } from './api'
import type { BidReceipt } from './model'

export function MyBids({
  onSignIn,
  requested,
}: {
  onSignIn: () => void
  requested: boolean
}) {
  const [receipts, setReceipts] = useState<BidReceipt[]>([])
  const [status, setStatus] = useState<'loading' | 'guest' | 'ready' | 'error'>(
    'loading',
  )
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    async function read() {
      const token = await accessToken()
      if (controller.signal.aborted) return
      if (!token) {
        setStatus('guest')
        return
      }
      const response = await fetch('/api/gavel/receipts', {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store',
        signal: controller.signal,
      })
      if (response.status === 401) {
        setStatus('guest')
        return
      }
      if (!response.ok) throw Error()
      const items: BidReceipt[] = await response.json()
      if (!controller.signal.aborted) {
        setReceipts(items)
        setStatus('ready')
      }
    }
    read().catch(() => {
      if (!controller.signal.aborted) setStatus('error')
    })
    return () => controller.abort()
  }, [retry])
  if (status === 'loading' && requested)
    return <p role="status">Finding your bids…</p>
  if (status === 'guest')
    return (
      <button className="g-link receipt-link" onClick={onSignIn}>
        {requested
          ? 'Sign in with your bidder profile to see your receipts'
          : 'Already bid? Find your receipt'}
      </button>
    )
  if (status === 'error')
    return (
      <button
        className="g-link receipt-link"
        onClick={() => {
          setStatus('loading')
          setRetry(retry + 1)
        }}
      >
        Couldn’t load your bids. Try again
      </button>
    )
  if (status !== 'ready' || (!receipts.length && !requested)) return null
  return (
    <section className="my-bids" aria-label="Your bids">
      {!requested && <h2>Your bids</h2>}
      {!receipts.length && (
        <p>
          You haven’t bid on an item with this profile yet. Open a bidder
          invitation to get started.
        </p>
      )}
      {(requested ? receipts : receipts.slice(0, 1)).map((entry) => (
        <a
          href={
            '/?' + new URLSearchParams({ room: entry.room, item: entry.lot })
          }
          key={entry.lot}
        >
          <span>
            <strong>Return to {entry.auctionTitle}</strong>
            <small>
              {entry.itemTitle} · {entry.closed ? 'See result' : 'View receipt'}
            </small>
          </span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      ))}
      {!requested && receipts.length > 1 && (
        <a className="all-receipts" href="/?receipts=1">
          See all your bids ({receipts.length})
        </a>
      )}
    </section>
  )
}
