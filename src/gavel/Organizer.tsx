import { ItemChooser, ItemDetails, ItemPhoto } from './ItemPreview'
import type { ItemCard } from './items'
import { useState, useRef, useEffect, type ReactNode } from 'react'
import {
  Action,
  ItemPicker,
  ResultSummary,
  SealedBox,
  deadline,
} from './AuctionUI'
import type { Auction, Lot } from './model'
import { Copy, Plus, ArrowRight } from 'lucide-react'

const review = import.meta.env.MODE === 'review'
function ManualItemFields() {
  return (
    <>
      <label>
        Item name
        <input
          required
          name="lotTitle"
          maxLength={90}
          placeholder="e.g. Signed landscape print"
        />
      </label>
      <label>
        Item description
        <textarea
          name="description"
          required
          maxLength={480}
          placeholder="What will the winner receive? Include details such as size or condition."
        />
      </label>
    </>
  )
}
export function EmailOptIn({
  label,
  initialEmail,
}: {
  label: string
  initialEmail?: string
}) {
  const [enabled, setEnabled] = useState(Boolean(initialEmail))
  return (
    <div className="email-opt-in">
      <label className="check">
        <input
          name="notify"
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        {label}
      </label>
      {enabled && (
        <label>
          Notification email
          <input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            maxLength={254}
            defaultValue={initialEmail}
          />
        </label>
      )}
    </div>
  )
}
function SharedItemFields({
  room,
  busy,
  children,
  submit,
}: {
  room: string
  busy: boolean
  children?: ReactNode
  submit: string
}) {
  const [selected, setSelected] = useState<{ card: ItemCard; id: string }>()
  const [pending, setPending] = useState(false)
  const [manual, setManual] = useState(false)
  return (
    <>
      <fieldset disabled={busy}>
        <legend>
          {submit === 'Open auction' ? 'Your first item' : 'New item'}
        </legend>
        {manual ? (
          <ManualItemFields />
        ) : (
          <>
            <ItemChooser
              room={room}
              item={selected?.card}
              onSelect={(card, id) => {
                if (id) setSelected({ card, id })
              }}
              pending={pending}
              setPending={setPending}
              busy={busy}
            />
            {selected && (
              <>
                <ItemDetails
                  item={selected.card}
                  room={room}
                  preview={selected.id}
                />
                <input type="hidden" name="item" value={selected.id} />
              </>
            )}
          </>
        )}
        <button
          type="button"
          className="g-link"
          disabled={pending}
          onClick={() => setManual(!manual)}
        >
          {manual ? 'Use the item finder' : 'Enter item details manually'}
        </button>
      </fieldset>
      {children}
      {!manual && !selected && (
        <p className="g-hint">Pick an item above, or enter the details by hand.</p>
      )}
      <button
        type="submit"
        className="g-action"
        disabled={busy || pending || (!manual && !selected)}
      >
        {busy ? 'Saving…' : submit}
      </button>
    </>
  )
}
export function HostSetup({
  signed,
  busy,
  onSignIn,
  onCreate,
}: {
  signed: boolean | null
  busy: boolean
  onSignIn: () => void
  onCreate: (form: FormData) => void
}) {
  const [draftRoom] = useState(() => 'a-' + crypto.randomUUID())
  const [duration, setDuration] = useState('60')
  const [visit, setVisit] = useState(0)
  useEffect(() => {
    const onReturn = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      setVisit((n) => n + 1)
      setDuration('60')
    }
    window.addEventListener('pageshow', onReturn)
    return () => window.removeEventListener('pageshow', onReturn)
  }, [])
  return (
    <main className="host-setup">
      <header className="host-intro">
        <a href="/" className="g-link">
          Back to Gavel
        </a>
        <p className="g-label">HOST AN AUCTION</p>
        <h1 tabIndex={-1}>Set up your auction.</h1>
        <p className="g-copy">
          Choose an item and a deadline. Open the auction to save it and get
          your bidder link.
        </p>
      </header>
      {!signed ? (
        <section className="setup-card">
          <h2>{review ? 'Choose your host profile' : 'Sign in to host'}</h2>
          <p>
            {review
              ? 'For this local test, choose Organizer on the next screen. You can try bidding as Alice or Bob in a private window later.'
              : 'Your account lets you manage items, invite bidders and close bidding early.'}
          </p>
          <Action busy={signed === null} onClick={onSignIn}>
            {review ? 'Choose a local profile' : 'Sign in with Google'}
          </Action>
        </section>
      ) : (
        <form
          key={visit}
          autoComplete="off"
          className="setup-card"
          onSubmit={(e) => {
            e.preventDefault()
            onCreate(new FormData(e.currentTarget))
          }}
        >
          <fieldset>
            <legend>Auction details</legend>
            <label>
              Auction name
              <input
                required
                name="title"
                maxLength={80}
                placeholder="e.g. Studio benefit auction"
              />
            </label>
            <fieldset className="duration">
              <legend>Bidding stays open for</legend>
              <div>
                {[
                  ['60', '1 hour'],
                  ['1440', '1 day'],
                  ['10080', '7 days'],
                  ['custom', 'Custom'],
                ].map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="duration-choice"
                      value={value}
                      checked={duration === value}
                      onChange={() => setDuration(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {duration === 'custom' ? (
              <label>
                Duration in minutes
                <input
                  type="number"
                  name="minutes"
                  min="1"
                  max="10080"
                  required
                  defaultValue="30"
                />
              </label>
            ) : (
              <input type="hidden" name="minutes" value={duration} />
            )}
          </fieldset>
          <SharedItemFields room={draftRoom} busy={busy} submit="Open auction">
            <EmailOptIn label="Email me when items close" />
          </SharedItemFields>
        </form>
      )}
    </main>
  )
}

type Mutation = (
  op: string,
  input?: Record<string, unknown>,
) => Promise<boolean | undefined>
export function OrganizerRoom({
  auction,
  lot,
  busy,
  onSelect,
  onBidderView,
  mutate,
}: {
  auction: Auction
  lot: Lot
  busy: boolean
  onSelect: (id: string) => void
  onBidderView: () => void
  mutate: Mutation
}) {
  const [copied, setCopied] = useState(false),
    [manualCopy, setManualCopy] = useState(false),
    [adding, setAdding] = useState(false),
    [closing, setClosing] = useState('')
  const inviteRef = useRef<HTMLInputElement>(null)
  const invite = location.origin + '/?room=' + auction.id
  const accepting = Date.now() < auction.closesAt
  const open = auction.lots.filter((item) => !item.result).length
  async function copy() {
    try {
      await navigator.clipboard.writeText(invite)
      setCopied(true)
      setManualCopy(false)
    } catch {
      inviteRef.current?.select()
      setManualCopy(true)
    }
  }
  return (
    <main className="desk">
      <header className="desk-head">
        <div>
          <p className="g-label">YOUR HOST DASHBOARD</p>
          <h1 tabIndex={-1}>{auction.title}</h1>
          <p className="g-copy">
            {open
              ? 'Bidding is open until ' + deadline(auction.closesAt) + '.'
              : 'Bidding has ended for all current items.'}
          </p>
        </div>
        <button className="text-button" onClick={onBidderView}>
          Preview bidder page <ArrowRight size={16} />
        </button>
      </header>
      {open > 0 && (
        <section className="invite">
          <div>
            <h2>Invite bidders</h2>
            <p>
              {review
                ? 'Testing on this Mac? Open the link in a private window and choose Alice or Bob to place a bid.'
                : 'Send this link to bidders. They can see the items and sign in to make a private offer.'}
            </p>
          </div>
          <div className="invite-control">
            <label htmlFor="invite-url">Bidder link</label>
            <div>
              <input
                aria-label="Bidder link"
                id="invite-url"
                ref={inviteRef}
                readOnly
                value={invite}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button onClick={copy}>
                <Copy size={16} />
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <small role="status">
              {manualCopy
                ? 'Link selected. Copy it to share.'
                : copied
                  ? 'Bidder link copied.'
                  : ''}
            </small>
          </div>
        </section>
      )}
      <div className="desk-grid">
        <aside className="desk-items">
          <div className="section-line">
            <h2>
              Items <small>{auction.lots.length}</small>
            </h2>
            {accepting && (
              <button
                className="text-button"
                onClick={() => setAdding(!adding)}
              >
                {adding ? (
                  'Cancel'
                ) : (
                  <>
                    <Plus size={16} />
                    Add item
                  </>
                )}
              </button>
            )}
          </div>
          {adding && (
            <form
              className="inline-form"
              onSubmit={async (e) => {
                e.preventDefault()
                const data = new FormData(e.currentTarget)
                if (
                  await mutate('add', {
                    item: data.get('item'),
                    title: data.get('lotTitle'),
                    description: data.get('description'),
                  })
                )
                  setAdding(false)
              }}
            >
              <SharedItemFields
                room={auction.id}
                busy={busy}
                submit="Save item"
              />
            </form>
          )}
          <ItemPicker
            auction={auction}
            selected={lot.id}
            onSelect={(id) => {
              setClosing('')
              onSelect(id)
            }}
          />
        </aside>
        <section
          className="item-detail"
          aria-label="Selected item"
          key={lot.id}
        >
          <p className="g-label">
            {lot.result ? 'CLOSED ITEM' : 'OPEN FOR BIDS'}
          </p>
          {lot.item && (
            <div className="live-item-photo">
              <ItemPhoto item={lot.item} room={auction.id} lot={lot.id} />
            </div>
          )}
          <h2>{lot.title}</h2>
          <p>{lot.description}</p>
          {lot.hasArt && (
            <img
              className="item-image"
              src={'/api/gavel/' + auction.id + '/art?lot=' + lot.id}
              alt="Illustrative placeholder"
            />
          )}
          {lot.result ? (
            <ResultSummary lot={lot} />
          ) : (
            <div className="settlement">
              <SealedBox count={lot.sealedCount ?? 0} />
              <h3>
                {closing === lot.id
                  ? 'Close bidding on this item now?'
                  : 'When bidding ends'}
              </h3>
              {closing === lot.id ? (
                <>
                  <p>
                    This ends bidding on {lot.title} and publishes its result
                    immediately. Other items keep their own status.
                  </p>
                  <div className="button-row">
                    <button
                      className="solid-small"
                      disabled={busy}
                      onClick={async () => {
                        if (await mutate('close')) setClosing('')
                      }}
                    >
                      Close and reveal
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setClosing('')}
                    >
                      Keep bidding open
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    This item closes automatically at the deadline. Close it
                    early to reveal the winner now.
                  </p>
                  <button
                    className="outline-button"
                    onClick={() => setClosing(lot.id)}
                  >
                    Close item early
                  </button>
                </>
              )}
            </div>
          )}
          {!lot.result && !lot.item && (
            <details className="extras">
              <summary>Optional item tools</summary>
              <div className="button-row">
                <button
                  className="outline-button"
                  disabled={busy || lot.hasArt}
                  onClick={() => mutate('illustrate')}
                >
                  Illustrate item
                </button>
              </div>
            </details>
          )}
        </section>
      </div>
    </main>
  )
}
