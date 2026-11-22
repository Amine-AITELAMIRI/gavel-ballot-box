import { usePresenceRoom } from 'deepspace'
export default function Presence({lot}:{lot:string}){
  const {peers,connected}=usePresenceRoom('gavel-lot:'+lot)
  return connected?<span>{peers.length+1} watching</span>:null
}
