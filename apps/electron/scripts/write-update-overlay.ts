/** Stage a distinct copy of the desktop sources consumed by Electron Builder's extra resources. */

import { cp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { UPDATE_OVERLAY_ENTRIES } from '../src/update-overlay.ts'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const output = join(appDir, 'dist', 'update-overlay', 'apps', 'electron')

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
for (const entry of UPDATE_OVERLAY_ENTRIES) {
  await cp(join(appDir, entry), join(output, entry), { recursive: true })
}
