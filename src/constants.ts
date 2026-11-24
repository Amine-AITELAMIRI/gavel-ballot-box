/** App name — replaced by the CLI during scaffolding */
export const APP_NAME = 'gavel-ballot-box'

/** Immutable app identity — data scope keys to this, so renames never
 *  strand your records.
 *
 *  Injected by the build from `DEEPSPACE_APP_ID` in the wrangler config this
 *  build is running against — `deepspaceBuild()` in vite.config.ts supplies the
 *  define (see `deepspace/build`). wrangler.toml is the only source of truth,
 *  so `deepspace dev start`, `vite build`, and `deepspace deploy --env <name>`
 *  each get their own environment's id — not a copy frozen at scaffold time.
 *  Do not replace this with a literal: that is how a staging browser ends up
 *  reading production's rooms. */
declare const __DEEPSPACE_APP_ID__: string
export const APP_ID: string = __DEEPSPACE_APP_ID__

/** Primary scope ID for the app's RecordRoom DO */
export const SCOPE_ID = `app:${APP_ID}`

/** Bidder practice round length. Ten seconds proved too tight for a first
 *  visit — the reader is still parsing the item when the clock expires — and the
 *  server rejects a late seal, so a slow first run ends with no bid at all. */
export const BIDDER_SECONDS = 20

/** Roles and display config — imported from SDK (single source of truth) */
export { ROLES, ROLE_CONFIG, type Role } from 'deepspace'
