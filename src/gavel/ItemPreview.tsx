import { useEffect, useState } from 'react'
import { Shuffle } from 'lucide-react'
import { getItemPreview, getListingPhotos } from './api'
import type { ItemCard, Rarity } from './items'

type PhotoProps = {
  item: ItemCard
  room?: string
  lot?: string
  preview?: string
}

export function ItemPhoto(props: PhotoProps) {
  return (
    <ListingPhoto
      key={JSON.stringify([
        props.item.source,
        props.item.image,
        props.item.title,
        props.room,
        props.lot,
      ])}
      {...props}
    />
  )
}
function ListingPhoto({ item, room, lot, preview }: PhotoProps) {
  const [failed, setFailed] = useState<string[]>([])
  const [alternates, setAlternates] = useState<string[] | null>(null)
  const url = [item.image, ...(alternates || [])].find(
    (url) => url && !failed.includes(url),
  )
  const source = item.source
  const lookup = !url && !item.example && !!source && alternates === null
  useEffect(() => {
    if (!lookup || !source) return
    let active = true
    getListingPhotos(source, room, lot, preview)
      .then((urls) => {
        if (active) setAlternates(urls)
      })
      .catch(() => {
        if (active) setAlternates([])
      })
    return () => {
      active = false
    }
  }, [lookup, source, room, lot, preview])
  if (url)
    return (
      <img
        src={url}
        alt={item.title}
        referrerPolicy="no-referrer"
        onError={() => setFailed((previous) => [...previous, url])}
      />
    )
  if (lookup)
    return (
      <span className="photo-missing" role="status">
        Loading listing photo…
      </span>
    )
  return (
    <span className="photo-missing photo-empty">
      {source ? (
        <a href={source} target="_blank" rel="noreferrer">
          View photo on original listing
        </a>
      ) : (
        'Photo unavailable'
      )}
    </span>
  )
}

export function ItemDetails({ item, room, lot, preview }: PhotoProps) {
  return (
    <article className="item-card" aria-label="Item preview">
      <div className="item-overview">
        <div className="item-photo">
          <ItemPhoto item={item} room={room} lot={lot} preview={preview} />
        </div>
        <h3>{item.title}</h3>
      </div>
      <p>{item.description}</p>
    </article>
  )
}

export function ItemChooser({
  room,
  item,
  onSelect,
  busy,
  pending,
  setPending,
}: {
  room?: string
  item?: ItemCard
  onSelect: (card: ItemCard, id?: string) => void
  busy: boolean
  pending: boolean
  setPending: (b: boolean) => void
}) {
  const [custom, setCustom] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [rarity, setRarity] = useState<Rarity>('any')
  const [error, setError] = useState('')
  async function choose(surprise: boolean) {
    setPending(true)
    setError('')
    try {
      const result = await getItemPreview(room ?? 's-' + crypto.randomUUID(), {
        prompt: surprise ? '' : prompt,
        rarity,
        previous: item?.title,
      })
      onSelect(result.card, result.id)
      setCustom(false)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not prepare the item. Try again.',
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="item-chooser" aria-label="Choose an auction item">
      <div className="item-actions">
        <button
          type="button"
          disabled={busy || pending}
          onClick={() => void choose(true)}
        >
          <Shuffle size={15} aria-hidden="true" />
          Surprise me
        </button>
        <button
          type="button"
          disabled={busy || pending}
          aria-expanded={custom}
          onClick={() => {
            setCustom(!custom)
            setError('')
          }}
        >
          {custom ? 'Cancel' : 'Choose my own item'}
        </button>
      </div>
      {custom && (
        <div className="item-search">
          <label>
            What would you like to auction?
            <input
              maxLength={140}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (!pending && !busy && prompt.trim()) void choose(false)
                }
              }}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. a vintage camera"
              disabled={pending}
            />
          </label>
          {import.meta.env.MODE === 'review' && (
            <small>Local collection: cameras, watches and headphones.</small>
          )}
          <label>
            Item preference
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value as Rarity)}
              disabled={pending}
            >
              <option value="any">Any rarity</option>
              <option value="everyday">Everyday</option>
              <option value="collectible">Collectible</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void choose(false)}
            disabled={pending || busy || !prompt.trim()}
          >
            Find my item
          </button>
        </div>
      )}
      {pending && <p role="status">Looking up listings…</p>}
      {error && (
        <p role="alert">
          {error} {item && 'You can still start with your current item.'}
        </p>
      )}
    </section>
  )
}
