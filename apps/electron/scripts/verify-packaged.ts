/** Verify the packaged desktop dependency closure, renderer transport, and shutdown lifecycle. */

import { strict as assert } from 'node:assert'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const START_TIMEOUT_MS = 30_000
const EXIT_TIMEOUT_MS = 15_000
const CHECK_UPDATES = process.argv.includes('--check-update')
const appDir = fileURLToPath(new URL('..', import.meta.url))
const appBundle = process.argv[2] === undefined
  ? join(appDir, 'release', 'mac-arm64', 'DeepSeek Harness.app')
  : resolve(process.argv[2])
const executable = join(appBundle, 'Contents', 'MacOS', 'DeepSeek Harness')
const packagedRoot = join(appBundle, 'Contents', 'Resources', 'app')

interface PackageManifest {
  name?: string
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

interface SmokeReport {
  title: string
  bootEntries: number
  harnessCommit: string
  upstreamCommit: string
  hostStatus: number
  hostOk: boolean
  sessionStatus: number
  sessionOk: boolean
  sessionCount: number
  hostStream: string
  updateControl: boolean
  updateDialog: boolean
  updatePhase: string
  pluginControl: boolean
  pluginDialog: boolean
  pluginPackages: number
  pluginEntries: number
  pluginExplanation: boolean
  pluginCountClarity: boolean
  mcpDialog: boolean
  mcpCount: number
  artifactPreview: boolean
  trajectoryLocalization: boolean
  trajectoryLanguageControl: boolean
  trajectoryLanguageIsolation: boolean
  trajectoryLearning: boolean
  updateCheckPhase?: 'available' | 'up-to-date'
}

interface SmokeEvaluation {
  value: unknown
  debuggerUrl: string
}

async function main(): Promise<void> {
  assert(existsSync(executable), `packaged Electron executable is missing: ${executable}`)
  const buildInfo = parseBuildInfo(JSON.parse(await readFile(join(packagedRoot, 'dist', 'build-info.json'), 'utf8')))
  const packageCount = await verifyPeerClosure()
  assert(
    existsSync(join(packagedRoot, 'node_modules', 'node-pty', 'build', 'Release', 'pty.node')),
    'packaged node-pty arm64 binary is missing',
  )
  assert(
    existsSync(join(appBundle, 'Contents', 'Resources', 'update-overlay', 'apps', 'electron', 'package.json')),
    'packaged desktop update overlay is missing',
  )
  assert(
    existsSync(join(
      appBundle,
      'Contents',
      'Resources',
      'update-overlay',
      'apps',
      'electron',
      'tsconfig.tests.json',
    )),
    'packaged desktop update overlay omitted the test typecheck configuration',
  )
  assert(
    existsSync(join(appBundle, 'Contents', 'Resources', 'update-overlay', 'apps', 'electron', 'tests')),
    'packaged desktop update overlay omitted its focused tests',
  )
  const licenseNotice = await readFile(join(appBundle, 'Contents', 'Resources', 'LICENSE.txt'), 'utf8')
  assert(licenseNotice.startsWith('MIT License\n'), 'packaged DeepSeek Harness license notice is invalid')

  const smoke = await runSmoke()
  assert(smoke.bootEntries > 0, 'packaged renderer received an empty client plugin graph')
  assert.equal(smoke.harnessCommit, buildInfo.harnessCommit, 'renderer build commit differs from packaged build-info')
  assert.equal(smoke.upstreamCommit, buildInfo.upstreamCommit, 'renderer upstream commit differs from packaged build-info')
  assert.equal(smoke.hostStatus, 200, 'host.describe did not return HTTP 200')
  assert(smoke.hostOk, 'host.describe returned a Harness error')
  assert.equal(smoke.sessionStatus, 200, 'session.list did not return HTTP 200')
  assert(smoke.sessionOk, 'session.list returned a Harness error')
  assert.equal(smoke.hostStream, 'open', 'Host event stream did not open')
  assert(smoke.updateControl, 'packaged renderer did not mount the desktop update control')
  assert(smoke.updateDialog, 'packaged renderer did not open the desktop update dialog')
  assert.equal(smoke.updatePhase, 'idle', 'desktop updater did not start in the idle phase')
  assert(smoke.pluginControl, 'packaged renderer did not mount the desktop plugin center control')
  assert(smoke.pluginDialog, 'packaged renderer did not open the desktop plugin center')
  assert(smoke.pluginPackages > 0, 'desktop plugin center received an empty package inventory')
  assert(smoke.pluginEntries >= smoke.pluginPackages, 'desktop plugin inventory lost Loader entries')
  assert(smoke.pluginExplanation, 'desktop plugin center did not render the Chinese explanation layer')
  assert(smoke.pluginCountClarity, 'desktop plugin center conflated Loader-entry and package counts')
  assert(smoke.mcpDialog, 'packaged renderer did not open the MCP configuration dialog')
  assert(smoke.mcpCount >= 0, 'packaged renderer returned an invalid MCP configuration count')
  assert(smoke.artifactPreview, 'desktop produced-file flow did not open the in-app artifact preview')
  assert(smoke.trajectoryLocalization, 'desktop renderer did not localize the Trajectory surface')
  assert(smoke.trajectoryLanguageControl, 'desktop renderer did not mount the Trajectory language control')
  assert(smoke.trajectoryLanguageIsolation, 'Trajectory language control changed the application locale')
  assert(smoke.trajectoryLearning, 'desktop renderer did not explain the selected Trajectory record')

  console.log(JSON.stringify({
    desktopVersion: buildInfo.desktopVersion,
    harnessVersion: buildInfo.harnessVersion,
    packagedPackages: packageCount,
    licenseNotice: true,
    ...smoke,
    shutdown: 'clean',
  }, undefined, 2))
}

async function verifyPeerClosure(): Promise<number> {
  const packageDirs: string[] = []
  await collectPackageDirs(join(packagedRoot, 'node_modules'), packageDirs)
  const missing: string[] = []
  for (const packageDir of packageDirs) {
    const manifest = parsePackageManifest(JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')))
    for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
      if (manifest.peerDependenciesMeta?.[peer]?.optional === true) continue
      if (!resolvesPackagedPeer(packageDir, peer)) {
        missing.push(`${manifest.name ?? packageDir} -> ${peer}`)
      }
    }
  }
  assert.equal(
    missing.length,
    0,
    `packaged peer dependency closure is incomplete:\n${missing.slice(0, 30).join('\n')}`,
  )
  return packageDirs.length
}

async function collectPackageDirs(nodeModules: string, result: string[]): Promise<void> {
  if (!existsSync(nodeModules)) return
  for (const entry of await readdir(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      const scope = join(nodeModules, entry.name)
      for (const child of await readdir(scope, { withFileTypes: true })) {
        if (child.isDirectory()) await collectPackage(join(scope, child.name), result)
      }
      continue
    }
    await collectPackage(join(nodeModules, entry.name), result)
  }
}

async function collectPackage(packageDir: string, result: string[]): Promise<void> {
  if (!existsSync(join(packageDir, 'package.json'))) return
  result.push(packageDir)
  await collectPackageDirs(join(packageDir, 'node_modules'), result)
}

function resolvesPackagedPeer(packageDir: string, packageName: string): boolean {
  let cursor = packageDir
  while (cursor.startsWith(packagedRoot)) {
    if (existsSync(join(cursor, 'node_modules', ...packageName.split('/'), 'package.json'))) return true
    const parent = dirname(cursor)
    if (parent === cursor) return false
    cursor = parent
  }
  return false
}

async function runSmoke(): Promise<SmokeReport> {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-electron-smoke-'))
  const port = await reservePort()
  const child = spawn(executable, [
    `--user-data-dir=${dataDir}`,
    `--remote-debugging-port=${String(port)}`,
    '--remote-debugging-address=127.0.0.1',
    '--no-first-run',
    '--dsh-electron-smoke',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  const output = captureOutput(child)
  const exit = processExit(child)
  let stopped = false
  try {
    const evaluation = await evaluateSmoke(port, child, output)
    const report = parseSmokeReport(evaluation.value)
    if (CHECK_UPDATES) {
      report.updateCheckPhase = parseUpdateCheck(
        await evaluate(evaluation.debuggerUrl, 'window.dshDesktop.checkForUpdates()'),
      )
    }
    await evaluate(evaluation.debuggerUrl, 'window.dshDesktop.quitSmokeInstance()')
    const outcome = await withTimeout(exit, EXIT_TIMEOUT_MS, 'packaged smoke instance did not exit on request')
    stopped = true
    assert.equal(outcome.signal, null, `packaged app exited from signal ${String(outcome.signal)}\n${output()}`)
    assert.equal(outcome.code, 0, `packaged app exited with code ${String(outcome.code)}\n${output()}`)
    return report
  } finally {
    if (!stopped) {
      child.kill('SIGKILL')
      await exit.catch(() => undefined)
    }
    await rm(dataDir, { recursive: true, force: true })
  }
}

async function evaluateSmoke(port: number, child: ChildProcess, output: () => string): Promise<SmokeEvaluation> {
  let contextError: Error | undefined
  for (let attempt = 0; attempt < 5; attempt++) {
    const debuggerUrl = await waitForDebugger(port, child, output)
    try {
      return { value: await evaluate(debuggerUrl, smokeExpression()), debuggerUrl }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Execution context was destroyed')) throw error
      contextError = error
      await delay(200)
    }
  }
  throw contextError ?? new Error('packaged renderer did not retain an execution context')
}

async function reservePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address !== null && typeof address !== 'string', 'failed to reserve a local debugging port')
  await new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
  })
  return address.port
}

async function waitForDebugger(port: number, child: ChildProcess, output: () => string): Promise<string> {
  const deadline = Date.now() + START_TIMEOUT_MS
  const endpoint = `http://127.0.0.1:${String(port)}/json/list`
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`packaged app exited before its renderer became ready\n${output()}`)
    }
    try {
      const targets: unknown = await (await fetch(endpoint)).json()
      if (Array.isArray(targets)) {
        for (const target of targets) {
          if (isRecord(target)
            && target.type === 'page'
            && typeof target.url === 'string'
            && target.url.startsWith('file:')
            && typeof target.webSocketDebuggerUrl === 'string') {
            return target.webSocketDebuggerUrl
          }
        }
      }
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
    }
    await delay(200)
  }
  throw new Error(`timed out waiting for packaged renderer\n${output()}`)
}

async function evaluate(debuggerUrl: string, expression: string): Promise<unknown> {
  const socket = await openDebuggerSocket(debuggerUrl)
  try {
    const id = 1
    const response = new Promise<unknown>((resolve, reject) => {
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string') return
        const message: unknown = JSON.parse(event.data)
        if (!isRecord(message) || message.id !== id) return
        if (message.error !== undefined) {
          reject(new Error(`CDP Runtime.evaluate failed: ${JSON.stringify(message.error)}`))
          return
        }
        if (!isRecord(message.result) || !isRecord(message.result.result)) {
          reject(new Error(`CDP Runtime.evaluate returned no result: ${event.data}`))
          return
        }
        if (message.result.exceptionDetails !== undefined) {
          reject(new Error(`packaged renderer smoke threw: ${JSON.stringify(message.result.exceptionDetails)}`))
          return
        }
        resolve(message.result.result.value)
      })
    })
    socket.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, returnByValue: true },
    }))
    return await withTimeout(response, START_TIMEOUT_MS, 'packaged renderer smoke timed out')
  } finally {
    socket.close()
  }
}

async function openDebuggerSocket(debuggerUrl: string): Promise<WebSocket> {
  const socket = new WebSocket(debuggerUrl)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => { resolve() }, { once: true })
    socket.addEventListener('error', () => { reject(new Error('CDP WebSocket failed to open')) }, { once: true })
  })
  return socket
}

function smokeExpression(): string {
  return `(async () => {
    const preloadDeadline = Date.now() + 10000
    while (window.dshDesktop === undefined) {
      if (Date.now() >= preloadDeadline) throw new Error('Desktop preload bridge did not install')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const rpc = async (method, payload = {}) => {
      const response = await fetch('/api/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'electron-smoke-' + method,
          method,
          payload,
        }),
      })
      return { status: response.status, body: await response.json() }
    }
    const bootstrap = await window.dshDesktop.bootstrap()
    const transportDeadline = Date.now() + 10000
    while (window.__DSH_BOOT__ === undefined) {
      if (Date.now() >= transportDeadline) throw new Error('Desktop renderer transport did not install')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const [host, sessions, hostStream] = await Promise.all([
      rpc('host.describe'),
      rpc('session.list'),
      new Promise((resolve, reject) => {
        const socket = new WebSocket('ws://dsh.internal/api/events.host')
        const timer = setTimeout(() => reject(new Error('Host event stream did not open')), 10000)
        socket.addEventListener('open', () => {
          clearTimeout(timer)
          socket.close()
          resolve('open')
        }, { once: true })
        socket.addEventListener('error', () => {
          clearTimeout(timer)
          reject(new Error('Host event stream failed'))
        }, { once: true })
      }),
    ])
    const openSettings = async () => {
      const deadline = Date.now() + 10000
      let control
      while ((control = [...document.querySelectorAll('button[aria-haspopup="dialog"]')]
        .find(button => /设置|Settings/u.test(button.textContent ?? ''))) === undefined) {
        if (Date.now() >= deadline) throw new Error('Official settings control did not mount')
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      control.click()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    await openSettings()
    const updateDeadline = Date.now() + 10000
    let updateControl
    while ((updateControl = document.querySelector('[aria-label="检查桌面更新"]')) === null) {
      if (Date.now() >= updateDeadline) throw new Error('Desktop update control did not mount')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const updateState = await window.dshDesktop.getUpdateState()
    updateControl.click()
    await new Promise(resolve => setTimeout(resolve, 50))
    const updateDialog = document.querySelector('[role="dialog"][aria-label="桌面更新"]') !== null
    document.querySelector('[aria-label="关闭更新面板"]')?.click()
    await openSettings()
    const pluginDeadline = Date.now() + 10000
    let pluginControl
    while ((pluginControl = document.querySelector('[aria-label="打开插件中心"]')) === null) {
      if (Date.now() >= pluginDeadline) throw new Error('Desktop plugin center control did not mount')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const pluginState = await window.dshDesktop.getPluginState()
    pluginControl.click()
    await new Promise(resolve => setTimeout(resolve, 100))
    const pluginDialog = document.querySelector('[role="dialog"][aria-label="插件中心"]') !== null
    const pluginExplanation = document.body.textContent.includes('智能体循环')
    const pluginEntries = pluginState.packages.reduce((total, plugin) => total + plugin.entries.length, 0)
    const pluginCountSummary = document.querySelector('[data-dsh-plugin-count-summary]')?.textContent ?? ''
    const pluginCountClarity = document.body.textContent.includes('官方“插件列表”按 Loader 条目计数')
      && pluginCountSummary.includes(pluginState.packages.length + ' 个包')
      && pluginCountSummary.includes(pluginEntries + ' 个条目')
    document.querySelector('[aria-label="关闭插件中心"]')?.click()
    await openSettings()
    const mcpDeadline = Date.now() + 10000
    let mcpControl
    while ((mcpControl = document.querySelector('[aria-label="打开 MCP 配置"]')) === null) {
      if (Date.now() >= mcpDeadline) throw new Error('Desktop MCP configuration control did not mount')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const mcpState = await window.dshDesktop.getMcpState()
    mcpControl.click()
    await new Promise(resolve => setTimeout(resolve, 100))
    const mcpDialog = document.querySelector('[role="dialog"][aria-label="MCP 配置"]') !== null
    const mcpCount = mcpState.servers.length
    document.querySelector('[aria-label="关闭 MCP 配置"]')?.click()

    const producedFixture = document.createElement('div')
    producedFixture.setAttribute('data-produced-files-row', '')
    const producedFile = document.createElement('button')
    producedFile.type = 'button'
    producedFile.title = 'cordis.yml'
    producedFixture.append(producedFile)
    document.body.append(producedFixture)
    producedFile.click()
    const artifactPath = bootstrap.dshHome + '/profiles/electron/cordis.yml'
    const artifactOpen = await rpc('host.openPath', { path: artifactPath })
    await new Promise(resolve => setTimeout(resolve, 100))
    const artifactDrawer = document.querySelector('[data-dsh-artifact-drawer]')
    const artifactPreview = artifactOpen.body?.result?.ok === true
      && artifactDrawer?.textContent.includes('cordis.yml') === true
      && artifactDrawer.textContent.includes('产物预览')
    document.querySelector('[aria-label="关闭产物预览"]')?.click()
    producedFixture.remove()

    const trajectoryFixture = document.createElement('div')
    trajectoryFixture.setAttribute('data-conversation-composer-overlay', '')
    trajectoryFixture.innerHTML = '<div role="toolbar" aria-label="轨迹工具栏">Duration</div><table><tbody><tr data-kind="tool" data-record-index="7" data-error="true" aria-label="TOOL, bash"><td title="Event details">SYSTEM</td></tr></tbody></table>'
    document.body.append(trajectoryFixture)
    await new Promise(resolve => setTimeout(resolve, 0))
    const globalLocale = document.documentElement.lang
    const zhControl = trajectoryFixture.querySelector('[data-dsh-trajectory-language="zh"]')
    const enControl = trajectoryFixture.querySelector('[data-dsh-trajectory-language="en"]')
    const learningControl = trajectoryFixture.querySelector('[data-dsh-trajectory-learning-toggle]')
    const trajectoryLanguageControl = zhControl !== null && enControl !== null && learningControl !== null
    enControl?.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    const trajectoryLanguageIsolation = document.documentElement.lang === globalLocale
      && trajectoryFixture.querySelector('[role="toolbar"]')?.getAttribute('aria-label') === 'Trajectory toolbar'
      && trajectoryFixture.textContent.includes('Duration')
    zhControl?.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    const trajectoryLocalization = trajectoryFixture.textContent.includes('耗时')
      && trajectoryFixture.textContent.includes('系统')
      && trajectoryFixture.querySelector('td')?.title === '事件详情'
    learningControl?.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    trajectoryFixture.querySelector('tr[data-kind="tool"]')?.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    const learningPanel = trajectoryFixture.querySelector('[data-dsh-trajectory-learning]')
    const trajectoryLearning = learningPanel?.textContent.includes('Tool：bash') === true
      && learningPanel.textContent.includes('模型不会直接操作文件或终端')
      && learningPanel.textContent.includes('不展示或猜测模型隐藏思考')
      && trajectoryFixture.querySelector('tr[data-kind="tool"]')?.getAttribute('data-dsh-learning-selected') === 'true'
    trajectoryFixture.remove()
    return {
      title: document.title,
      bootEntries: bootstrap.graph.entries.length,
      harnessCommit: bootstrap.build.harnessCommit,
      upstreamCommit: bootstrap.build.upstreamCommit,
      hostStatus: host.status,
      hostOk: host.body?.result?.ok === true,
      sessionStatus: sessions.status,
      sessionOk: sessions.body?.result?.ok === true,
      sessionCount: sessions.body?.result?.ok === true ? sessions.body.result.value.items.length : -1,
      hostStream,
      updateControl: true,
      updateDialog,
      updatePhase: updateState.phase,
      pluginControl: true,
      pluginDialog,
      pluginPackages: pluginState.packages.length,
      pluginEntries,
      pluginExplanation,
      pluginCountClarity,
      mcpDialog,
      mcpCount,
      artifactPreview,
      trajectoryLocalization,
      trajectoryLanguageControl,
      trajectoryLanguageIsolation,
      trajectoryLearning,
    }
  })()`
}

function captureOutput(child: ChildProcess): () => string {
  let value = ''
  const append = (chunk: Buffer | string): void => {
    value = `${value}${chunk.toString()}`.slice(-30_000)
  }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
  return () => value
}

function processExit(child: ChildProcess): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => { resolve({ code, signal }) })
  })
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { reject(new Error(message)) }, timeoutMs)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, milliseconds) })
}

function parseBuildInfo(value: unknown): {
  desktopVersion: string
  harnessVersion: string
  harnessCommit: string
  upstreamCommit: string
} {
  assert(isRecord(value)
    && typeof value.desktopVersion === 'string'
    && typeof value.harnessVersion === 'string'
    && typeof value.harnessCommit === 'string'
    && typeof value.upstreamCommit === 'string', 'packaged build-info.json is malformed')
  return {
    desktopVersion: value.desktopVersion,
    harnessVersion: value.harnessVersion,
    harnessCommit: value.harnessCommit,
    upstreamCommit: value.upstreamCommit,
  }
}

function parsePackageManifest(value: unknown): PackageManifest {
  assert(isRecord(value), 'packaged package.json is malformed')
  const peerDependencies = isStringMap(value.peerDependencies) ? value.peerDependencies : undefined
  const peerDependenciesMeta = isRecord(value.peerDependenciesMeta)
    ? Object.fromEntries(Object.entries(value.peerDependenciesMeta).flatMap(([name, meta]) => (
      isRecord(meta) ? [[name, { optional: meta.optional === true }]] : []
    )))
    : undefined
  return {
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(peerDependencies === undefined ? {} : { peerDependencies }),
    ...(peerDependenciesMeta === undefined ? {} : { peerDependenciesMeta }),
  }
}

function parseSmokeReport(value: unknown): SmokeReport {
  assert(isRecord(value)
    && typeof value.title === 'string'
    && typeof value.bootEntries === 'number'
    && typeof value.harnessCommit === 'string'
    && typeof value.upstreamCommit === 'string'
    && typeof value.hostStatus === 'number'
    && typeof value.hostOk === 'boolean'
    && typeof value.sessionStatus === 'number'
    && typeof value.sessionOk === 'boolean'
    && typeof value.sessionCount === 'number'
    && typeof value.hostStream === 'string'
    && typeof value.updateControl === 'boolean'
    && typeof value.updateDialog === 'boolean'
    && typeof value.updatePhase === 'string'
    && typeof value.pluginControl === 'boolean'
    && typeof value.pluginDialog === 'boolean'
    && typeof value.pluginPackages === 'number'
    && typeof value.pluginEntries === 'number'
    && typeof value.pluginExplanation === 'boolean'
    && typeof value.pluginCountClarity === 'boolean'
    && typeof value.mcpDialog === 'boolean'
    && typeof value.mcpCount === 'number'
    && typeof value.artifactPreview === 'boolean'
    && typeof value.trajectoryLocalization === 'boolean'
    && typeof value.trajectoryLanguageControl === 'boolean'
    && typeof value.trajectoryLanguageIsolation === 'boolean'
    && typeof value.trajectoryLearning === 'boolean',
  `packaged renderer returned a malformed smoke report: ${JSON.stringify(value)}`)
  return value as unknown as SmokeReport
}

function parseUpdateCheck(value: unknown): 'available' | 'up-to-date' {
  assert(isRecord(value)
    && (value.phase === 'available' || value.phase === 'up-to-date')
    && typeof value.latestCommit === 'string'
    && /^[0-9a-f]{40}$/u.test(value.latestCommit),
  `desktop update check returned a malformed snapshot: ${JSON.stringify(value)}`)
  return value.phase
}

function isStringMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(entry => typeof entry === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

await main()
