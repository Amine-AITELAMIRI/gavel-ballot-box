import { test, expect } from '@playwright/test'

for (const [width, amount, outcome] of [
  [1080, 999, 'You won.'],
  [390, 1, 'Another bidder won.'],
] as const) {
  test('timed bidder round at ' + width + 'px', async ({ page, browser }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await expect(
      page.getByRole('link', { name: /Host a live auction/ }),
    ).toBeVisible()
    await page.getByRole('link', { name: /Try a practice auction/ }).click()
    await expect(
      page.getByRole('heading', { name: 'Try a silent auction.' }),
    ).toBeVisible()
    await page.getByRole('radio', { name: /^Bidder/ }).check()
    await expect(
      page.getByText('Ridge study, no. 4', { exact: true }),
    ).toHaveCount(0)
    await expect(page.getByLabel('Your bid (USD)')).toHaveCount(0)
    await expect(page.getByRole('timer')).toHaveCount(0)
    await page.getByRole('button', { name: 'Start bidder round' }).click()
    await expect(page.getByRole('timer')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /camera|chronograph|headphones/i }),
    ).toBeVisible()
    await page.getByLabel('Your bid (USD)').fill(String(amount))
    await page.getByRole('button', { name: 'Seal $' + amount + ' bid' }).click()
    await expect(
      page.getByRole('heading', { name: 'Your bid is sealed.' }),
    ).toBeVisible()
    await expect(page.getByRole('timer')).toBeVisible()
    await expect(page.getByText('You sealed a bid')).toBeVisible()
    await expect(page.getByText('Winning bid', { exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('Your private offer')).toBeVisible()
    await expect(page.getByText('Sam sealed a bid')).toBeVisible({
      timeout: 9000,
    })
    await expect(page.getByLabel('Your bid (USD)')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: outcome })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: outcome })).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const stranger = await browser.newContext()
    const tab = await stranger.newPage()
    await tab.goto(page.url())
    await expect(tab.getByRole('alert')).toBeVisible()
    await stranger.close()
    await page.getByRole('link', { name: 'Try the host role' }).click()
    await expect(page.getByRole('radio', { name: /^Host/ })).toBeChecked()
  })
}

test('host sees incoming activity and announces after the deadline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(
    page.getByRole('link', { name: /Host a live auction/ }),
  ).toBeVisible()
  await page.getByRole('link', { name: /Try a practice auction/ }).click()
  await page.getByRole('radio', { name: /^Host/ }).check()
  await expect(page.getByLabel('Round length (seconds)')).toHaveValue('5')
  await expect(page.getByRole('article', { name: 'Item preview' })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole('button', { name: 'Use sample print' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Surprise me' }).click()
  await page.getByLabel('Round length (seconds)').fill('7')
  await page.getByRole('button', { name: 'Start host round' }).click()
  await expect(
    page.getByText('Waiting for the first sealed bid…'),
  ).toBeVisible()
  await expect(page.getByText('Alex sealed a bid')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Announce winner' }),
  ).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Sam sealed a bid')).toBeVisible({
    timeout: 9000,
  })
  await expect(
    page.getByRole('button', { name: 'Announce winner' }),
  ).toBeVisible()
  await expect(page.getByText('Winning bid', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Announce winner' }).click()
  await expect(page.getByRole('heading', { name: /wins\./ })).toBeVisible()
  await expect(page.getByText('Winning bid', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: /wins\./ })).toBeVisible()
})
test('bidder who runs out of time can retry', async ({ page }) => {
  await page.goto('/?practice=bidder')
  await page.getByRole('button', { name: 'Start bidder round' }).click()
  await expect(page.getByRole('heading', { name: 'Time’s up.' })).toBeVisible({
    timeout: 15000,
  })
  await expect(page.getByLabel('Your bid (USD)')).toHaveCount(0)
  await page.getByRole('link', { name: 'Play this role again' }).click()
  await expect(
    page.getByRole('button', { name: 'Start bidder round' }),
  ).toBeVisible()
})
