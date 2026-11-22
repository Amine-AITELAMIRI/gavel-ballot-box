/* home pattern: return to the auction — resume the organizer or bidder workflow after OAuth. */
import { useEffect } from 'react'
export default function Home(){
  useEffect(()=>{const path=sessionStorage.getItem('gavel-return');sessionStorage.removeItem('gavel-return');location.replace(path?.startsWith('/?')?path:'/?host=1')},[])
  return <p>Opening your auction…</p>
}
