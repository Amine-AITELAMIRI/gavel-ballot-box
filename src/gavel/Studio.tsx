import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { command, accessToken } from './api'
import { money, type Auction, type Lot } from './model'
import './studio.css'
const Presence=lazy(()=>import('./Presence'))

function Action({children,busy=false,type='button',onClick}:{children:ReactNode;busy?:boolean;type?:'button'|'submit';onClick?:()=>void}){
  return <button className="g-action" type={type} onClick={onClick} disabled={busy}><span>{busy?'Working…':children}</span><img src="/art/arrow.svg" width="20" height="20" alt=""/></button>
}
function Art({mode,lot,auction}:{mode:string;lot?:Lot;auction?:Auction}){
  const isPrint=mode==='bid'&&auction?.sample
  const custom=mode==='bid'&&lot?.hasArt
  const name=isPrint?'ridge':mode==='sealed'?'deposited':mode==='result'?'reveal':'ballot'
  const top=isPrint?'LOT 01  /  EDITION OF 25':custom?'LOT ART  /  ILLUSTRATION':'DEPOSIT  /  SLOT 01'
  return <figure className={'g-art '+(isPrint?'has-print':'')} aria-label={isPrint?'Ridge study, two-color landscape print':custom?'Generated lot illustration':'Green bidding slip and a charcoal ballot box'}>
    <figcaption className="g-legend">{top}</figcaption>
    <div className={'g-object '+(custom?'custom':'')} key={name}><img className={'object-'+name} src={custom?'/api/gavel/'+auction?.id+'/art?lot='+lot?.id:'/art/'+name+'.svg'} alt={custom?'Illustrative placeholder':''}/></div>
    <span className="g-legend">{mode==='sealed'?'BID SEALED':mode==='result'?'LOT CLOSED':custom?'GENERATED PLACEHOLDER':auction?.sample===false?'AUCTION LOT':'STUDIO BENEFIT AUCTION'}</span>
  </figure>
}
function signIn(){
  sessionStorage.setItem('gavel-return',location.pathname+location.search)
  location.assign('/api/auth/social-redirect?provider=google')
}
function LotFields(){return <><label>Lot title<input name="lotTitle" required maxLength={90} placeholder="Ridge study, no. 4"/></label><label>Description<textarea name="description" required maxLength={480} placeholder="Material, size, edition or condition"/></label></>}
export default function Studio(){
  const [query,setQuery]=useSearchParams()
  const room=query.get('room')||'',host=query.has('host')
  const [auction,setAuction]=useState<Auction|null>(null),[selected,setSelected]=useState(''),[edit,setEdit]=useState(false),[adding,setAdding]=useState(false)
  const [amount,setAmount]=useState('65'),[notify,setNotify]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false)
  const [signed,setSigned]=useState<boolean|null>(null)
  const active=useRef(false),version=useRef(0),heading=useRef<HTMLHeadingElement>(null),createKey=useRef('')
  const current=auction?.id===room?auction:null
  const lot=current?.lots.find(l=>l.id===selected)||current?.lots[0]
  const mode=host?'host':!room?'welcome':!current?'loading':lot?.result?'result':lot?.myBid!=null&&!edit?'sealed':'bid'
  useEffect(()=>{
    let live=true
    if(host||room.startsWith('a-'))accessToken().then(t=>{if(live)setSigned(Boolean(t))}).catch(()=>{if(live)setSigned(false)})
    return ()=>{live=false}
  },[room,host])
  useEffect(()=>{
    let live=true
    async function read(){
      if(!room||active.current)return
      const v=version.current
      try{const data=await command(room,'view');if(live&&v===version.current)setAuction(data)}
      catch(e){if(live&&v===version.current)setError((e as Error).message)}
    }
    void read()
    const timer=room?window.setInterval(()=>{if(document.visibilityState==='visible')void read()},5000):undefined
    return ()=>{live=false;window.clearInterval(timer)}
  },[room])
  useEffect(()=>{if(mode!=='welcome'&&mode!=='loading')heading.current?.focus({preventScroll:true})},[mode])
  async function work(fn:()=>Promise<void>){
    if(active.current)return
    active.current=true;version.current++;setBusy(true);setError('')
    try{await fn()}catch(e){setError((e as Error).message||'Please try again.')}finally{version.current++;active.current=false;setBusy(false)}
  }
  function go(params:Record<string,string>){setError('');setEdit(false);setAdding(false);setCopied(false);setQuery(params)}
  function create(sample:boolean,form?:FormData){
    void work(async()=>{
      const prefix=sample?'s-':'a-'
      if(!createKey.current.startsWith(prefix))createKey.current=prefix+crypto.randomUUID()
      const data=await command(createKey.current,sample?'sample':'create',form?{title:form.get('title'),minutes:Number(form.get('minutes')),lotTitle:form.get('lotTitle'),description:form.get('description'),notify:form.has('notify')}:{})
      createKey.current='';setAuction(data);setSelected(data.lots[0].id);setAmount(sample?'65':'');setNotify(false);go({room:data.id})
    })
  }
  function mutate(op:string,params:Record<string,unknown>={}){
    void work(async()=>{
      const data=await command(room,op,{...params,lot:lot?.id})
      setAuction(data);setEdit(false);setAdding(false)
      if(op==='add')setSelected(data.lots[data.lots.length-1].id)
    })
  }
  function bid(e:FormEvent){e.preventDefault();mutate('bid',{amount:Number(amount),notify})}
  const title=mode==='welcome'?<>Make a<br/>silent bid.</>:mode==='host'?'Host an auction.':mode==='loading'?(error?'Room unavailable.':'Opening room…'):mode==='bid'?lot?.title:mode==='sealed'?'Bid deposited.':lot?.result?.mine?'You won.':lot?.result?.count?'Winning bid revealed.':'No bids this time.'
  const tag=mode==='welcome'?'SEALED-BID AUCTION':mode==='host'?'ORGANIZER DESK':mode==='loading'?'AUCTION ROOM':'LOT '+String((current?.lots.indexOf(lot! )??0)+1).padStart(2,'0')+'  /  '+(mode==='bid'?(current?.sample?'RISOGRAPH PRINT':'OPEN LOT'):mode==='sealed'?'BID RECEIPT':'FINAL RESULT')
  const publicRoom=current&&!current.sample
  return <div className="g-page"><header className="g-header"><a className="g-brand" href="/" aria-label="Gavel home"><img src="/art/mark.svg" alt="" width="28" height="28"/>Gavel</a><span className="g-context">{current?.title||'Studio benefit'} <i>/</i> {publicRoom?'Auction room':host?'Organizer desk':'Sample room'}</span></header>
    <main className="g-main"><Art mode={mode} auction={current||undefined} lot={lot}/><section className="g-panel">
      <div><p className="g-label">{tag}</p><h1 ref={heading} tabIndex={-1} className={mode==='welcome'?'hero-title':''}>{title}</h1></div>
      {mode==='welcome'&&<><p className="g-copy">One sample bidder is already in.<br/>Place your bid, then reveal the winner.</p><div className="g-controls"><Action busy={busy} onClick={()=>create(true)}>Try sample auction</Action><button className="g-link" onClick={()=>go({host:'1'})}>Host an auction</button></div></>}
      {mode==='host'&&(signed?<form onSubmit={e=>{e.preventDefault();create(false,new FormData(e.currentTarget))}}><label>Auction name<input required name="title" maxLength={80} placeholder="Studio benefit"/></label><LotFields/><label>Close after (minutes)<input name="minutes" type="number" min="1" max="10080" defaultValue="60" required/></label><label className="check"><input type="checkbox" name="notify"/>Email me the results</label><Action type="submit" busy={busy}>Create auction</Action></form>:<><p className="g-copy">Create a lot and share its link. Bidders sign in to keep their bids across devices.</p><Action busy={signed===null} onClick={signIn}>Sign in with Google</Action></>)}
      {mode==='bid'&&lot&&<><p className="g-copy">{lot.description}{current?.sample&&<><br/>One sample bidder has already placed a bid.</>}</p>{publicRoom&&signed===false?<Action onClick={signIn}>Sign in to bid</Action>:<form onSubmit={bid}><label className="g-label" htmlFor="bid">YOUR BID / USD</label><div className="g-amount"><span>$</span><input id="bid" type="number" inputMode="numeric" required min={(lot.myBid??0)+1} max="1000000" step="1" value={amount} placeholder="0" onChange={e=>setAmount(e.target.value)}/></div>{publicRoom&&<label className="check"><input type="checkbox" checked={notify} onChange={e=>setNotify(e.target.checked)}/>Email me if I win</label>}<Action type="submit" busy={busy}>Seal {amount?money(Number(amount))+' ':''}bid</Action></form>}</>}
      {mode==='sealed'&&lot&&<><p className="g-copy">Only you can see your amount. {current?.owner?'Close the lot to reveal the winner.':'The winning bid appears when the lot closes.'}</p><div className="g-receipt"><span className="g-label">YOUR SEALED BID</span><strong>{money(lot.myBid!)}</strong></div>{current?.owner&&<Action busy={busy} onClick={()=>mutate('close')}>{current.sample?'Close sample lot':'Close lot'}</Action>}<button className="g-link" onClick={()=>{setEdit(true);setAmount(String(lot.myBid!+1))}}>Raise your bid</button></>}
      {mode==='result'&&lot?.result&&<><p className="g-copy">{lot.result.count?((lot.result.mine?'Your':lot.result.winner+'’s')+' '+money(lot.result.amount!)+' bid won '+lot.title+'. Other bid amounts stay private.'):'The deadline passed without an offer.'}</p><div className="g-receipt"><span className="g-label">WINNING BID</span><strong>{lot.result.amount===null?'—':money(lot.result.amount)}</strong></div>{current?.sample&&<Action busy={busy} onClick={()=>create(true)}>Try again</Action>}</>}
      {mode==='loading'&&error&&<a className="g-link" href="/">Start a new sample</a>}
      {error&&<p role="alert" className="g-error">{error}</p>}
    </section></main>
    {publicRoom&&lot&&<section className="g-tools"><div className="g-bar"><span className="g-label">AUCTION ROOM</span><span>Closes {new Date(current.closesAt).toLocaleString()} · <Suspense fallback="Connecting"><Presence lot={lot.id}/></Suspense></span></div><div className="g-buttons">{current.lots.map((l,i)=><button className={l.id===lot.id?'chosen':''} key={l.id} onClick={()=>{setSelected(l.id);setEdit(false);setError('');setAmount('')}}>Lot {i+1} · {l.title}</button>)}<button onClick={()=>void work(async()=>{await navigator.clipboard.writeText(location.origin+'/?room='+room);setCopied(true)})}>{copied?'Link copied':'Copy auction link'}</button></div>
      {lot.suggestion&&<p className="g-copy">{lot.suggestion} <a href={lot.source!} target="_blank" rel="noreferrer">View comparable listing</a></p>}
      {current.owner&&<><div className="g-buttons"><button onClick={()=>setAdding(!adding)}>{adding?'Cancel':'Add lot'}</button>{!lot.result&&<><button disabled={busy||Boolean(lot.source)} onClick={()=>mutate('research')}>Research starting price</button><button disabled={busy||lot.hasArt} onClick={()=>mutate('illustrate')}>Illustrate lot</button>{mode!=='sealed'&&<button disabled={busy} onClick={()=>mutate('close')}>Close lot</button>}</>}</div>{adding&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);mutate('add',{title:f.get('lotTitle'),description:f.get('description')})}}><LotFields/><Action type="submit" busy={busy}>Save lot</Action></form>}</>}
    </section>}
    <footer className="g-footer"><span>{current?.title||'STUDIO BENEFIT'}</span><span>{({welcome:'Sample auction',host:'Organizer desk',loading:'Auction room',bid:'Bidding open',sealed:'Bid confirmed',result:'Auction closed'})[mode]}</span></footer>
  </div>
}
