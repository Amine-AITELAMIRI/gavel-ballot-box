import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BIDDER_SECONDS } from '../constants'
import { Check, Clock3, LockKeyhole, Radio } from 'lucide-react'
import type { Auction, PracticeRole, TimedPractice } from './model'
import { money } from './model'
import { Action, Art, ResultSummary } from './AuctionUI'

import type { ItemCard } from './items'
import { ItemChooser, ItemDetails } from './ItemPreview'

export function PracticeSetup({
  initialRole,
  fromHost,
  links,
  busy,
  start,
}: {
  links: ReactNode
  fromHost: string | null
  initialRole: string | null
  busy: boolean
  start: (
    role: PracticeRole,
    seconds: number,
    item?: string,
    source?: string,
  ) => void
}) {
  const [role, setRole] = useState<PracticeRole | null>(
    initialRole === 'bidder' || initialRole === 'host' ? initialRole : null,
  )
  const [duration, setDuration] = useState('5')
  const [selection, setSelection] = useState<{ card: ItemCard; id?: string }>()
  const [pending, setPending] = useState(false)
  const exhibit = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selection) exhibit.current?.focus()
  }, [selection])
  return (
    <main
      className={
        'g-main journey-welcome practice-welcome ' +
        (role === 'host' ? 'selecting-item' : '')
      }
    >
      <div className="practice-exhibit" ref={exhibit} tabIndex={-1}>
        {role === 'host' ? (
          <div className="host-item-picker">
            <h2>Choose an item to auction</h2>
            <ItemChooser
              item={selection?.card}
              onSelect={(card, id) => setSelection({ card, id })}
              busy={busy}
              pending={pending}
              setPending={setPending}
            />
            {selection && (
              <ItemDetails key={selection.card.title} item={selection.card} />
            )}
          </div>
        ) : (
          <Art mode="welcome" />
        )}
      </div>
      <section className="g-panel practice-body">
        <div className="welcome-intro">
          <p className="g-label">SEALED-BID AUCTIONS</p>
          <h1 className="hero-title">Try a silent auction.</h1>
          <p className="g-copy">
            Practice with simulated bidders. The highest offer wins. No sign-in
            or payment.
          </p>
        </div>
        <div className="practice-setup">
          <fieldset disabled={busy || pending}>
            <legend>Choose your practice role</legend>
            {(['bidder', 'host'] as const).map((option) => (
              <label className="role-option" key={option}>
                <input
                  type="radio"
                  name="practice-role"
                  checked={role === option}
                  onChange={() => setRole(option)}
                />
                <span>
                  <strong>{option === 'bidder' ? 'Bidder' : 'Host'}</strong>
                  <small>
                    {option === 'bidder'
                      ? fromHost
                        ? 'Bid on your host item in a new 10-second round.'
                        : 'Enter to reveal a surprise item. You’ll have 20 seconds to seal your bid.'
                      : 'Choose the item and timer, watch sealed bids arrive, then announce the winner.'}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          {role && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!busy && !pending && (role === 'bidder' || selection))
                  start(
                    role,
                    role === 'host' ? Number(duration) : BIDDER_SECONDS,
                    role === 'host' ? selection?.id : undefined,
                    role === 'bidder' ? fromHost || undefined : undefined,
                  )
              }}
            >
              {role === 'host' && (
                <label className="round-length">
                  Round length (seconds)
                  <input
                    type="number"
                    inputMode="numeric"
                    min="5"
                    max="60"
                    step="1"
                    required
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                  <small>Choose 5–60 seconds.</small>
                </label>
              )}
              {(role === 'bidder' || selection) && (
                <Action
                  type="submit"
                  busy={busy || pending}
                  busyLabel={
                    busy && role === 'bidder' && !fromHost
                      ? 'Finding your surprise item…'
                      : undefined
                  }
                >
                  Start {role} round
                </Action>
              )}
            </form>
          )}
        </div>
        <div className="practice-links">{links}</div>
      </section>
    </main>
  )
}

function RoundClock({
  practice,
  closesAt,
  onTimeUp,
}: {
  practice: TimedPractice
  closesAt: number
  onTimeUp: () => void
}) {
  const [remaining, setRemaining] = useState(
    Math.max(0, closesAt - practice.serverNow),
  )
  // The countdown is anchored to the server's clock and re-based on every view,
  // so a laptop that slept through the round comes back to the true remaining
  // time instead of a locally drifted one. The server rejects a late seal
  // regardless; this only keeps the numbers honest while it runs.
  useEffect(() => {
    const end = performance.now() + Math.max(0, closesAt - practice.serverNow)
    let requested = false
    function tick() {
      const left = Math.max(0, end - performance.now())
      setRemaining(left)
      if (!left && !requested) {
        requested = true
        onTimeUp()
      }
    }
    tick()
    const id = window.setInterval(tick, 100)
    return () => clearInterval(id)
  }, [closesAt, practice.serverNow, onTimeUp])
  return (
    <div className="round-clock">
      <span>
        <Clock3 size={16} aria-hidden="true" /> Time left
      </span>
      <strong role="timer">{Math.ceil(remaining / 1000)}s</strong>
      <progress
        max={practice.duration * 1000}
        value={remaining}
        aria-label="Round time remaining"
      />
    </div>
  )
}

export function PracticeRoom({
  auction,
  practice,
  busy,
  mutate,
  refresh,
}: {
  auction: Auction
  practice: TimedPractice
  busy: boolean
  mutate: (
    op: string,
    params?: Record<string, unknown>,
  ) => Promise<boolean | undefined>
  refresh: () => void
}) {
  const lot = auction.lots[0]
  const result = lot.result
  const host = practice.role === 'host'
  const [amount, setAmount] = useState('')
  const heading = result
    ? host
      ? result.winner + ' wins.'
      : result.mine
        ? 'You won.'
        : lot.myBid === null
          ? 'Time’s up.'
          : 'Another bidder won.'
    : host
      ? practice.awaitingAnnouncement
        ? 'Bidding has ended.'
        : 'Your auction is open.'
      : lot.myBid !== null
        ? 'Your bid is sealed.'
        : 'Place your bid.'
  return (
    <main className="g-main timed-room">
      <Art
        mode={
          result
            ? 'result'
            : host
              ? 'practiceHost'
              : lot.myBid !== null
                ? 'sealed'
                : 'bid'
        }
        auction={auction}
        lot={lot}
      />
      <section className="g-panel">
        <div>
          <p className="g-label">PRACTICE · {host ? 'HOST' : 'BIDDER'}</p>
          <h1 tabIndex={-1}>{heading}</h1>
        </div>
        {result ? (
          <>
            <p className="g-copy">
              {host
                ? 'You announced the winner of ' + lot.title + '.'
                : lot.myBid === null
                  ? 'Time ran out before you sealed an offer. The highest sealed bid wins the item.'
                  : result.mine
                    ? 'Your sealed offer won ' + lot.title + '.'
                    : result.amount === lot.myBid
                      ? 'You matched the winning bid. ' +
                        result.winner +
                        ' reached that amount first.'
                      : result.winner + ' offered more for ' + lot.title + '.'}
            </p>
            <ResultSummary lot={lot} />
            <div className="end-actions">
              <a className="solid-small" href="/?host=1">
                Host a live auction
              </a>
              <a
                className="g-link"
                href={
                  host
                    ? '/?practice=bidder&from=' + encodeURIComponent(auction.id)
                    : '/?practice=host'
                }
              >
                {host ? 'Bid on this item in a new round' : 'Try the host role'}
              </a>
              <a className="g-link" href={'/?practice=' + practice.role}>
                Play this role again
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="g-copy">
              {host
                ? 'Three simulated bidders are bidding on ' +
                  lot.title +
                  '. Only the winner’s amount will be revealed.'
                : lot.myBid !== null
                  ? 'Your offer is saved. Watch the remaining bids come in. The winner appears when time runs out.'
                  : 'Bid alongside three simulated bidders. Highest offer wins when the timer ends.'}
            </p>
            {!practice.awaitingAnnouncement && (
              <RoundClock
                practice={practice}
                closesAt={auction.closesAt}
                onTimeUp={refresh}
              />
            )}
            {!host &&
              (lot.myBid !== null ? (
                <div className="g-receipt" role="status">
                  <span className="g-label">Your private offer</span>
                  <strong>{money(lot.myBid)}</strong>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void mutate('bid', { amount: Number(amount) })
                  }}
                >
                  <label className="g-label" htmlFor="practice-bid">
                    Your bid (USD)
                  </label>
                  <div className="g-amount">
                    <span>$</span>
                    <input
                      id="practice-bid"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={1000000}
                      required
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                  <Action type="submit" busy={busy}>
                    Seal {amount ? money(Number(amount)) + ' ' : ''}bid
                  </Action>
                </form>
              ))}
            <section className="bid-feed" aria-label="Live bid activity">
              <div className="feed-title">
                <Radio size={17} aria-hidden="true" />
                <strong>Bid activity</strong>
                <span>{practice.arrivals.length} sealed</span>
              </div>
              <ol aria-live="polite" aria-relevant="additions">
                {practice.arrivals.length === 0 && (
                  <li className="waiting-bid">
                    Waiting for the first sealed bid…
                  </li>
                )}
                {practice.arrivals.map((name) => (
                  <li key={name}>
                    <LockKeyhole size={15} aria-hidden="true" />
                    <span>{name} sealed a bid</span>
                    <Check size={15} aria-hidden="true" />
                  </li>
                ))}
              </ol>
            </section>
            {host && practice.awaitingAnnouncement && (
              <Action busy={busy} onClick={() => void mutate('announce')}>
                Announce winner
              </Action>
            )}
          </>
        )}
      </section>
    </main>
  )
}
