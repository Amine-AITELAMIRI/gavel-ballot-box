import { test, expect, type Page } from '@playwright/test'

// The review server authenticates three local browser sessions with the same
// bearer-token verification used by hosted rooms.
test.skip(
  !process.env.GAVEL_LOCAL_TEST,
  'Run with npm run test:review against npm run review.',
)
async function profile(page: Page, url: string, button: string, name: string) {
  await page.goto(url)
  await page.getByRole('button', { name: button, exact: true }).click()
  await page.getByRole('button', { name, exact: true }).click()
}
test('three local profiles can host, bid privately and reveal one shared result', async ({
  browser,
  baseURL,
  page: host,
}) => {
  await profile(host, '/?host=1', 'Choose a local profile', 'Organizer')
  await host.setViewportSize({ width: 390, height: 844 })
  await host.getByLabel('Auction name').fill('Studio proof sale')
  await host.getByLabel('Custom', { exact: true }).check()
  await host.getByLabel('Duration in minutes').fill('90')
  await host
    .getByRole('button', { name: 'Enter item details manually' })
    .click()
  await host.getByLabel('Item name').fill('Blue linocut')
  await host
    .getByLabel('Item description')
    .fill('Signed print on cotton paper.')
  await host.getByRole('button', { name: 'Open auction', exact: true }).click()
  await expect(
    host.getByRole('heading', { name: 'Blue linocut' }),
  ).toBeVisible()
  await expect(
    host.getByRole('heading', { name: 'Invite bidders' }),
  ).toBeVisible()
  await expect(host.getByLabel('Your bid (USD)')).toHaveCount(0)
  await expect(host.getByRole('button', { name: 'Copy link' })).toBeInViewport()
  await expect(host.getByRole('heading', { level: 1 })).toBeFocused()
  const url = await host.getByLabel('Bidder link').inputValue()
  expect(url).toBe(host.url())
  await host.getByRole('button', { name: 'Preview bidder page' }).click()
  await expect(host.getByText(/Read-only preview/)).toBeVisible()
  await expect(host.getByLabel('Your bid (USD)')).toHaveCount(0)
  await host.getByRole('button', { name: 'Back to host dashboard' }).click()
  await host.setViewportSize({ width: 390, height: 844 })
  await expect(host.getByRole('button', { name: 'Copy link' })).toBeInViewport()
  expect(
    await host.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await host.setViewportSize({ width: 1080, height: 720 })
  const ctxA = await browser.newContext({ baseURL }),
    ctxB = await browser.newContext({ baseURL })
  try {
    const alice = await ctxA.newPage(),
      bob = await ctxB.newPage()
    for (const [p, name, amount] of [
      [alice, 'Alice', '137'],
      [bob, 'Bob', '185'],
    ] as const) {
      await profile(p, url, 'Choose a local bidder', name)
      await expect(
        p.getByRole('button', { name: 'Compare asking prices' }),
      ).toHaveCount(0)
      await expect(
        p.getByRole('heading', { name: 'Blue linocut' }),
      ).toBeVisible()
      await p.getByLabel('Your bid (USD)').fill(amount)
      await p.getByRole('button', { name: 'Place $' + amount + ' bid' }).click()
      await expect(
        p.getByRole('heading', { name: 'Your bid is sealed.' }),
      ).toBeVisible()
    }
    await alice.getByRole('link', { name: 'Gavel home' }).click()
    await alice
      .getByRole('link', { name: /Return to Studio proof sale/ })
      .click()
    await expect(alice.getByText('$137', { exact: true })).toBeVisible()
    await alice.getByRole('button', { name: 'Raise your bid' }).click()
    await alice.getByLabel('Your bid (USD)').fill('185')
    await alice.getByRole('button', { name: 'Update $185 bid' }).click()
    await expect(alice.getByText('$185', { exact: true })).toBeVisible()
    const room = new URL(url).searchParams.get('room')!
    const view = async (p: Page) =>
      p.evaluate(async (room) => {
        const auth = await (
          await fetch('/api/auth/token', { method: 'POST' })
        ).json()
        return (
          await fetch('/api/gavel/' + room + '/view', {
            headers: { Authorization: 'Bearer ' + auth.token },
          })
        ).json()
      }, room)
    const hostView = await view(host),
      bobView = await view(bob)
    expect(hostView.lots[0]).toMatchObject({ myBid: null, result: null })
    expect(bobView.lots[0]).toMatchObject({ myBid: 185, result: null })
    expect(Object.keys(bobView.lots[0]).sort()).toEqual(
      [
        'id',
        'title',
        'description',
        'source',
        'suggestion',
        'hasArt',
        'myBid',
        'result',
      ].sort(),
    )
    const attemptedClose = await bob.evaluate(
      async ({ room, lot }) => {
        const { token } = await (
          await fetch('/api/auth/token', { method: 'POST' })
        ).json()
        return (
          await fetch('/api/actions/closeLot', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ room, lot }),
          })
        ).json()
      },
      { room, lot: hostView.lots[0].id },
    )
    expect(attemptedClose.success).toBe(false)
    await host.getByText('Optional item tools').click()
    await host.getByRole('button', { name: 'Illustrate item' }).click()
    await expect(host.getByAltText('Illustrative placeholder')).toBeVisible()
    await expect
      .poll(() =>
        host
          .getByAltText('Illustrative placeholder')
          .evaluate((e) => (e as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0)
    await host.getByRole('button', { name: 'Close item early' }).click()
    await host.getByRole('button', { name: 'Keep bidding open' }).click()
    await expect(host.getByText('OPEN FOR BIDS', { exact: true })).toBeVisible()
    await host.getByRole('button', { name: 'Close item early' }).click()
    await host.getByRole('button', { name: 'Close and reveal' }).click()
    await expect(
      host.getByLabel('Selected item').getByText('$185', { exact: true }),
    ).toBeVisible()
    await expect(
      alice.getByText(/Bob reached \$185 first/, { exact: false }),
    ).toBeVisible({ timeout: 12000 })
    await alice.getByRole('link', { name: 'Go to your bids' }).click()
    await expect(
      alice.getByRole('link', { name: /Blue linocut · See result/ }),
    ).toBeVisible()
    await bob.reload()
    await expect(bob.getByRole('heading', { name: 'You won.' })).toBeVisible()
    await expect(bob.getByText('Signed print on cotton paper.')).toBeVisible()
    expect((await view(alice)).lots[0].source).toBeNull()
    expect((await view(alice)).lots[0].result).toMatchObject({
      winner: 'Bob',
      amount: 185,
      count: 2,
      mine: false,
    })
    await host.getByRole('button', { name: 'Add item', exact: true }).click()
    await host
      .getByRole('button', { name: 'Enter item details manually' })
      .click()
    await host.getByLabel('Item name').fill('Second proof')
    await host.getByLabel('Item description').fill('Another print.')
    await host.getByRole('button', { name: 'Save item' }).click()
    await expect(
      host.getByRole('heading', { name: 'Second proof' }),
    ).toBeVisible()
    await bob.reload()
    await bob
      .getByRole('navigation', { name: 'Auction items' })
      .getByRole('button', { name: /Second proof/ })
      .click()
    await bob.getByLabel('Your bid (USD)').fill('29')
    await bob.getByRole('button', { name: 'Place $29 bid' }).click()
    await bob.getByRole('link', { name: 'Gavel home' }).click()
    await bob.getByRole('link', { name: /See all your bids/ }).click()
    await expect(
      bob.getByRole('heading', { level: 1, name: 'Your bids' }),
    ).toBeVisible()
    await bob.getByRole('link', { name: /Second proof · View receipt/ }).click()
    await expect(bob.getByText('$29', { exact: true })).toBeVisible()
    await bob.reload()
    await expect(bob.getByText('$29', { exact: true })).toBeVisible()
    await alice.reload()
    await expect(alice.getByRole('link', { name: /Second proof/ })).toHaveCount(
      0,
    )
    await host.getByRole('link', { name: 'Gavel home' }).click()
    await host
      .getByRole('link', { name: 'Return to your last host dashboard' })
      .click()
    await expect(
      host.getByRole('heading', { name: 'Studio proof sale' }),
    ).toBeVisible()
    await expect(
      host
        .getByRole('navigation', { name: 'Auction items' })
        .getByRole('button'),
    ).toHaveCount(2)
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})

test('host chooses the item and bidder reviews the same listing in a fresh round', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?practice=host')
  await page.getByRole('button', { name: 'Surprise me' }).click()
  await expect(
    page.getByRole('article', { name: 'Item preview' }).getByRole('heading'),
  ).not.toHaveText('Ridge study, no. 4')
  await page.getByRole('button', { name: 'Choose my own item' }).click()
  const prompt = page.getByLabel('What would you like to auction?')
  await prompt.fill('spaceship')
  await page.getByRole('button', { name: 'Find my item' }).click()
  await expect(page.getByRole('alert')).toContainText('No match')
  await prompt.fill('camera')
  await page.getByLabel('Item preference').selectOption('collectible')
  const prepared = page.waitForResponse((res) => res.url().endsWith('/prepare'))
  await page.getByRole('button', { name: 'Find my item' }).click()
  const { id } = await (await prepared).json()
  const name = 'Black interchangeable-lens camera'
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect
    .poll(() =>
      page
        .getByRole('img', { name })
        .evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0)
  await expect(
    page.getByRole('button', { name: 'Recheck seller price' }),
  ).toHaveCount(0)
  await expect(page.getByRole('article', { name: 'Item preview' })).toHaveText(
    name + 'A compact black camera paired with a removable lens.',
  )
  await expect(page.getByRole('timer')).toHaveCount(0)
  const stranger = await browser.newContext({
    baseURL: new URL(page.url()).origin,
  })
  try {
    const result = await stranger.request.post(
      '/api/gavel/s-' + crypto.randomUUID() + '/sample',
      { data: { role: 'host', item: id } },
    )
    expect(result.status()).toBe(422)
  } finally {
    await stranger.close()
  }
  await expect(page.getByText('Plan my bid')).toHaveCount(0)
  await page.getByRole('button', { name: 'Start host round' }).click()
  await expect(page.getByRole('timer')).toBeVisible()
  await expect(page.getByRole('img', { name })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Announce winner' }).click()
  await page
    .getByRole('link', { name: 'Bid on this item in a new round' })
    .click()
  await expect(page.getByRole('heading', { name })).toHaveCount(0)
  await expect(page.getByRole('article', { name: 'Item preview' })).toHaveCount(
    0,
  )
  await expect(page.getByText('Plan my bid')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Surprise me' })).toHaveCount(0)
  await expect(page.getByRole('timer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Start bidder round' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  const caption = page
    .locator('figure figcaption')
    .filter({ has: page.getByRole('heading', { name }) })
  await expect(
    caption.getByText('A compact black camera paired with a removable lens.'),
  ).toBeVisible()
  await expect(page.getByText('Item details and price')).toHaveCount(0)
  await expect(page.getByText('$240', { exact: true })).toHaveCount(0)
  await page.getByLabel('Your bid (USD)').fill('310')
  await page.getByRole('button', { name: 'Seal $310 bid' }).click()
  await expect(page.getByRole('timer')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Your private offer')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'You won.' })).toBeVisible({
    timeout: 14000,
  })
  await expect(
    page.getByText('Your sealed offer won ' + name + '.'),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('live entry, generated lots and opt-in addresses work across host and bidder profiles', async ({
  page: host,
  browser,
  baseURL,
}) => {
  await host.goto('/')
  await host.getByRole('link', { name: /Host a live auction/ }).click()
  await host.getByRole('button', { name: 'Choose a local profile' }).click()
  await host.getByRole('button', { name: 'Organizer', exact: true }).click()
  await host.getByLabel('Auction name').fill('Camera auction')
  await host.getByRole('button', { name: 'Choose my own item' }).click()
  await host.getByLabel('What would you like to auction?').fill('camera')
  await host.getByRole('button', { name: 'Find my item' }).click()
  const title = 'Black interchangeable-lens camera'
  await expect(host.getByRole('heading', { name: title })).toBeVisible()
  const target = host.getByLabel('Notification email')
  await expect(target).toHaveCount(0)
  await host.getByLabel('Email me when items close').check()
  await target.fill('organizer-notices@example.invalid')
  await host.getByRole('button', { name: 'Open auction' }).click()
  const url = await host.getByLabel('Bidder link').inputValue()
  await expect(host.getByRole('img', { name: title })).toBeVisible()
  const ctx = await browser.newContext({ baseURL })
  try {
    const bidder = await ctx.newPage()
    await profile(bidder, url, 'Choose a local bidder', 'Alice')
    await expect(bidder.getByRole('img', { name: title })).toBeVisible()
    await bidder.getByLabel('Your bid (USD)').fill('44')
    await bidder.getByLabel('Email me if I win').check()
    await expect(bidder.getByLabel('Notification email')).toHaveJSProperty(
      'required',
      true,
    )
    await bidder
      .getByLabel('Notification email')
      .fill('winner-notices@example.invalid')
    await bidder.getByRole('button', { name: 'Place $44 bid' }).click()
    await expect(
      bidder.getByRole('heading', { name: 'Your bid is sealed.' }),
    ).toBeVisible()
    await bidder.reload()
    await bidder.getByRole('button', { name: 'Raise your bid' }).click()
    await expect(bidder.getByLabel('Notification email')).toHaveValue(
      'winner-notices@example.invalid',
    )
    await bidder.getByLabel('Email me if I win').uncheck()
    await expect(bidder.getByLabel('Notification email')).toHaveCount(0)
    await host.getByRole('button', { name: 'Add item', exact: true }).click()
    await host.getByRole('button', { name: 'Surprise me' }).click()
    await host.getByRole('button', { name: 'Save item' }).click()
    await expect(
      host
        .getByRole('navigation', { name: 'Auction items' })
        .getByRole('button'),
    ).toHaveCount(2)
    await bidder.reload()
    await expect(
      bidder
        .getByRole('navigation', { name: 'Auction items' })
        .getByRole('button'),
    ).toHaveCount(2)
    await bidder
      .getByRole('navigation', { name: 'Auction items' })
      .getByRole('button')
      .nth(1)
      .click()
    await expect(bidder.locator('figure img')).toBeVisible()
  } finally {
    await ctx.close()
  }
})

test('leaving shared setup discards the auction form and item preview', async ({
  page,
}) => {
  await profile(page, '/?host=1', 'Choose a local profile', 'Organizer')
  await page.getByLabel('Auction name').fill('Unopened auction')
  await page.getByRole('button', { name: 'Surprise me' }).click()
  await expect(
    page.getByRole('article', { name: 'Item preview' }),
  ).toBeVisible()
  await page.getByLabel('Email me when items close').check()
  await page.getByLabel('Notification email').fill('unopened@example.invalid')
  await page.getByRole('link', { name: 'Back to Gavel' }).click()
  await expect(
    page.getByRole('link', { name: 'Return to your last host dashboard' }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: /Host a live auction/ }).click()
  await expect(page.getByLabel('Auction name')).toHaveValue('')
  await expect(page.getByRole('article', { name: 'Item preview' })).toHaveCount(
    0,
  )
  await expect(page.getByLabel('Email me when items close')).not.toBeChecked()
})
