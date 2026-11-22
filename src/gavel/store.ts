import type { Actor, Auction, Lot, RoomCommand } from './model'
export class Problem extends Error {
  constructor(public status: number, message: string) { super(message) }
}
type Value = string | number | null
type Row = Record<string, Value>
export interface Database { exec(query: string, ...args: Value[]): { toArray(): Row[] } }
const day = 86400000
export function field(value: unknown, max: number, fallback = '') {
  const text = String(value ?? fallback).trim()
  if (!text || text.length > max) throw new Problem(422, 'Enter text between 1 and ' + max + ' characters.')
  return text
}
export class AuctionStore {
  constructor(private db: Database) {}
  setup() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS auctions (id TEXT PRIMARY KEY, title TEXT NOT NULL, owner TEXT NOT NULL, email TEXT, sample INTEGER NOT NULL, closes INTEGER NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS lots (id TEXT PRIMARY KEY, auction TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, source TEXT, suggestion TEXT, image TEXT);
      CREATE INDEX IF NOT EXISTS lots_auction ON lots(auction);
      CREATE TABLE IF NOT EXISTS bids (seq INTEGER PRIMARY KEY AUTOINCREMENT, lot TEXT NOT NULL, bidder TEXT NOT NULL, alias TEXT NOT NULL, email TEXT, amount INTEGER NOT NULL, UNIQUE(lot,bidder));
      CREATE INDEX IF NOT EXISTS bids_rank ON bids(lot,amount DESC,seq);
      CREATE TABLE IF NOT EXISTS results (lot TEXT PRIMARY KEY, winner TEXT, alias TEXT, amount INTEGER, count INTEGER NOT NULL, closed INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS usage (bucket TEXT, period INTEGER, n INTEGER, PRIMARY KEY(bucket,period));
      CREATE TABLE IF NOT EXISTS notices (lot TEXT, recipient TEXT, message TEXT, status TEXT, PRIMARY KEY(lot,recipient));`)
  }
  rows(q: string, ...args: Value[]) { return this.db.exec(q, ...args).toArray() }
  one(q: string, ...args: Value[]) { return this.rows(q,...args)[0] }
  quota(bucket: string, limit: number, now: number) {
    const period = Math.floor(now / day)
    this.db.exec('INSERT INTO usage VALUES(?,?,1) ON CONFLICT(bucket,period) DO UPDATE SET n=n+1',bucket,period)
    if (Number(this.one('SELECT n FROM usage WHERE bucket=? AND period=?',bucket,period).n)>limit) throw new Problem(429,'Daily allowance reached. Try again tomorrow.')
  }
  owner(a: Row, actor: Actor) {
    if (a.owner !== actor.id) throw new Problem(403,'Only the organizer can do that.')
  }
  auction(id: string, actor: Actor) {
    const a = this.one('SELECT * FROM auctions WHERE id=?',id)
    if (!a || (a.sample && a.owner !== actor.id)) throw new Problem(404,'This auction is unavailable in this session.')
    return a
  }
  settle(lot: Row, a: Row, now: number) {
    if (this.one('SELECT 1 FROM results WHERE lot=?',lot.id)) return
    const best = this.one('SELECT * FROM bids WHERE lot=? ORDER BY amount DESC,seq ASC LIMIT 1',lot.id)
    const count = this.one('SELECT count(*) AS n FROM bids WHERE lot=?',lot.id).n
    this.db.exec('INSERT INTO results VALUES(?,?,?,?,?,?)',lot.id,best?.bidder??null,best?.alias??null,best?.amount??null,count,now)
    if (!a.sample) {
      const message = best ? 'Winning bid: $'+best.amount+' from '+best.alias+'.' : 'This lot closed without bids.'
      for (const email of new Set([best?.email,a.email])) {
        if (email) this.db.exec("INSERT OR IGNORE INTO notices VALUES(?,?,?,'pending')",lot.id,email,String(lot.title)+' — '+message)
      }
    }
  }
  sweep(now: number) {
    const due = this.rows('SELECT l.* FROM lots l JOIN auctions a ON a.id=l.auction LEFT JOIN results r ON r.lot=l.id WHERE a.closes<=? AND r.lot IS NULL LIMIT 100',now)
    for(const l of due) this.settle(l,this.one('SELECT * FROM auctions WHERE id=?',l.auction),now)
    this.db.exec('DELETE FROM usage WHERE period < ?',Math.floor(now/day)-1)
  }
  view(a: Row, actor: Actor, now: number): Auction {
    const lots: Lot[] = this.rows('SELECT id,title,description,source,suggestion,image IS NOT NULL AS hasArt FROM lots WHERE auction=? ORDER BY rowid',a.id).map(l=>{
      if(Number(a.closes)<=now) this.settle(l,a,now)
      const r=this.one('SELECT * FROM results WHERE lot=?',l.id)
      const own=this.one('SELECT amount FROM bids WHERE lot=? AND bidder=?',l.id,actor.id)
      return {id:String(l.id),title:String(l.title),description:String(l.description),source:l.source as string|null,suggestion:l.suggestion as string|null,hasArt:Boolean(l.hasArt),myBid:own?Number(own.amount):null,result:r?{winner:r.alias as string|null,amount:r.amount as number|null,count:Number(r.count),mine:r.winner===actor.id}:null}
    })
    return {id:String(a.id),title:String(a.title),sample:Boolean(a.sample),owner:a.owner===actor.id,closesAt:Number(a.closes),lots}
  }
  execute({op,room,actor,input}:RoomCommand,now=Date.now()): unknown {
    if(op==='sample'||op==='create') {
      const sample=op==='sample'
      if(!sample&&!actor.signed) throw new Problem(401,'Sign in to organize an auction.')
      const existing=this.one('SELECT * FROM auctions WHERE id=?',room)
      if(existing){this.owner(existing,actor);return this.view(existing,actor,now)}
      this.quota('rooms:'+actor.id,24,now)
      this.quota(sample?'samples':'rooms',sample?1500:150,now)
      const title=sample?'Studio benefit':field(input.title,80)
      const minutes=sample?1440:Number(input.minutes)
      if(!Number.isInteger(minutes)||minutes<1||minutes>10080) throw new Problem(422,'Choose a deadline within seven days.')
      this.db.exec('INSERT INTO auctions VALUES(?,?,?,?,?,?,?)',room,title,actor.id,input.notify===true?actor.email??null:null,Number(sample),now+minutes*60000,now)
      const id=crypto.randomUUID()
      this.db.exec('INSERT INTO lots(id,auction,title,description) VALUES(?,?,?,?)',id,room,sample?'Ridge study, no. 4':field(input.lotTitle,90),sample?'Two-color print on cotton paper. Edition of 25.':field(input.description,480))
      if(sample){const rng=crypto.getRandomValues(new Uint32Array(1))[0];this.db.exec('INSERT INTO bids(lot,bidder,alias,amount) VALUES(?,?,?,?)',id,'sample-rival','Sample bidder',45+rng%36)}
    }
    const a=this.auction(room,actor)
    if(['view','create','sample'].includes(op)) return this.view(a,actor,now)
    if(op==='add') {
      this.owner(a,actor)
      if(a.sample||Number(a.closes)<=now)throw new Problem(409,'This auction cannot accept new lots.')
      if(Number(this.one('SELECT count(*) AS n FROM lots WHERE auction=?',room).n)>=12)throw new Problem(422,'This auction has reached 12 lots.')
      this.db.exec('INSERT INTO lots(id,auction,title,description) VALUES(?,?,?,?)',crypto.randomUUID(),room,field(input.title,90),field(input.description,480))
      return this.view(a,actor,now)
    }
    const lot=this.one('SELECT id,title,auction FROM lots WHERE id=? AND auction=?',String(input.lot??''),room)
    if(!lot)throw new Problem(404,'Lot not found.')
    const closed=this.one('SELECT 1 FROM results WHERE lot=?',lot.id)
    if(op==='bid') {
      if(!a.sample&&!actor.signed)throw new Problem(401,'Sign in to place a bid.')
      if(closed||Number(a.closes)<=now)throw new Problem(409,'Bidding has closed.')
      const amount=input.amount
      if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<1||amount>1000000)throw new Problem(422,'Enter a whole-dollar bid from $1 to $1,000,000.')
      const previous=this.one('SELECT amount FROM bids WHERE lot=? AND bidder=?',lot.id,actor.id)
      if(previous&&Number(previous.amount)>=amount)throw new Problem(409,'Your new bid must be higher than your sealed bid.')
      this.db.exec('DELETE FROM bids WHERE lot=? AND bidder=?',lot.id,actor.id)
      this.db.exec('INSERT INTO bids(lot,bidder,alias,email,amount) VALUES(?,?,?,?,?)',lot.id,actor.id,actor.name,input.notify===true?actor.email??null:null,amount)
    } else if(op==='close') {this.owner(a,actor);this.settle(lot,a,now)}
    else if(op==='research'||op==='illustrate') {
      this.owner(a,actor)
      if(!actor.signed||a.sample||closed||Number(a.closes)<=now)throw new Problem(403,'Assistance is available for open, hosted lots.')
      const existing=this.one('SELECT source,image IS NOT NULL AS hasArt FROM lots WHERE id=?',lot.id)
      if(op==='research'?existing.source:existing.hasArt)throw new Problem(409,'This lot already has that asset.')
      this.quota('assist:'+actor.id,3,now);this.quota('assist',12,now)
      return {id:lot.id,title:lot.title}
    } else throw new Problem(404,'Unknown operation.')
    return this.view(a,actor,now)
  }
}
