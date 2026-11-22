import type { ReactNode } from 'react'
import { samplePrint } from './items'
import { ItemPhoto } from './ItemPreview'
import { LockKeyhole } from 'lucide-react'
import { money, type Auction, type Lot } from './model'
export function Action({
  children,
  busy = false,
  busyLabel = 'Working…',
  type = 'button',
  onClick,
}: {
  children: ReactNode
  busy?: boolean
  busyLabel?: string
  type?: 'button' | 'submit'
  onClick?: () => void
}) {
  return (
    <button className="g-action" type={type} onClick={onClick} disabled={busy}>
      <span>{busy ? busyLabel : children}</span>
      <img src="/art/arrow.svg" width="20" height="20" alt="" />
    </button>
  )
}
export function Art({
  mode,
  lot,
  auction,
}: {
  mode: string
  lot?: Lot
  auction?: Auction
}) {
  if (
    auction?.practice &&
    (auction.practice.role === 'bidder' || mode === 'practiceHost')
  ) {
    const item = auction.practice.item ?? samplePrint
    return (
      <figure className="g-art practice-product">
        <div className="chosen-photo">
          <ItemPhoto item={item} room={auction.id} />
        </div>
        <figcaption>
          <h2>{item.title}</h2>
          <p>{item.description}</p>
        </figcaption>
      </figure>
    )
  }
  if (lot?.item && auction)
    return (
      <figure className="g-art shared-product">
        <div className="chosen-photo">
          <ItemPhoto item={lot.item} room={auction.id} lot={lot.id} />
        </div>
      </figure>
    )
  const isPrint = mode === 'bid' && auction?.sample
  const custom = mode === 'bid' && lot?.hasArt
  const name = isPrint
    ? 'ridge'
    : mode === 'sealed' || mode === 'practiceHost'
      ? 'deposited'
      : mode === 'result'
        ? 'reveal'
        : 'ballot'
  const top = isPrint
    ? 'LOT 01  /  EDITION OF 25'
    : custom
      ? 'LOT ART  /  ILLUSTRATION'
      : 'SEALED BIDS'
  return (
    <figure
      className={'g-art ' + (isPrint ? 'has-print' : '')}
      aria-label={
        isPrint
          ? 'Ridge study, two-color landscape print'
          : custom
            ? 'Generated lot illustration'
            : 'Green bidding slip and a charcoal ballot box'
      }
    >
      <figcaption className="g-legend">{top}</figcaption>
      <div className={'g-object ' + (custom ? 'custom' : '')} key={name}>
        <img
          className={'object-' + name}
          src={
            custom
              ? '/api/gavel/' + auction?.id + '/art?lot=' + lot?.id
              : '/art/' + name + '.svg'
          }
          alt={custom ? 'Illustrative placeholder' : ''}
        />
      </div>
      <span className="g-legend">
        {mode === 'sealed' || mode === 'practiceHost'
          ? 'BID SEALED'
          : mode === 'result'
            ? 'LOT CLOSED'
            : custom
              ? 'GENERATED PLACEHOLDER'
              : auction?.sample === false
                ? 'AUCTION LOT'
                : auction?.sample
                  ? 'PRACTICE AUCTION'
                  : 'GAVEL'}
      </span>
    </figure>
  )
}

export function deadline(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(timestamp)
}
export function ItemPicker({
  auction,
  selected,
  onSelect,
}: {
  auction: Auction
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <nav aria-label="Auction items" className="item-list">
      {auction.lots.map((item, index) => (
        <button
          key={item.id}
          type="button"
          aria-current={selected === item.id ? 'true' : undefined}
          onClick={() => onSelect(item.id)}
        >
          <span className="g-label">{String(index + 1).padStart(2, '0')}</span>
          <span>{item.title}</span>
          <small>{item.result ? 'Closed' : 'Open'}</small>
        </button>
      ))}
    </nav>
  )
}
export function ResultSummary({ lot }: { lot: Lot }) {
  const result = lot.result
  if (!result) return null
  return (
    <dl className="outcome">
      <div>
        <dt>Winning bid</dt>
        <dd>{result.amount === null ? 'No bids' : money(result.amount)}</dd>
      </div>
      {result.count > 0 && (
        <div>
          <dt>Winner</dt>
          <dd>{result.mine ? 'You' : result.winner}</dd>
        </div>
      )}
      <div>
        <dt>Bidders</dt>
        <dd>{result.count}</dd>
      </div>
      {lot.myBid !== null && !result.mine && (
        <div>
          <dt>Your bid · private</dt>
          <dd>{money(lot.myBid)}</dd>
        </div>
      )}
    </dl>
  )
}

export function SealedBox({ count }: { count: number }) {
  return (
    <div className="sealed-box">
      <LockKeyhole size={24} aria-hidden="true" />
      <div>
        <strong>
          {count === 0
            ? 'Waiting for the first bid'
            : count + (count === 1 ? ' sealed bid' : ' sealed bids')}
        </strong>
        <p>
          {count
            ? 'The amounts stay hidden until bidding closes.'
            : 'New bids appear here as a count. Their amounts stay private.'}
        </p>
      </div>
    </div>
  )
}
