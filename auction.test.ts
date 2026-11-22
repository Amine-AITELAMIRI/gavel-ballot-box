import { DatabaseSync } from 'node:sqlite'
import { describe, it, expect } from 'vitest'
import { AuctionStore, type Database } from './src/gavel/store'
import type { Actor, Auction } from './src/gavel/model'
const actors=['Host','Alice','Bob'].map(name=>({id:name,name,signed:true}))
const [host,alice,bob]=actors
function setup(){
  const sql=new DatabaseSync(':memory:')
  const db:Database={exec(q,...args){if(q.includes('CREATE TABLE')){sql.exec(q);return {toArray:()=>[]}}const rows=sql.prepare(q).all(...args);return {toArray:()=>rows as ReturnType<ReturnType<Database['exec']>['toArray']>}}}
  const store=new AuctionStore(db);store.setup();const start=100000
  const run=(op:string,actor:Actor,input:Record<string,unknown>={},now=start)=>store.execute({op,room:'auction',actor,input},now) as Auction
  const room=run('create',host,{title:'Studio',minutes:1,lotTitle:'Print',description:'Edition of 25'});const lot=room.lots[0].id
  return {run,lot,store,start,sql}
}
describe('sealed bidding',()=>{
  it('shows each caller only their private bid, then publishes just the winner',()=>{
    const {run,lot}=setup();run('bid',alice,{lot,amount:51});run('bid',bob,{lot,amount:80})
    expect(run('view',host).lots[0]).toMatchObject({myBid:null,result:null})
    expect(JSON.stringify(run('view',bob))).not.toContain('51')
    expect(run('view',alice).lots[0].myBid).toBe(51)
    const result=run('close',host,{lot}).lots[0].result
    expect(result).toEqual({winner:'Bob',amount:80,count:2,mine:false})
    expect(run('close',host,{lot}).lots[0].result).toEqual(result)
    expect(run('view',bob).lots[0].result?.mine).toBe(true)
  })
  it('enforces ownership, positive whole-dollar raises, lot scope and deadline',()=>{
    const {run,lot,start}=setup();run('bid',alice,{lot,amount:50})
    for(const amount of [0,-1,10.5,50,49,1000001])expect(()=>run('bid',alice,{lot,amount})).toThrow()
    expect(()=>run('close',bob,{lot})).toThrow(/organizer/)
    expect(()=>run('bid',alice,{lot:'other',amount:80})).toThrow(/Lot not found/)
    expect(()=>run('bid',alice,{lot,amount:80},start+60000)).toThrow(/closed/)
    expect(run('view',host,{},start+60000).lots[0].result?.amount).toBe(50)
  })
  it('resolves ties in order of reaching that amount and maintains one current bid',()=>{
    const {run,lot}=setup();run('bid',alice,{lot,amount:50});run('bid',bob,{lot,amount:80});run('bid',alice,{lot,amount:80})
    expect(run('close',host,{lot}).lots[0].result).toMatchObject({winner:'Bob',count:2})
  })
  it('settles empty lots and suppresses duplicate notifications across a cron/close race',()=>{
    const {run,lot,store,start}=setup();run('bid',{...bob,email:'test@example.invalid'},{lot,amount:5,notify:true});run('close',host,{lot})
    const second=run('add',host,{title:'Unused',description:'No offers'}).lots[1]
    store.sweep(start+60001);run('close',host,{lot:second.id},start+60002)
    expect(store.rows('SELECT * FROM notices')).toHaveLength(1)
    expect(run('view',host).lots[1].result).toMatchObject({count:0,amount:null,winner:null})
  })
})
