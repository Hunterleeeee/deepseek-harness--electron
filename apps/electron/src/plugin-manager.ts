/** Electron-owned update checks and deliberate upgrades for profile-installed plugins. */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { app } from 'electron'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { HarnessRuntime } from './harness-runtime.ts'
import type {
  DesktopPluginPackage,
  DesktopPluginSnapshot,
} from './protocol.ts'
import { locatePnpm, scrubEnvironment } from './updater.ts'

const MAX_COMMAND_OUTPUT_BYTES = 4 * 1024 * 1024

interface DesktopPluginManagerOptions {
  runtime: Promise<HarnessRuntime>
  backupRoot: string
}

interface OutdatedRow {
  current: string
  latest: string
}

/** Inspect, check, and update the external dependencies of the Electron profile. */
export class DesktopPluginManager {
  private readonly subscribers = new Set<(snapshot: DesktopPluginSnapshot) => void>()
  private readonly latestVersions = new Map<string, string>()
  private activeChild: ChildProcess | undefined
  private job: Promise<DesktopPluginSnapshot> | undefined
  private inventoryLoaded = false
  private disposed = false
  private snapshot: DesktopPluginSnapshot = {
    phase: 'idle',
    message: '插件信息尚未读取',
    checkedAt: undefined,
    busyPackage: undefined,
    restartRequired: false,
    error: undefined,
    packages: [],
  }

  constructor(private readonly options: DesktopPluginManagerOptions) {}

  /** @returns a fresh inventory combined with the latest known registry versions. */
  async getSnapshot(): Promise<DesktopPluginSnapshot> {
    if (!this.inventoryLoaded) await this.refreshInventory()
    return cloneSnapshot(this.snapshot)
  }

  /**
   * Subscribe to plugin-manager state transitions.
   * @param listener - receives a detached snapshot after each transition.
   * @returns disposer for the subscription.
   */
  subscribe(listener: (snapshot: DesktopPluginSnapshot) => void): () => void {
    this.subscribers.add(listener)
    return () => { this.subscribers.delete(listener) }
  }

  /** Check registry-backed profile dependencies without changing installed packages. */
  async check(): Promise<DesktopPluginSnapshot> {
    if (this.job !== undefined) return this.job
    const job = this.checkNow()
    this.job = job
    try {
      return await job
    } finally {
      if (this.job === job) this.job = undefined
    }
  }

  private async checkNow(): Promise<DesktopPluginSnapshot> {
    await this.refreshInventory()
    const registryPackages = this.snapshot.packages
      .filter(plugin => plugin.source === 'profile' && plugin.updateKind === 'registry')
      .map(plugin => plugin.packageName)
    if (registryPackages.length === 0) {
      this.publish({
        phase: 'ready',
        message: '内置插件随 Harness 更新；当前没有可独立检查的外部插件',
        checkedAt: new Date().toISOString(),
        error: undefined,
      })
      return cloneSnapshot(this.snapshot)
    }

    this.publish({
      phase: 'checking',
      message: `正在检查 ${String(registryPackages.length)} 个外部插件…`,
      busyPackage: undefined,
      error: undefined,
    })
    try {
      const runtime = await this.options.runtime
      const pnpm = await locatePnpm()
      const result = await this.runCommand(
        pnpm,
        ['outdated', '--prod', '--format', 'json', '--color=false', ...registryPackages],
        runtime.profileDir,
      )
      const outdated = parseOutdated(result.stdout)
      this.latestVersions.clear()
      for (const [packageName, row] of outdated) this.latestVersions.set(packageName, row.latest)
      await this.refreshInventory()
      const count = this.snapshot.packages.filter(plugin => plugin.latestVersion !== undefined).length
      this.publish({
        phase: 'ready',
        message: count === 0 ? '外部插件已是最新版本' : `发现 ${String(count)} 个外部插件更新`,
        checkedAt: new Date().toISOString(),
        error: undefined,
      })
    } catch (error) {
      this.publish({
        phase: 'error',
        message: '外部插件更新检查失败',
        error: describe(error),
      })
    }
    return cloneSnapshot(this.snapshot)
  }

  /**
   * Update one exact registry-backed profile dependency and retain its previous lock state.
   * @param packageName - package name selected from the current inventory.
   * @returns state requiring an application restart after a successful update.
   */
  async update(packageName: string): Promise<DesktopPluginSnapshot> {
    if (this.job !== undefined) return this.job
    const job = this.updateNow(packageName)
    this.job = job
    try {
      return await job
    } finally {
      if (this.job === job) this.job = undefined
    }
  }

  private async updateNow(packageName: string): Promise<DesktopPluginSnapshot> {
    await this.refreshInventory()
    const plugin = this.snapshot.packages.find(candidate => candidate.packageName === packageName)
    if (plugin === undefined || plugin.source !== 'profile') {
      throw new Error(`plugin manager: ${JSON.stringify(packageName)} is not a profile dependency`)
    }
    if (plugin.updateKind !== 'registry') {
      throw new Error(`plugin manager: ${JSON.stringify(packageName)} is not registry-managed`)
    }
    if (plugin.latestVersion === undefined) {
      throw new Error(`plugin manager: ${JSON.stringify(packageName)} has no checked update`)
    }

    this.publish({
      phase: 'updating',
      message: `正在更新 ${packageName}…`,
      busyPackage: packageName,
      error: undefined,
    })
    const runtime = await this.options.runtime
    const pnpm = await locatePnpm()
    const backup = await this.backupProfile(runtime.profileDir, packageName, plugin)
    try {
      await this.runCommand(
        pnpm,
        ['update', '--prod', '--latest', '--color=false', packageName],
        runtime.profileDir,
      )
      await reconcileBundle(runtime.profileDir, packageName)
      this.latestVersions.delete(packageName)
      await this.refreshInventory()
      this.publish({
        phase: 'restart-required',
        message: `${packageName} 已更新，重启后生效`,
        busyPackage: undefined,
        restartRequired: true,
        error: undefined,
      })
    } catch (error) {
      try {
        await restoreProfile(runtime.profileDir, backup)
        await this.runCommand(
          pnpm,
          ['install', '--prod', '--offline', '--frozen-lockfile', '--color=false'],
          runtime.profileDir,
        )
      } catch (rollbackError) {
        this.publish({
          phase: 'error',
          message: `${packageName} 更新失败，自动回滚也未完成`,
          busyPackage: undefined,
          error: describe(new AggregateError([error, rollbackError])),
        })
        return cloneSnapshot(this.snapshot)
      }
      await this.refreshInventory()
      this.publish({
        phase: 'error',
        message: `${packageName} 更新失败，已恢复更新前版本`,
        busyPackage: undefined,
        error: describe(error),
      })
    }
    return cloneSnapshot(this.snapshot)
  }

  /** Restart only after a successful profile update requires a new process. */
  restart(): void {
    if (!this.snapshot.restartRequired) throw new Error('plugin manager: no plugin update requires a restart')
    app.relaunch()
    app.exit(0)
  }

  /** Stop the owned subprocess, await settlement, then silence subscribers. */
  async dispose(): Promise<void> {
    this.disposed = true
    this.activeChild?.kill('SIGTERM')
    await this.job?.catch(() => undefined)
    this.subscribers.clear()
  }

  private async refreshInventory(): Promise<void> {
    const packages = await (await this.options.runtime).pluginInventory()
    this.inventoryLoaded = true
    this.snapshot = {
      ...this.snapshot,
      packages: packages.map(plugin => ({
        ...plugin,
        latestVersion: this.latestVersions.get(plugin.packageName),
      })),
    }
  }

  private publish(patch: Partial<DesktopPluginSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    if (this.disposed) return
    const snapshot = cloneSnapshot(this.snapshot)
    for (const listener of [...this.subscribers]) {
      try {
        listener(snapshot)
      } catch (error) {
        console.error('desktop plugin-manager subscriber failed', error)
      }
    }
  }

  private async backupProfile(
    profileDir: string,
    packageName: string,
    plugin: DesktopPluginPackage,
  ): Promise<ProfileBackup> {
    const timestamp = new Date().toISOString().replaceAll(':', '-')
    const safeName = packageName.replaceAll('/', '__').replaceAll('@', '')
    const dir = join(this.options.backupRoot, `${timestamp}-${safeName}`)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    const manifestPath = join(profileDir, 'package.json')
    const lockPath = join(profileDir, 'pnpm-lock.yaml')
    const lockExists = await exists(lockPath)
    await copyFile(manifestPath, join(dir, 'package.json'))
    if (lockExists) await copyFile(lockPath, join(dir, 'pnpm-lock.yaml'))
    await writeFile(join(dir, 'update.json'), JSON.stringify({
      packageName,
      previousVersion: plugin.version,
      targetVersion: plugin.latestVersion,
      createdAt: new Date().toISOString(),
    }, undefined, 2) + '\n', { mode: 0o600 })
    return { dir, lockExists }
  }

  private runCommand(file: string, args: string[], cwd: string): Promise<CommandResult> {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawn(file, args, { cwd, env: scrubEnvironment(file) })
      this.activeChild = child
      let stdout = ''
      let stderr = ''
      let outputExceeded = false
      let settled = false
      const append = (current: string, chunk: Buffer): string => {
        const next = current + chunk.toString('utf8')
        if (!outputExceeded && Buffer.byteLength(next) > MAX_COMMAND_OUTPUT_BYTES) {
          outputExceeded = true
          child.kill('SIGTERM')
          return current
        }
        return next
      }
      child.stdout.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk) })
      child.stderr.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk) })
      child.once('error', (error) => {
        if (settled) return
        settled = true
        if (this.activeChild === child) this.activeChild = undefined
        rejectPromise(error)
      })
      child.once('close', (code, signal) => {
        if (this.activeChild === child) this.activeChild = undefined
        if (settled) return
        settled = true
        if (outputExceeded) {
          rejectPromise(new Error('plugin manager: pnpm output exceeded 4 MiB'))
        } else if (code === 0) {
          resolvePromise({ stdout: stripVTControlCharacters(stdout), stderr: stripVTControlCharacters(stderr) })
        } else {
          const detail = stripVTControlCharacters(stderr).trim().split(/\r?\n/u).slice(-8).join('\n')
          rejectPromise(new Error(
            `${basename(file)} exited with ${code === null ? signal : String(code)}${detail === '' ? '' : `: ${detail}`}`,
          ))
        }
      })
    })
  }
}

interface CommandResult {
  stdout: string
  stderr: string
}

interface ProfileBackup {
  dir: string
  lockExists: boolean
}

async function restoreProfile(profileDir: string, backup: ProfileBackup): Promise<void> {
  await writeFileAtomic(
    join(profileDir, 'package.json'),
    await readFile(join(backup.dir, 'package.json'), 'utf8'),
    { mode: 0o600, dirMode: 0o700 },
  )
  const lockPath = join(profileDir, 'pnpm-lock.yaml')
  if (backup.lockExists) {
    await writeFileAtomic(lockPath, await readFile(join(backup.dir, 'pnpm-lock.yaml'), 'utf8'), {
      mode: 0o600,
      dirMode: 0o700,
    })
  } else {
    await rm(lockPath, { force: true })
  }
}

/** Keep the profile's bundle layer list synchronized with the updated package manifest. */
async function reconcileBundle(profileDir: string, packageName: string): Promise<void> {
  const profilePath = join(profileDir, 'package.json')
  const profile = parseJsonObject(await readFile(profilePath, 'utf8'), profilePath)
  const packageDir = packageDirFromAnchor(profilePath, packageName)
  if (packageDir === undefined) throw new Error(`plugin manager: updated package is not resolvable: ${packageName}`)
  const packagePath = join(packageDir, 'package.json')
  const installed = parseJsonObject(await readFile(packagePath, 'utf8'), packagePath)
  const exportsBundle = isRecord(installed.dsh)
    && isRecord(installed.dsh.bundle)
    && typeof installed.dsh.bundle.patch === 'string'
  const dsh = isRecord(profile.dsh) ? profile.dsh : {}
  const profileSection = isRecord(dsh.profile) ? dsh.profile : {}
  const bundles = Array.isArray(profileSection.bundles)
    && profileSection.bundles.every(value => typeof value === 'string')
    ? [...profileSection.bundles]
    : []
  const index = bundles.indexOf(packageName)
  if (exportsBundle && index < 0) bundles.push(packageName)
  if (!exportsBundle && index >= 0) bundles.splice(index, 1)
  const next = { ...profile, dsh: { ...dsh, profile: { ...profileSection, bundles } } }
  await writeFileAtomic(profilePath, JSON.stringify(next, undefined, 2) + '\n', { mode: 0o600, dirMode: 0o700 })
}

function parseOutdated(raw: string): Map<string, OutdatedRow> {
  const value: unknown = JSON.parse(raw === '' ? '{}' : raw)
  if (!isRecord(value)) throw new Error('plugin manager: pnpm outdated returned a non-object result')
  const result = new Map<string, OutdatedRow>()
  for (const [packageName, row] of Object.entries(value)) {
    if (!isRecord(row) || typeof row.current !== 'string' || typeof row.latest !== 'string') continue
    if (row.current !== row.latest) result.set(packageName, { current: row.current, latest: row.latest })
  }
  return result
}

function parseJsonObject(raw: string, path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value)) throw new Error(`plugin manager: ${path} must contain a JSON object`)
  return value
}

function packageDirFromAnchor(anchor: string, packageName: string): string | undefined {
  for (const searchPath of createRequire(anchor).resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, packageName)
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return undefined
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

function cloneSnapshot(snapshot: DesktopPluginSnapshot): DesktopPluginSnapshot {
  return structuredClone(snapshot)
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
