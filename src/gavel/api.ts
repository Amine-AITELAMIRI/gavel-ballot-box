import type { Auction } from './model'

/** Resolved lazily so a signed-out practice visit never loads the auth module. */
export async function accessToken() {
  const { getAuthToken } = await import('deepspace')
  return getAuthToken()
}
export async function command(
  room: string,
  op: string,
  input: Record<string, unknown> = {},
): Promise<Auction> {
  // Practice rooms ride the HttpOnly cookie, so they need no bearer. Signed
  // rooms need one for identity, and a bid or close needs it for the SDK action
  // route as well — that is where the server-side permission check lives.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (room.startsWith('a-')) {
    const token = await accessToken()
    if (token) headers.Authorization = 'Bearer ' + token
  }
  if (room.startsWith('a-') && (op === 'bid' || op === 'close')) {
    const response = await fetch(
      '/api/actions/' + (op === 'bid' ? 'placeBid' : 'closeLot'),
      { method: 'POST', headers, body: JSON.stringify({ ...input, room }) },
    )
    const action = await response.json<{
      success: boolean
      data: Auction
      error?: string
    }>()
    if (!response.ok || !action.success)
      throw Error(action.error || 'Auction action failed.')
    return action.data
  }
  const read = op === 'view'
  // `no-store` because a poll must never show the sealed view from cache.
  const res = await fetch('/api/gavel/' + room + '/' + op, {
    method: read ? 'GET' : 'POST',
    headers,
    body: read ? undefined : JSON.stringify(input),
    cache: 'no-store',
  })
  const data = await res
    .json<Auction & { error?: string }>()
    .catch(() => ({ error: 'The auction server is unavailable.' }))
  if (!res.ok || !('lots' in data))
    throw Error(data.error || 'Request failed. Please try again.')
  return data
}

async function itemRequest(
  room: string,
  op: string,
  input: Record<string, unknown>,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (room.startsWith('a-')) {
    const token = await accessToken()
    if (token) headers.Authorization = 'Bearer ' + token
  }
  return fetch('/api/gavel/' + room + '/' + op, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  })
}

export async function getListingPhotos(
  source: string,
  room?: string,
  lot?: string,
  preview?: string,
) {
  // A photo lookup outside a room still needs a room id, because the route
  // derives the actor (and its quota) from it. Throwaway `s-` is enough.
  const res = await itemRequest(
    room || 's-' + crypto.randomUUID(),
    'listing-photo',
    { source, lot, preview },
  )
  if (!res.ok) return []
  return (await res.json<{ urls: string[] }>()).urls
}
export async function getItemPreview(
  room: string,
  input: Record<string, unknown>,
) {
  const res = await itemRequest(room, 'prepare', input)
  const result = await res.json<{
    card?: import('./items').ItemCard
    id?: string
    error?: string
  }>()
  if (!res.ok || !result.card)
    throw Error(
      result.error || 'Item research is unavailable. Please try again.',
    )
  return { card: result.card, id: result.id }
}
