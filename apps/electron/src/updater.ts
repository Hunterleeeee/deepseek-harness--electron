/** Local source updater that stages verified desktop builds without touching the user's checkout. */

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import { access, cp, lstat, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify, stripVTControlCharacters } from 'node:util'
import { app, shell } from 'electron'
import type { DesktopUpdateSnapshot } from './protocol.ts'
import { UPDATE_OVERLAY_ENTRIES } from './update-overlay.ts'
import {
  OFFICIAL_REPOSITORY,
  parseOfficialRemoteHead,
  type OfficialRemoteHead,
} from './updater-remote.ts'

const UPDATE_STEP_COUNT = 6
const MAX_LOG_LINES = 300
const REMOTE_CHECK_TIMEOUT_MS = 30_000
const LOG_PUBLISH_INTERVAL_MS = 100
const MANAGED_MARKER = 'deepseek-harness-electron-managed-v1\n'
const SUPPORTED_LOGIN_SHELLS: ReadonlySet<string> = new Set(['/bin/bash', '/bin/zsh'])
const execFileAsync = promisify(execFile)

interface DesktopUpdaterOptions {
  currentCommit: string
  updateRoot: string
  overlayRoot: string
  currentExecutable: string
}

interface ReplacementPlan {
  parentPid: number
  currentApp: string
  stagedApp: string
  backupApp: string
  logFile: string
}

/** Build and install official Harness updates through a private managed checkout. */
export class DesktopUpdater {
  private readonly subscribers = new Set<(snapshot: DesktopUpdateSnapshot) => void>()
  private readonly managedRoot: string
  private readonly markerPath: string
  private readonly currentApp: string | undefined
  private activeChild: ChildProcess | undefined
  private job: Promise<void> | undefined
  private logPublishTimer: NodeJS.Timeout | undefined
  private pnpmPath: string | undefined
  private stagedApp: string | undefined
  private stagedDmg: string | undefined
  private officialBranch: string | undefined
  private snapshot: DesktopUpdateSnapshot

  /**
   * Create one application-owned updater.
   * @param options - immutable build identity and application-owned filesystem paths.
   */
  constructor(private readonly options: DesktopUpdaterOptions) {
    this.managedRoot = join(options.updateRoot, 'source')
    this.markerPath = join(this.managedRoot, '.dsh-electron-managed')
    this.currentApp = appBundleFromExecutable(options.currentExecutable)
    this.snapshot = {
      phase: 'idle',
      message: '尚未检查上游更新',
      currentCommit: options.currentCommit,
      latestCommit: undefined,
      checkedAt: undefined,
      step: 0,
      stepCount: UPDATE_STEP_COUNT,
      logs: [],
      canInstall: false,
      error: undefined,
    }
  }

  /** @returns a defensive copy of the latest renderer-safe state. */
  getSnapshot(): DesktopUpdateSnapshot {
    return { ...this.snapshot, logs: [...this.snapshot.logs] }
  }

  /**
   * Subscribe to updater state transitions.
   * @param listener - receives an immutable snapshot after every transition.
   * @returns disposer for this subscription.
   */
  subscribe(listener: (snapshot: DesktopUpdateSnapshot) => void): () => void {
    this.subscribers.add(listener)
    return () => { this.subscribers.delete(listener) }
  }

  /** Query the official branch without mutating the user checkout. */
  async check(): Promise<DesktopUpdateSnapshot> {
    if (this.job !== undefined) return this.getSnapshot()
    const job = this.checkRemote()
    this.job = job
    try {
      await job
    } finally {
      if (this.job === job) this.job = undefined
    }
    return this.getSnapshot()
  }

  private async checkRemote(): Promise<void> {
    this.publish({
      phase: 'checking',
      message: '正在检查 DeepSeek 官方仓库…',
      step: 0,
      error: undefined,
      canInstall: false,
    })
    try {
      const remote = await remoteHead()
      this.officialBranch = remote.branch
      const available = remote.commit !== this.options.currentCommit
      this.publish({
        phase: available ? 'available' : 'up-to-date',
        message: available ? '发现新的 Harness 源码' : '当前已经是最新版本',
        latestCommit: remote.commit,
        checkedAt: new Date().toISOString(),
        step: 0,
        error: undefined,
        canInstall: false,
      })
    } catch (error) {
      this.fail(error, '检查更新失败')
    }
  }

  /** Start a single background build and return immediately with its initial state. */
  start(): DesktopUpdateSnapshot {
    if (this.job !== undefined) return this.getSnapshot()
    const target = this.snapshot.latestCommit
    if (target === undefined || target === this.options.currentCommit) {
      throw new Error('desktop updater: no newer official commit is selected')
    }
    this.stagedApp = undefined
    this.stagedDmg = undefined
    this.publish({
      phase: 'preparing',
      message: '正在准备托管源码目录…',
      step: 1,
      logs: [],
      error: undefined,
      canInstall: false,
    })
    this.job = this.build(target)
      .catch((error: unknown) => { this.fail(error, '更新构建失败') })
      .finally(() => { this.job = undefined })
    return this.getSnapshot()
  }

  /** Reveal the verified disk image, or the staged application when no image exists. */
  reveal(): void {
    const target = this.stagedDmg ?? this.stagedApp
    if (this.snapshot.phase !== 'ready' || target === undefined) {
      throw new Error('desktop updater: no verified update is ready to reveal')
    }
    shell.showItemInFolder(target)
  }

  /** Launch the detached replacement helper, then quit the current application. */
  install(): DesktopUpdateSnapshot {
    if (this.snapshot.phase !== 'ready' || !this.snapshot.canInstall
      || this.stagedApp === undefined || this.currentApp === undefined) {
      throw new Error('desktop updater: the verified update cannot replace this application location')
    }
    const helperPath = fileURLToPath(new URL('./update-helper.js', import.meta.url))
    const backupApp = join(this.options.updateRoot, 'backup', 'DeepSeek Harness.app')
    const plan: ReplacementPlan = {
      parentPid: process.pid,
      currentApp: this.currentApp,
      stagedApp: this.stagedApp,
      backupApp,
      logFile: join(this.options.updateRoot, 'replace.log'),
    }
    const child = spawn(process.execPath, [helperPath, JSON.stringify(plan)], {
      detached: true,
      stdio: 'ignore',
      env: { ...scrubEnvironment(), ELECTRON_RUN_AS_NODE: '1' },
    })
    child.unref()
    this.publish({ phase: 'installing', message: '正在退出并安装新版…', canInstall: false })
    setTimeout(() => { app.quit() }, 150)
    return this.getSnapshot()
  }

  /** Stop an active build subprocess and release renderer subscriptions. */
  dispose(): void {
    this.activeChild?.kill('SIGTERM')
    this.activeChild = undefined
    if (this.logPublishTimer !== undefined) clearTimeout(this.logPublishTimer)
    this.logPublishTimer = undefined
    this.subscribers.clear()
  }

  private async build(target: string): Promise<void> {
    await this.assertOverlay()
    await mkdir(this.options.updateRoot, { recursive: true })
    this.pnpmPath = await locatePnpm()
    await this.runPnpm(['--version'], this.options.updateRoot)
    await this.ensureManagedCheckout()

    this.publish({ phase: 'syncing', message: '正在同步官方源码并应用桌面壳…', step: 2 })
    const branch = this.officialBranch ?? (await remoteHead()).branch
    await this.runGit(['fetch', '--prune', 'origin', branch], this.managedRoot)
    await this.runGit(['checkout', '--force', '--detach', target], this.managedRoot)
    await this.applyOverlay()

    this.publish({ phase: 'installing-dependencies', message: '正在安装新版依赖…', step: 3 })
    await this.runPnpm(
      ['install', '--no-frozen-lockfile', '--fetch-timeout=300000', '--network-concurrency=4'],
      this.managedRoot,
    )

    this.publish({ phase: 'building', message: '正在编译 Harness…', step: 4 })
    await this.runPnpm(['run', 'clean'], this.managedRoot)
    await this.runPnpm(['run', 'build'], this.managedRoot)

    this.publish({ phase: 'packaging', message: '正在生成新版桌面应用…', step: 5 })
    await this.runPnpm(['--filter', '@deepseek-ai/dsh-electron', 'run', 'dist:mac'], this.managedRoot)

    const appPath = join(this.managedRoot, 'apps', 'electron', 'release', 'mac-arm64', 'DeepSeek Harness.app')
    const dmgPath = join(this.managedRoot, 'apps', 'electron', 'release', 'DeepSeek Harness-0.1.0-local.1-arm64.dmg')
    await access(appPath, fsConstants.R_OK)
    await access(dmgPath, fsConstants.R_OK)
    this.publish({ phase: 'verifying', message: '正在启动新版并执行兼容性检查…', step: 6 })
    await this.runPnpm(
      ['--filter', '@deepseek-ai/dsh-electron', 'exec', 'tsx', 'scripts/verify-packaged.ts',
        'release/mac-arm64/DeepSeek Harness.app'],
      join(this.managedRoot, 'apps', 'electron'),
    )
    this.stagedApp = appPath
    this.stagedDmg = dmgPath
    const canInstall = await this.canReplaceCurrentApp()
    this.publish({
      phase: 'ready',
      message: canInstall ? '新版已构建并验证，可以安装' : '新版已构建并验证，请在访达中手动安装',
      step: UPDATE_STEP_COUNT,
      canInstall,
      error: undefined,
    })
  }

  private async assertOverlay(): Promise<void> {
    const manifest = join(this.options.overlayRoot, 'package.json')
    await access(manifest, fsConstants.R_OK)
  }

  private async ensureManagedCheckout(): Promise<void> {
    if (await exists(this.managedRoot)) {
      const managedStat = await lstat(this.managedRoot)
      if (!managedStat.isDirectory() || managedStat.isSymbolicLink()) {
        throw new Error(`托管源码路径不是应用创建的目录，拒绝修改：${this.managedRoot}`)
      }
      const marker = await readFile(this.markerPath, 'utf8').catch(() => '')
      if (marker !== MANAGED_MARKER) {
        throw new Error(`托管源码目录缺少所有权标记，拒绝修改：${this.managedRoot}`)
      }
      const remote = (await this.captureGit(['remote', 'get-url', 'origin'], this.managedRoot)).trim()
      if (normalizeRepository(remote) !== normalizeRepository(OFFICIAL_REPOSITORY)) {
        throw new Error(`托管源码目录指向了非官方仓库：${remote}`)
      }
      return
    }
    await mkdir(dirname(this.managedRoot), { recursive: true })
    try {
      await this.runGit(
        ['clone', '--filter=blob:none', '--no-checkout', OFFICIAL_REPOSITORY, this.managedRoot],
        dirname(this.managedRoot),
      )
      await writeFile(this.markerPath, MANAGED_MARKER)
    } catch (error) {
      await rm(this.managedRoot, { recursive: true, force: true })
      throw error
    }
  }

  private async applyOverlay(): Promise<void> {
    const target = join(this.managedRoot, 'apps', 'electron')
    assertManagedChild(this.managedRoot, target)
    await rm(target, { recursive: true, force: true })
    await mkdir(target, { recursive: true })
    for (const entry of UPDATE_OVERLAY_ENTRIES) {
      await cp(join(this.options.overlayRoot, entry), join(target, entry), { recursive: true })
    }

    const workspacePath = join(this.managedRoot, 'pnpm-workspace.yaml')
    let workspace = await readFile(workspacePath, 'utf8')
    const marker = 'allowBuilds:\n'
    const index = workspace.indexOf(marker)
    if (index < 0 || workspace.indexOf(marker, index + marker.length) >= 0) {
      throw new Error('官方 pnpm-workspace.yaml 缺少唯一的 allowBuilds 配置')
    }
    const entries = [
      ['electron', 'true'],
      ['electron-winstaller', 'false'],
    ] as const
    for (const [name, value] of entries) {
      const entry = `  ${name}: ${value}\n`
      if (!workspace.includes(entry)) workspace = workspace.replace(marker, `${marker}${entry}`)
    }
    await writeFile(workspacePath, workspace)
  }

  private async canReplaceCurrentApp(): Promise<boolean> {
    if (this.currentApp === undefined || this.currentApp.startsWith(`/Volumes${sep}`)) return false
    try {
      await access(dirname(this.currentApp), fsConstants.W_OK)
      return true
    } catch {
      return false
    }
  }

  private async runGit(args: string[], cwd: string): Promise<void> {
    await this.runCommand('/usr/bin/git', args, cwd)
  }

  private async captureGit(args: string[], cwd: string): Promise<string> {
    const result = await execFileAsync('/usr/bin/git', args, {
      cwd,
      encoding: 'utf8',
      env: scrubEnvironment(this.pnpmPath),
    })
    return result.stdout
  }

  private async runPnpm(args: string[], cwd: string): Promise<void> {
    if (this.pnpmPath === undefined) throw new Error('desktop updater: pnpm has not been resolved')
    await this.runCommand(this.pnpmPath, args, cwd)
  }

  private runCommand(file: string, args: string[], cwd: string): Promise<void> {
    this.appendLog(`$ ${commandLabel(file, args)}`)
    return new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn(file, args, { cwd, env: scrubEnvironment(this.pnpmPath) })
      this.activeChild = child
      const stdout = new LineBuffer((line) => { this.appendLog(line) })
      const stderr = new LineBuffer((line) => { this.appendLog(line) })
      child.stdout.on('data', (chunk: Buffer) => { stdout.push(chunk) })
      child.stderr.on('data', (chunk: Buffer) => { stderr.push(chunk) })
      child.once('error', rejectPromise)
      child.once('close', (code, signal) => {
        stdout.flush()
        stderr.flush()
        if (this.activeChild === child) this.activeChild = undefined
        if (code === 0) {
          resolvePromise()
        } else {
          rejectPromise(new Error(`${commandLabel(file, args)} exited with ${code === null ? signal : String(code)}`))
        }
      })
    })
  }

  private appendLog(line: string): void {
    const clean = stripVTControlCharacters(line).replaceAll(this.managedRoot, '<managed-source>')
    const logs = [...this.snapshot.logs, clean].slice(-MAX_LOG_LINES)
    this.snapshot = { ...this.snapshot, logs }
    if (this.logPublishTimer !== undefined) return
    this.logPublishTimer = setTimeout(() => {
      this.logPublishTimer = undefined
      this.emit()
    }, LOG_PUBLISH_INTERVAL_MS)
  }

  private fail(error: unknown, message: string): void {
    const detail = error instanceof Error ? error.message : String(error)
    this.appendLog(`${message}: ${detail}`)
    this.publish({ phase: 'error', message, error: detail, canInstall: false })
  }

  private publish(patch: Partial<DesktopUpdateSnapshot>): void {
    if (this.logPublishTimer !== undefined) clearTimeout(this.logPublishTimer)
    this.logPublishTimer = undefined
    this.snapshot = { ...this.snapshot, ...patch }
    this.emit()
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    for (const listener of [...this.subscribers]) listener(snapshot)
  }
}

class LineBuffer {
  private rest = ''

  constructor(private readonly emit: (line: string) => void) {}

  push(chunk: Buffer): void {
    const parts = (this.rest + chunk.toString('utf8')).split(/\r?\n/u)
    this.rest = parts.pop() ?? ''
    for (const line of parts) if (line !== '') this.emit(line)
  }

  flush(): void {
    if (this.rest !== '') this.emit(this.rest)
    this.rest = ''
  }
}

async function remoteHead(): Promise<OfficialRemoteHead> {
  const result = await execFileAsync(
    '/usr/bin/git',
    ['ls-remote', '--symref', OFFICIAL_REPOSITORY, 'HEAD'],
    { encoding: 'utf8', timeout: REMOTE_CHECK_TIMEOUT_MS, env: scrubEnvironment() },
  ).catch((error: unknown) => { throw remoteCheckFailure(error) })
  return parseOfficialRemoteHead(result.stdout)
}

function remoteCheckFailure(error: unknown): Error {
  if (error instanceof Error && 'killed' in error && error.killed === true) {
    return new Error('连接 DeepSeek 官方仓库超时，请检查网络或代理后重试', { cause: error })
  }
  const stderr = error instanceof Error && 'stderr' in error && typeof error.stderr === 'string'
    ? error.stderr.trim()
    : ''
  const detail = stderr !== '' ? stderr : error instanceof Error ? error.message : String(error)
  return new Error(`无法访问 DeepSeek 官方仓库：${detail}`, { cause: error })
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false
    throw error
  }
}

function assertManagedChild(parent: string, target: string): void {
  const prefix = `${resolve(parent)}${sep}`
  if (!resolve(target).startsWith(prefix)) {
    throw new Error(`desktop updater: managed target escaped ${parent}`)
  }
}

function appBundleFromExecutable(executable: string): string | undefined {
  const normalized = resolve(executable)
  const marker = `.app${sep}Contents${sep}MacOS${sep}`
  const index = normalized.indexOf(marker)
  return index < 0 ? undefined : normalized.slice(0, index + 4)
}

function normalizeRepository(value: string): string {
  return value.trim().replace(/^git@github\.com:/u, 'https://github.com/').replace(/\.git\/?$/u, '').toLowerCase()
}

function commandLabel(file: string, args: string[]): string {
  return [file, ...args].join(' ')
}

/** @returns pnpm resolved through the user's supported login shell. */
export async function locatePnpm(): Promise<string> {
  const configured = process.env.SHELL
  const shell = configured !== undefined && SUPPORTED_LOGIN_SHELLS.has(configured)
    ? configured
    : '/bin/zsh'
  const locator = shell === '/bin/zsh' ? 'whence -p pnpm' : 'type -P pnpm'
  const result = await execFileAsync(shell, ['-lic', locator], {
    encoding: 'utf8',
    env: scrubEnvironment(),
  })
  const candidates = result.stdout.split(/\r?\n/u).filter(line => line.startsWith('/'))
  for (const candidate of candidates.toReversed()) {
    try {
      await access(candidate, fsConstants.X_OK)
      return candidate
    } catch {
      // Login-shell startup output may contain unrelated absolute paths.
    }
  }
  throw new Error('找不到 pnpm；请先安装 pnpm，并确保 Bash 或 Zsh 登录 shell 可以访问它')
}

/**
 * Build the credential-scrubbed environment used for updater-owned subprocesses.
 * @param pnpmPath - optional executable whose directory must be added to PATH.
 * @returns A detached process environment without credential-named variables.
 */
export function scrubEnvironment(pnpmPath?: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name, value]) => (
      value !== undefined && !/(?:KEY|SECRET|TOKEN|PASSWORD)/iu.test(name)
    )),
  )
  environment.CI = 'true'
  environment.NPM_CONFIG_USERCONFIG = '/dev/null'
  if (pnpmPath !== undefined) {
    environment.PATH = [dirname(pnpmPath), environment.PATH, '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
      .filter((entry): entry is string => entry !== undefined && entry !== '')
      .join(delimiter)
  }
  return environment
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
