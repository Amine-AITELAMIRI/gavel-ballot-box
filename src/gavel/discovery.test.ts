import { describe, expect, it } from 'vitest'
import { exampleItem, listingPhotos, researchItem } from './discovery'

describe('bidder research', () => {
  const listings = [
    {
      title: 'Camera kit',
      url: 'https://shop.example/kit',
      text: 'Kit price: $199 USD.',
      image: 'https://shop.example/photo.jpg',
    },
    {
      title: 'Tracked duplicate',
      url: 'https://shop.example/kit?utm_source=x',
      text: '$199 USD.',
    },
    {
      title: 'Sold camera',
      url: 'https://shop.example/sold',
      text: 'Sold for $95.',
    },
    {
      title: 'Foreign currency',
      url: 'https://shop.example/cad',
      text: 'Price: $90 CAD.',
    },
    {
      title: 'Second camera kit',
      url: 'https://shop.example/kit2',
      text: 'Asking price: USD 179.99.',
    },
  ]
  it('selects one listing with its original photo and ignores pricing claims during discovery', async () => {
    const searches: string[] = []
    async function provider<T>(name: string) {
      searches.push(name)
      return (
        name === 'exa/search'
          ? { results: listings }
          : {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    primary: 0,
                    title: 'Camera kit',
                    description: 'Camera and lens.',
                    comparisons: [{ index: 1, quote: '$199' }],
                  }),
                },
              ],
            }
      ) as T
    }
    const card = await researchItem(provider, 'camera', 'any')
    expect(searches).toEqual(['exa/search', 'anthropic/chat-completion'])
    expect(card).toMatchObject({
      source: listings[0].url,
      image: listings[0].image,
    })
    expect(card).not.toHaveProperty('comparisons')
    expect(card.sourcePrice).toBeUndefined()
  })
  it('uses the HTTPS featured photo and only alternate copies of the same listing asset', async () => {
    const source = 'https://gallery.example/print'
    async function contents<T>(
      name: string,
      body: Record<string, unknown>,
    ): Promise<T> {
      expect(name).toBe('exa/contents')
      expect(body.urls).toEqual([source])
      return {
        results: [
          {
            url: 'https://gallery.example/other',
            image: 'https://cdn.example/other.jpg',
          },
          {
            url: source,
            image: 'http://static.example/prints/Atlas-%2364.jpg?width=1500',
            extras: {
              imageLinks: [
                'https://cdn.example/works/Atlas-%2364.jpg',
                'https://gallery.example/banner.jpg',
                'javascript:alert(1)',
              ],
            },
          },
        ],
      } as T
    }
    expect(await listingPhotos(contents, source)).toEqual([
      'https://static.example/prints/Atlas-%2364.jpg?width=1500',
      'https://cdn.example/works/Atlas-%2364.jpg',
    ])
    const noFeature = async <T>() =>
      ({
        results: [
          {
            url: source,
            extras: { imageLinks: ['https://gallery.example/logo.jpg'] },
          },
        ],
      }) as T
    expect(await listingPhotos(noFeature, source)).toEqual([])
  })
  it('matches local categories and rarity and explains an unavailable item', () => {
    expect(exampleItem('film camera', 'collectible', '').image).toBe(
      '/art/items/camera.jpg',
    )
    expect(exampleItem('', 'everyday', '').title).toContain('headphones')
    expect(() => exampleItem('spaceship', 'any', '')).toThrow(/No match/)
    expect(() => exampleItem('chronograph', 'everyday', '')).toThrow(/No match/)
  })
})
