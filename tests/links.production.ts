import { expect, test } from '@playwright/test'

const room = 'a-00000000-0000-4000-8000-000000000001'
const screens = [
  { path: '/', title: 'Silent auctions', landing: true },
  { path: '/?utm_source=review', title: 'Silent auctions', landing: true },
  { path: '/?practice=bidder', title: 'Try a silent auction.' },
  { path: '/?practice=host', title: 'Try a silent auction.' },
  { path: '/?host=1', title: 'Set up your auction.' },
  { path: '/?receipts=1', title: 'Your bids' },
  { path: '/?room=' + room, title: 'Studio camera' },
]

for (const { path, title, landing } of screens) {
  test('first visit to ' + path, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('[prerender]')) {
        errors.push(message.text())
      }
    })
    await page.route('**/api/auth/token', (route) => route.fulfill({ json: { token: null } }))
    await page.route('**/api/gavel/' + room + '/view', (route) => route.fulfill({
      json: {
        id: room, title: 'Camera auction', sample: false, owner: false, closesAt: Date.now() + 60000,
        lots: [{ id: 'camera', title: 'Studio camera', description: 'A film camera.', result: null, myBid: null }],
      },
    }))
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    const html = await response!.text()
    if (landing) expect(html).toContain('data-prerendered="/"')
    else expect(html).toContain('<div id="root"></div>')
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
}
