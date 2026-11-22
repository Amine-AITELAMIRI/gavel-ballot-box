import type { Auction } from './model'
export async function accessToken() { const { getAuthToken }=await import('deepspace');return getAuthToken() }
export async function command(room:string,op:string,input:Record<string,unknown>={}):Promise<Auction>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(room.startsWith('a-')){
    const token=await accessToken()
    if(token)headers.Authorization='Bearer '+token
  }
  if(room.startsWith('a-')&&(op==='bid'||op==='close')){
    const response=await fetch('/api/actions/'+(op==='bid'?'placeBid':'closeLot'),{method:'POST',headers,body:JSON.stringify({...input,room})})
    const action=await response.json<{success:boolean;data:Auction;error?:string}>()
    if(!response.ok||!action.success)throw Error(action.error||'Auction action failed.')
    return action.data
  }
  const read=op==='view'
  const res=await fetch('/api/gavel/'+room+'/'+op,{method:read?'GET':'POST',headers,body:read?undefined:JSON.stringify(input),cache:'no-store'})
  const data=await res.json<Auction & {error?:string}>().catch(()=>({error:'The auction server is unavailable.'}))
  if(!res.ok||!('lots' in data))throw Error(data.error||'Request failed. Please try again.')
  return data
}
