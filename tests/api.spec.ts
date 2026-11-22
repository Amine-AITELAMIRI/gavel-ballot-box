import {test,expect} from '@playwright/test'
test('shared auction creation and raw integrations require authorization',async({request})=>{
  const create=await request.post('/api/gavel/a-'+crypto.randomUUID()+'/create',{data:{}});expect(create.status()).toBe(401)
  const proxy=await request.post('/api/integrations/email/send',{data:{}});expect(proxy.status()).toBe(403)
})
