/** Electron application lifecycle and secure BrowserWindow configuration. */

import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { readBuildInfo } from './build-info.ts'
import { HarnessRuntime } from './harness-runtime.ts'
import { DesktopIpcHost } from './ipc-host.ts'
import { DesktopPluginManager } from './plugin-manager.ts'
import { DesktopMcpManager } from './mcp-config.ts'
import { DesktopUpdater } from './updater.ts'

const APP_TITLE = 'DeepSeek Harness'
const SHUTDOWN_TIMEOUT_MS = 10_000
const currentDir = fileURLToPath(new URL('.', import.meta.url))
let mainWindow: BrowserWindow | undefined
let ipcHost: DesktopIpcHost | undefined
let runtime: Promise<HarnessRuntime> | undefined
let updater: DesktopUpdater | undefined
let pluginManager: DesktopPluginManager | undefined
let mcpManager: DesktopMcpManager | undefined
let shutdownStarted = false

app.setName(APP_TITLE)
app.enableSandbox()

process.once('SIGINT', () => { setImmediate(() => { app.quit() }) })
process.once('SIGTERM', () => { setImmediate(() => { app.quit() }) })

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    title: APP_TITLE,
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b0d10',
    webPreferences: {
      preload: join(currentDir, '..', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.once('ready-to-show', () => { window.show() })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault()
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  mainWindow = window
  await window.loadFile(join(currentDir, '..', 'renderer', 'index.html'))
}

app.whenReady().then(async () => {
  const dshHome = join(app.getPath('userData'), 'harness')
  const build = await readBuildInfo()
  const overlayRoot = app.isPackaged
    ? join(process.resourcesPath, 'update-overlay', 'apps', 'electron')
    : fileURLToPath(new URL('../..', import.meta.url))
  updater = new DesktopUpdater({
    currentCommit: build.upstreamCommit,
    updateRoot: join(app.getPath('userData'), 'updates'),
    overlayRoot,
    currentExecutable: process.execPath,
  })
  runtime = HarnessRuntime.boot(dshHome)
  void runtime.catch((error: unknown) => {
    console.error(inspect(error, { depth: 12 }))
  })
  pluginManager = new DesktopPluginManager({
    runtime,
    backupRoot: join(app.getPath('userData'), 'plugin-backups'),
  })
  mcpManager = new DesktopMcpManager(dshHome)
  ipcHost = new DesktopIpcHost(runtime, updater, pluginManager, mcpManager)
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(message)
  dialog.showErrorBox(`${APP_TITLE} 启动失败`, message)
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (shutdownStarted) return
  shutdownStarted = true
  event.preventDefault()
  ipcHost?.dispose()
  updater?.dispose()
  const forceExit = setTimeout(() => {
    console.error(`desktop: Harness shutdown exceeded ${String(SHUTDOWN_TIMEOUT_MS)} ms; forcing exit`)
    app.exit(0)
  }, SHUTDOWN_TIMEOUT_MS)
  const disposePluginManager = pluginManager?.dispose() ?? Promise.resolve()
  const disposeMcpManager = mcpManager?.dispose() ?? Promise.resolve()
  const disposeRuntime = runtime === undefined ? Promise.resolve() : runtime.then(settled => settled.dispose(), () => {})
  void Promise.all([disposePluginManager, disposeMcpManager, disposeRuntime])
    .finally(() => {
      clearTimeout(forceExit)
      app.quit()
    })
})
