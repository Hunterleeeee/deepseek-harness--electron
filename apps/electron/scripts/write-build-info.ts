/** Generate the exact desktop/Harness version tuple consumed at runtime. */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DesktopBuildInfo } from '../src/protocol.ts'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const repository = fileURLToPath(new URL('../../..', import.meta.url))
const appPackage = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as { version: string }
const harnessPackage = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')) as { version: string }
const git = (args: string[]): string => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim()
const manifest: DesktopBuildInfo = {
  desktopVersion: appPackage.version,
  harnessVersion: harnessPackage.version,
  harnessCommit: git(['rev-parse', 'HEAD']),
  upstreamCommit: git(['merge-base', 'HEAD', 'refs/remotes/origin/master']),
  builtAt: new Date().toISOString(),
}
const output = join(appDir, 'dist', 'build-info.json')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(manifest, undefined, 2) + '\n')
