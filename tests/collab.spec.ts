import {test,expect,loadAllTestAccounts} from 'deepspace/testing'
import type {Page} from '@playwright/test'
async function call(page:Page,path:string,body?:Record<string,unknown>){
  return page.evaluate(async({path,body})=>{
    const tokenResponse=await fetch('/api/auth/token',{method:'POST'});const {token}=await tokenResponse.json()
    const res=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined})
    return {status:res.status,data:await res.json()}
  },{path,body})
}
test.skip(loadAllTestAccounts().length<3,'Requires three DeepSpace test identities.')
test('three sessions keep bids private, enforce ownership, and settle once',async({users})=>{
  const [host,a,b]=await users(3);const room='a-'+crypto.randomUUID();const path='/api/gavel/'+room
  await Promise.all([host,a,b].map(u=>u.page.goto('/')))
  const created=await call(host.page,path+'/create',{title:'Print benefit',minutes:30,lotTitle:'Proof print',description:'One studio proof'})
  expect(created.status).toBe(200);const lot=created.data.lots[0].id
  const action=(p:Page,op:string,extra={})=>call(p,'/api/actions/'+op,{room,lot,...extra})
  expect((await action(a.page,'placeBid',{amount:137})).data.success).toBe(true)
  expect((await action(b.page,'placeBid',{amount:185})).data.success).toBe(true)
  for(const user of [host,b]){const view=await call(user.page,path+'/view');expect(JSON.stringify(view.data)).not.toContain('137');expect(view.data.lots[0].result).toBeNull()}
  expect((await action(b.page,'closeLot')).data.success).toBe(false)
  expect((await action(a.page,'placeBid',{amount:136})).data.success).toBe(false)
  const closes=await Promise.all([action(host.page,'closeLot'),action(host.page,'closeLot')]);for(const r of closes)expect(r.data.data.lots[0].result).toMatchObject({amount:185,count:2})
  expect((await action(a.page,'placeBid',{amount:200})).data.success).toBe(false)
  expect((await call(b.page,path+'/view')).data.lots[0].result.mine).toBe(true)
})
