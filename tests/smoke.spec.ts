import {test,expect} from '@playwright/test'
for(const size of [{width:1080,height:680},{width:390,height:844}]) {
  test('solo auction at '+size.width+'px',async({page,browser})=>{
    await page.setViewportSize(size);const errors:string[]=[];page.on('pageerror',err=>errors.push(err.message))
    await page.goto('/');await expect(page.getByRole('heading',{level:1})).toContainText('silent bid')
    await page.getByRole('button',{name:'Try sample auction'}).click()
    await page.getByLabel('YOUR BID / USD').fill('91');await page.getByRole('button',{name:'Seal $91 bid'}).click()
    await expect(page.getByRole('heading',{name:'Bid deposited.'})).toBeVisible()
    await page.reload();await expect(page.getByRole('heading',{name:'Bid deposited.'})).toBeVisible()
    const stranger=await browser.newContext();const other=await stranger.newPage();await other.goto(page.url());await expect(other.getByRole('alert')).toBeVisible();await stranger.close()
    await page.getByRole('button',{name:'Close sample lot'}).click();await expect(page.getByRole('heading',{name:'You won.'})).toBeVisible()
    await page.reload();await expect(page.getByRole('heading',{name:'You won.'})).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([])
  })
}
test('a smaller sample bid can lose',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Try sample auction'}).click();await page.getByLabel('YOUR BID / USD').fill('1');await page.getByRole('button',{name:'Seal $1 bid',exact:true}).click();await page.getByRole('button',{name:'Close sample lot'}).click();await expect(page.getByRole('heading',{name:'Winning bid revealed.'})).toBeVisible()
})
