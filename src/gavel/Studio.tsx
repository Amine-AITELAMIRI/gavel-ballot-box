import {
  lazy,
  useCallback,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { command, accessToken } from './api'
import { money, type Auction, type PracticeRole } from './model'
import {
  Action,
  Art,
  ItemPicker,
  SealedBox,
  ResultSummary,
  deadline,
} from './AuctionUI'
import { EmailOptIn, HostSetup, OrganizerRoom } from './Organizer'
import { PracticeSetup, PracticeRoom } from './TimedPractice'
import { MyBids } from './MyBids'
import './studio.css'
const Presence = lazy(() => import('./Presence'))

function signIn(returnTo = location.pathname + location.search) {
  sessionStorage.setItem('gavel-return', returnTo)
  location.assign('/api/auth/social-redirect?provider=google')
}
export default function Studio() {
  const [query, setQuery] = useSearchParams()
  const room = query.get('room') || '',
    host = query.has('host')
  const [auction, setAuction] = useState<Auction | null>(null),
    [edit, setEdit] = useState(false),
    [bidderView, setBidderView] = useState(false)
  const [amount, setAmount] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [lastHost, setLastHost] = useState('')
  const [signed, setSigned] = useState<boolean | null>(null)
  const active = useRef(false),
    version = useRef(0),
    page = useRef<HTMLDivElement>(null),
    alert = useRef<HTMLParagraphElement>(null),
    createKey = useRef('')
  const current = auction?.id === room ? auction : null
  const lot =
    current?.lots.find((l) => l.id === query.get('item')) || current?.lots[0]
  const manage = Boolean(current?.owner && !current.sample && !bidderView)
  const activeHostRoom =
    current?.owner && !current.sample
      ? current.lots.some((l) => !l.result) && current.closesAt > Date.now()
      : undefined
  useEffect(() => {
    let active = true
    try {
      const key = 'gavel-host-room'
      const saved = sessionStorage.getItem(key)
      if (activeHostRoom && room) sessionStorage.setItem(key, room)
      else if (activeHostRoom === false && saved === room)
        sessionStorage.removeItem(key)
      if (!room && !host) {
        setLastHost('')
        if (saved)
          void command(saved, 'view')
            .then((auction) => {
              if (!active) return
              if (
                auction.owner &&
                !auction.sample &&
                auction.closesAt > Date.now() &&
                auction.lots.some((l) => !l.result)
              )
                setLastHost(saved)
              else if (sessionStorage.getItem(key) === saved)
                sessionStorage.removeItem(key)
            })
            .catch(() => {})
      }
    } catch {
      /* Storage can be disabled in private browsing. */
    }
    return () => {
      active = false
    }
  }, [activeHostRoom, room, host])
  const preview = Boolean(current?.owner && !current.sample && bidderView)
  const practiceHost =
    current?.sample && lot?.myBid != null && query.get('view') === 'host'
  const mode = host
    ? 'host'
    : !room
      ? query.has('receipts')
        ? 'receipts'
        : 'welcome'
      : !current
        ? 'loading'
        : manage
          ? 'manage'
          : lot?.result
            ? 'result'
            : practiceHost
              ? 'practiceHost'
              : !preview && lot?.myBid != null && !edit
                ? 'sealed'
                : 'bid'
  useEffect(() => {
    let live = true
    if (host || room.startsWith('a-'))
      accessToken()
        .then((t) => {
          if (live) setSigned(Boolean(t))
        })
        .catch(() => {
          if (live) setSigned(false)
        })
    return () => {
      live = false
    }
  }, [room, host])
  const timed = Boolean(
    current?.practice && !lot?.result && !current.practice.awaitingAnnouncement,
  )
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((key) => key + 1), [])
  useEffect(() => {
    let live = true
    let pending = false
    async function read() {
      if (!room || active.current || pending) return
      pending = true
      const v = version.current
      try {
        const data = await command(room, 'view')
        if (live && v === version.current) setAuction(data)
      } catch (e) {
        if (live && v === version.current) setError((e as Error).message)
      } finally {
        pending = false
      }
    }
    void read()
    const timer = room
      ? window.setInterval(
          () => {
            if (document.visibilityState === 'visible') void read()
          },
          timed ? 500 : 5000,
        )
      : undefined
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [room, timed, refreshKey])
  useEffect(() => {
    if (mode === 'welcome' || mode === 'loading') return
    page.current?.querySelector('h1')?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [mode, room, current?.practice?.awaitingAnnouncement])
  useEffect(() => {
    if (error) alert.current?.focus()
  }, [error])
  async function work(fn: () => Promise<void>) {
    if (active.current) return
    active.current = true
    version.current++
    setBusy(true)
    setError('')
    try {
      await fn()
      return true
    } catch (e) {
      setError((e as Error).message || 'Please try again.')
      return false
    } finally {
      version.current++
      active.current = false
      setBusy(false)
    }
  }
  function go(params: Record<string, string>) {
    setError('')
    setEdit(false)
    setBidderView(false)
    setQuery(params)
  }
  function create(
    sample: boolean,
    form?: FormData,
    role: PracticeRole = 'bidder',
    seconds = 10,
    item?: string,
    source?: string,
  ) {
    void work(async () => {
      const prefix = sample ? 's-' : 'a-'
      if (!createKey.current.startsWith(prefix))
        createKey.current = prefix + crypto.randomUUID()
      const data = await command(
        createKey.current,
        sample ? 'sample' : 'create',
        form
          ? {
              title: form.get('title'),
              minutes: Number(form.get('minutes')),
              lotTitle: form.get('lotTitle'),
              description: form.get('description'),
              item: form.get('item'),
              notify: form.has('notify'),
              email: form.get('email'),
            }
          : { role, seconds, item, source },
      )
      createKey.current = ''
      setAuction(data)
      setAmount('')
      go({ room: data.id })
    })
  }
  function mutate(op: string, params: Record<string, unknown> = {}) {
    return work(async () => {
      const data = await command(room, op, { ...params, lot: lot?.id })
      setAuction(data)
      setEdit(false)
      if (op === 'add')
        setQuery(
          { room, item: data.lots[data.lots.length - 1].id },
          { replace: true },
        )
    })
  }
  function bid(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    mutate('bid', {
      amount: Number(amount),
      notify: form.has('notify'),
      email: form.get('email'),
    })
  }
  const sample = Boolean(current?.sample)
  const shared = current && !current.sample
  const status =
    mode === 'sealed'
      ? 'Bid saved'
      : mode === 'result'
        ? 'Bidding closed'
        : 'Bidding open'
  const practiceStep = mode === 'result' ? 2 : mode === 'practiceHost' ? 1 : 0
  function selectItem(id: string) {
    setQuery({ room, item: id }, { replace: true })
    setEdit(false)
    setAmount('')
    setError('')
  }
  const role = sample
    ? 'Practice auction'
    : mode === 'manage'
      ? 'Host dashboard'
      : host
        ? 'Host setup'
        : shared
          ? preview
            ? 'Bidder preview'
            : 'Bidder view'
          : 'Silent auctions'
  return (
    <div className="g-page" ref={page}>
      <header className="g-header">
        <a className="g-brand" href="/" aria-label="Gavel home">
          <img src="/art/mark.svg" width="28" height="28" alt="" />
          Gavel
        </a>
        <span className="g-context">{role}</span>
      </header>
      {current?.practice && lot ? (
        <PracticeRoom
          key={current.id}
          auction={current}
          practice={current.practice}
          busy={busy}
          mutate={mutate}
          refresh={refresh}
        />
      ) : mode === 'welcome' && !query.has('practice') ? (
        <main className="g-main journey-welcome">
          <Art mode="welcome" />
          <section className="g-panel">
            <h1 className="hero-title">Silent auctions</h1>
            <p className="g-copy">
              Each bidder makes a private offer. The highest bid wins when the
              auction closes.
            </p>
            <div className="auction-modes">
              <a href="/?practice=1">
                <strong>Try a practice auction</strong>
                <span>
                  Play host or bidder in a timed round with simulated bidders.
                  No sign-in.
                </span>
              </a>
              <a href="/?host=1">
                <strong>Host a live auction</strong>
                <span>
                  Sign in, choose an item, and invite people to bid with a
                  shared link.
                </span>
              </a>
            </div>
            <div className="practice-links">
              <MyBids
                requested={false}
                onSignIn={() => signIn('/?receipts=1')}
              />
              {lastHost && (
                <a className="g-link" href={'/?room=' + lastHost}>
                  Return to your last host dashboard
                </a>
              )}
            </div>
          </section>
        </main>
      ) : mode === 'welcome' ? (
        <PracticeSetup
          key={query.get('from') || 'practice'}
          fromHost={query.get('from')}
          initialRole={query.get('practice')}
          busy={busy}
          start={(role, seconds, item, source) =>
            create(true, undefined, role, seconds, item, source)
          }
          links={
            <a href="/" className="g-link">
              Back to auction choices
            </a>
          }
        />
      ) : mode === 'receipts' ? (
        <main className="receipts-page">
          <a className="g-link" href="/">
            Back to Gavel
          </a>
          <h1 tabIndex={-1}>Your bids</h1>
          <MyBids requested onSignIn={() => signIn('/?receipts=1')} />
        </main>
      ) : mode === 'host' ? (
        <HostSetup
          signed={signed}
          busy={busy}
          onSignIn={() => signIn()}
          onCreate={(form) => create(false, form)}
        />
      ) : mode === 'manage' && current && lot ? (
        <OrganizerRoom
          key={room}
          auction={current}
          lot={lot}
          busy={busy}
          mutate={mutate}
          onSelect={selectItem}
          onBidderView={() => {
            setBidderView(true)
            setEdit(false)
            setError('')
          }}
        />
      ) : (
        <>
          {shared && lot && (
            <div className="room-nav">
              <div>
                <strong>{current.title}</strong>
                <p>
                  {lot.result
                    ? 'Bidding closed for this item'
                    : 'Bidding closes ' + deadline(current.closesAt)}
                </p>
              </div>
              {current.owner && (
                <button
                  className="outline-button"
                  onClick={() => setBidderView(false)}
                >
                  Back to host dashboard
                </button>
              )}
              {current.lots.length > 1 && (
                <ItemPicker
                  auction={current}
                  selected={lot.id}
                  onSelect={selectItem}
                />
              )}
            </div>
          )}
          {sample && (
            <a className="legacy-round g-link" href="/">
              Try the new timed practice · Choose a role
            </a>
          )}
          {sample && (
            <ol
              className="practice-progress"
              aria-label="Practice auction progress"
            >
              {['Place a bid', 'Host view', 'See the result'].map(
                (label, i) => (
                  <li
                    key={label}
                    aria-current={practiceStep === i ? 'step' : undefined}
                  >
                    <span>{i + 1}</span>
                    {label}
                  </li>
                ),
              )}
            </ol>
          )}
          <main className={'g-main journey-' + mode}>
            <Art mode={mode} auction={current || undefined} lot={lot} />
            <section className="g-panel">
              {mode === 'loading' ? (
                <>
                  <h1>
                    {error ? 'Room unavailable' : 'Opening your auction…'}
                  </h1>
                  {error && (
                    <a className="g-link" href="/">
                      Back to Gavel
                    </a>
                  )}
                </>
              ) : (
                lot &&
                current && (
                  <>
                    <div>
                      <p className="g-label">
                        {mode === 'practiceHost'
                          ? 'PRACTICE HOST'
                          : sample
                            ? 'PRACTICE AUCTION'
                            : current.title}{' '}
                        /{' '}
                        {mode === 'bid'
                          ? 'ITEM ' +
                            String(current.lots.indexOf(lot) + 1).padStart(
                              2,
                              '0',
                            )
                          : status}
                      </p>
                      <h1 tabIndex={-1}>
                        {mode === 'bid'
                          ? lot.title
                          : mode === 'practiceHost'
                            ? 'Inside the host’s bid box.'
                            : mode === 'sealed'
                              ? 'Your bid is sealed.'
                              : lot.result?.mine
                                ? 'You won.'
                                : lot.result?.count
                                  ? lot.myBid !== null
                                    ? 'Another bidder won.'
                                    : 'Winning bid revealed.'
                                  : 'This item closed without bids.'}
                      </h1>
                    </div>
                    {mode === 'bid' && (
                      <>
                        <p className="g-copy">{lot.description}</p>
                        <div className="guidance">
                          <strong>
                            {edit
                              ? 'Raise your offer'
                              : sample
                                ? 'Try being the bidder'
                                : 'How to bid'}
                          </strong>
                          <p>
                            {edit
                              ? 'Your current offer is ' +
                                money(lot.myBid!) +
                                '. Enter a higher amount to replace it.'
                              : sample
                                ? 'A simulated bidder has already made an offer. Choose how much you’d pay for the print. Next, you’ll see what the host sees.'
                                : 'Make a private offer in whole dollars. You can raise it before bidding closes. The highest offer wins.'}
                          </p>
                          <p className="tie-rule">
                            If bids tie, the first to reach that amount wins.
                          </p>
                        </div>
                        {preview ? (
                          <p className="preview-note">
                            Read-only preview · Invited bidders can place an
                            offer here.
                          </p>
                        ) : shared && !signed ? (
                          <div className="entry-paths">
                            <Action
                              busy={signed === null}
                              onClick={() => signIn()}
                            >
                              {import.meta.env.MODE === 'review'
                                ? 'Choose a local bidder'
                                : 'Sign in to bid'}
                            </Action>
                            {import.meta.env.MODE === 'review' && (
                              <p>
                                Choose Alice or Bob on the next screen to try
                                bidding in this local auction.
                              </p>
                            )}
                          </div>
                        ) : (
                          <form onSubmit={bid}>
                            <label className="g-label" htmlFor="bid">
                              Your bid (USD)
                            </label>
                            <div className="g-amount">
                              <span>$</span>
                              <input
                                id="bid"
                                type="number"
                                inputMode="numeric"
                                required
                                min={(lot.myBid ?? 0) + 1}
                                max="1000000"
                                step="1"
                                value={amount}
                                placeholder="0"
                                onChange={(e) => setAmount(e.target.value)}
                              />
                            </div>
                            {shared && (
                              <EmailOptIn
                                key={lot.id}
                                label="Email me if I win"
                                initialEmail={lot.myNotificationEmail}
                              />
                            )}
                            <Action busy={busy} type="submit">
                              {edit ? 'Update' : 'Place'}{' '}
                              {amount ? money(Number(amount)) + ' ' : ''}bid
                            </Action>
                            {edit && (
                              <button
                                className="g-link"
                                type="button"
                                onClick={() => setEdit(false)}
                              >
                                Keep existing bid
                              </button>
                            )}
                          </form>
                        )}
                      </>
                    )}
                    {mode === 'sealed' && (
                      <>
                        <div className="g-receipt">
                          <span className="g-label">
                            YOUR PRIVATE OFFER · {lot.title}
                          </span>
                          <strong>{money(lot.myBid!)}</strong>
                        </div>
                        <div className="guidance">
                          <strong>
                            {sample
                              ? 'Now try being the host'
                              : 'What happens next'}
                          </strong>
                          <p>
                            {sample
                              ? 'Your receipt shows your offer. Open the host’s view to see what the organizer can see.'
                              : 'You can leave now. Reopen your invitation or choose Your bids on the Gavel homepage with this account to see the result.'}
                          </p>
                        </div>
                        {sample && (
                          <Action
                            onClick={() => setQuery({ room, view: 'host' })}
                          >
                            See the host’s view
                          </Action>
                        )}
                        {shared && (
                          <a href="/?receipts=1" className="outline-button">
                            Go to your bids
                          </a>
                        )}
                        <button
                          className={sample ? 'g-link' : 'outline-button'}
                          onClick={() => {
                            setEdit(true)
                            setAmount(String(lot.myBid! + 1))
                          }}
                        >
                          Raise your bid
                        </button>
                      </>
                    )}
                    {mode === 'practiceHost' && (
                      <>
                        <p className="g-copy">
                          You’re the practice host for {lot.title}. Both bidders
                          have placed their offers.
                        </p>
                        <SealedBox count={lot.sealedCount ?? 0} />
                        <Action busy={busy} onClick={() => mutate('close')}>
                          Close bidding and reveal winner
                        </Action>
                        <button
                          className="g-link"
                          onClick={() => setQuery({ room })}
                        >
                          Back to my receipt
                        </button>
                      </>
                    )}
                    {mode === 'result' && lot.result && (
                      <>
                        <p className="g-copy">
                          {lot.myBid !== null &&
                          !lot.result.mine &&
                          lot.result.amount === lot.myBid
                            ? 'You matched the winning bid. ' +
                              lot.result.winner +
                              ' reached ' +
                              money(lot.myBid) +
                              ' first.'
                            : lot.result.count
                              ? 'Bidding has ended for ' +
                                lot.title +
                                '. The highest offer wins. Losing amounts stay private.'
                              : 'Bidding ended before anyone made an offer.'}
                        </p>
                        <ResultSummary lot={lot} />
                        {shared && (
                          <div className="guidance">
                            <strong>{lot.title}</strong>
                            <p>{lot.description}</p>
                          </div>
                        )}
                        {shared && !current.owner && lot.myBid !== null && (
                          <a href="/?receipts=1" className="g-link">
                            Go to your bids
                          </a>
                        )}
                        {sample && (
                          <div className="end-actions">
                            <a className="solid-small" href="/?host=1">
                              Host your own auction
                            </a>
                            <button
                              className="g-link"
                              disabled={busy}
                              onClick={() => go({ practice: 'bidder' })}
                            >
                              Try another practice round
                            </button>
                          </div>
                        )}
                      </>
                    )}
                    {shared && (
                      <Suspense fallback={null}>
                        <Presence lot={lot.id} />
                      </Suspense>
                    )}
                  </>
                )
              )}
            </section>
          </main>
        </>
      )}
      {error && (
        <p ref={alert} role="alert" tabIndex={-1} className="g-error">
          {error}
        </p>
      )}
    </div>
  )
}
