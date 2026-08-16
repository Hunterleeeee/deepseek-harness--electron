/** Read and validate the build manifest generated immediately before desktop packaging. */

import { readFile } from 'node:fs/promises'
import type { DesktopBuildInfo } from './protocol.ts'

/**
 * Read the exact desktop/Harness version tuple embedded in `dist`.
 * @returns validated build metadata.
 */
export async function readBuildInfo(): Promise<DesktopBuildInfo> {
  const path = new URL('../build-info.json', import.meta.url)
  const value: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (!isRecord(value)
    || typeof value.desktopVersion !== 'string'
    || typeof value.harnessVersion !== 'string'
    || typeof value.harnessCommit !== 'string'
    || typeof value.upstreamCommit !== 'string'
    || typeof value.builtAt !== 'string') {
    throw new Error(`desktop: malformed build manifest at ${path.pathname}`)
  }
  return {
    desktopVersion: value.desktopVersion,
    harnessVersion: value.harnessVersion,
    harnessCommit: value.harnessCommit,
    upstreamCommit: value.upstreamCommit,
    builtAt: value.builtAt,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
