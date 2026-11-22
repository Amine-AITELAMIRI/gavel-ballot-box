/* Design Direction: Gavel / quiet anticipation / ballot slot. References: print catalogs, ballot boxes, studio receipts.
   Signature: green slip drops into a charcoal box. Hero: editable auction illustration from Figma B.
   Color: charcoal and pear. Type: Space Grotesk, DM Sans, IBM Plex Mono. Theme: ballot.
   Art: two-ink paper objects. Motion: 200 ms ease-out with reduced-motion override. Voice: short, second person. */
import { Seo } from '../components/Seo'
import { seo } from '../seo'
import Studio from '../gavel/Studio'
export default function Landing(){return <><Seo {...seo} path="/"/><Studio/></>}
