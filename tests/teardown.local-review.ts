import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// The review server puts `.dev.vars` back itself when it can exit cleanly, but
// a run can kill that whole process tree. The copy it leaves behind is what
// guarantees the platform's file returns even then.
const backup = fileURLToPath(
  new URL('../.dev.vars.review-backup', import.meta.url),
)
const live = fileURLToPath(new URL('../.dev.vars', import.meta.url))

export default function teardown(): void {
  if (!existsSync(backup)) return
  writeFileSync(live, readFileSync(backup))
  unlinkSync(backup)
}
