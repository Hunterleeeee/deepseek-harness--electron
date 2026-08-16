/** Detached macOS helper that atomically replaces a verified application after its parent exits. */

import { spawn } from 'node:child_process'
import { appendFile, mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

interface ReplacementPlan {
  parentPid: number
  currentApp: string
  stagedApp: string
  backupApp: string
  logFile: string
}

const plan = parsePlan(process.argv[2])

await waitForExit(plan.parentPid)
await mkdir(dirname(plan.backupApp), { recursive: true })
await rm(plan.backupApp, { recursive: true, force: true })
await rename(plan.currentApp, plan.backupApp)
try {
  await rename(plan.stagedApp, plan.currentApp)
} catch (error) {
  await rename(plan.backupApp, plan.currentApp)
  await record(plan.logFile, `replacement failed and rollback completed: ${describe(error)}`)
  throw error
}
await record(plan.logFile, `installed ${plan.currentApp}; backup ${plan.backupApp}`)
const opener = spawn('/usr/bin/open', [plan.currentApp], { detached: true, stdio: 'ignore' })
opener.unref()

function parsePlan(value: string | undefined): ReplacementPlan {
  if (value === undefined) throw new Error('desktop update helper: missing replacement plan')
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed)
    || typeof parsed.parentPid !== 'number'
    || !Number.isSafeInteger(parsed.parentPid)
    || typeof parsed.currentApp !== 'string'
    || typeof parsed.stagedApp !== 'string'
    || typeof parsed.backupApp !== 'string'
    || typeof parsed.logFile !== 'string') {
    throw new Error('desktop update helper: malformed replacement plan')
  }
  return {
    parentPid: parsed.parentPid,
    currentApp: parsed.currentApp,
    stagedApp: parsed.stagedApp,
    backupApp: parsed.backupApp,
    logFile: parsed.logFile,
  }
}

async function waitForExit(pid: number): Promise<void> {
  for (;;) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if (isNodeError(error) && error.code === 'ESRCH') return
      throw error
    }
    await new Promise((resolvePromise) => { setTimeout(resolvePromise, 250) })
  }
}

async function record(path: string, message: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${new Date().toISOString()} ${message}\n`)
}

function describe(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
