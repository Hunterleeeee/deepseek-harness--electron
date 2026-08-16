/** Main-process IPC bridge for unary fetches, plugin bundles, and downlink streams. */

import { isAbsolute } from 'node:path'
import type { OpenDialogOptions, WebContents } from 'electron'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readArtifactPreview } from './artifact-preview.ts'
import { readBuildInfo } from './build-info.ts'
import { importDocumentSelections } from './document-import.ts'
import type { HarnessRuntime } from './harness-runtime.ts'
import type { DesktopMcpManager } from './mcp-config.ts'
import type { DesktopPluginManager } from './plugin-manager.ts'
import type { DesktopUpdater } from './updater.ts'
import {
  DESKTOP_IPC,
  type DesktopFetchRequest,
  type DesktopFetchResponse,
  type DesktopStreamEvent,
  type DesktopStreamOpen,
  type DesktopMcpServer,
} from './protocol.ts'

const INTERNAL_ORIGIN = 'http://dsh.internal'

/** Own every transport operation for one application runtime. */
export class DesktopIpcHost {
  private readonly fetches = new Map<string, AbortController>()
  private readonly streams = new Map<string, AbortController>()
  private readonly updateSenders = new Set<WebContents>()
  private readonly pluginSenders = new Set<WebContents>()
  private readonly mcpSenders = new Set<WebContents>()
  private readonly releaseUpdater: () => void
  private readonly releasePluginManager: () => void
  private readonly releaseMcpManager: () => void

  /**
   * Register IPC handlers before the renderer loads.
   * @param runtime - boot task shared by every handler.
   */
  constructor(
    private readonly runtime: Promise<HarnessRuntime>,
    updater: DesktopUpdater,
    pluginManager: DesktopPluginManager,
    mcpManager: DesktopMcpManager,
  ) {
    ipcMain.handle(DESKTOP_IPC.bootstrap, async () => {
      const [settled, build] = await Promise.all([runtime, readBuildInfo()])
      return { graph: settled.graph(), build, dshHome: settled.dshHome }
    })
    ipcMain.handle(DESKTOP_IPC.bundle, async (_event, url: unknown) => {
      if (typeof url !== 'string') throw new Error('desktop: bundle URL must be a string')
      return (await runtime).readBundle(url)
    })
    ipcMain.handle(DESKTOP_IPC.fetch, async (event, value: unknown) => {
      const input = parseFetchRequest(value)
      const key = operationKey(event.sender, input.requestId)
      if (this.fetches.has(key)) throw new Error(`desktop: duplicate fetch id ${JSON.stringify(input.requestId)}`)
      const abort = new AbortController()
      this.fetches.set(key, abort)
      try {
        const request = toRequest(input, abort.signal)
        const response = await (await runtime).fetch(request)
        return await serializeResponse(response)
      } finally {
        this.fetches.delete(key)
      }
    })
    ipcMain.on(DESKTOP_IPC.fetchAbort, (event, requestId: unknown) => {
      if (typeof requestId !== 'string') return
      this.fetches.get(operationKey(event.sender, requestId))?.abort()
    })
    ipcMain.on(DESKTOP_IPC.streamOpen, (event, value: unknown) => {
      const input = parseStreamOpen(value)
      void this.openStream(event.sender, input)
    })
    ipcMain.on(DESKTOP_IPC.streamClose, (event, streamId: unknown) => {
      if (typeof streamId !== 'string') return
      this.streams.get(operationKey(event.sender, streamId))?.abort()
    })
    ipcMain.handle(DESKTOP_IPC.updateState, (event) => {
      this.trackUpdateSender(event.sender)
      return updater.getSnapshot()
    })
    ipcMain.handle(DESKTOP_IPC.updateCheck, async (event) => {
      this.trackUpdateSender(event.sender)
      return updater.check()
    })
    ipcMain.handle(DESKTOP_IPC.updateStart, (event) => {
      this.trackUpdateSender(event.sender)
      return updater.start()
    })
    ipcMain.handle(DESKTOP_IPC.updateReveal, (event) => {
      this.trackUpdateSender(event.sender)
      updater.reveal()
    })
    ipcMain.handle(DESKTOP_IPC.updateInstall, (event) => {
      this.trackUpdateSender(event.sender)
      return updater.install()
    })
    ipcMain.handle(DESKTOP_IPC.pluginState, async (event) => {
      this.trackPluginSender(event.sender)
      return pluginManager.getSnapshot()
    })
    ipcMain.handle(DESKTOP_IPC.pluginCheck, async (event) => {
      this.trackPluginSender(event.sender)
      return pluginManager.check()
    })
    ipcMain.handle(DESKTOP_IPC.pluginUpdate, async (event, packageName: unknown) => {
      this.trackPluginSender(event.sender)
      if (typeof packageName !== 'string') throw new Error('desktop: plugin package name must be a string')
      return pluginManager.update(packageName)
    })
    ipcMain.handle(DESKTOP_IPC.pluginRestart, () => { pluginManager.restart() })
    ipcMain.handle(DESKTOP_IPC.mcpState, (event) => {
      this.trackMcpSender(event.sender)
      return mcpManager.getSnapshot()
    })
    ipcMain.handle(DESKTOP_IPC.mcpSave, async (event, value: unknown) => {
      this.trackMcpSender(event.sender)
      return mcpManager.save(parseMcpServers(value))
    })
    ipcMain.handle(DESKTOP_IPC.mcpRestart, () => { mcpManager.restart() })
    ipcMain.handle(DESKTOP_IPC.artifactPreview, (_event, path: unknown) =>
      readArtifactPreview(parseArtifactPath(path)))
    ipcMain.handle(DESKTOP_IPC.artifactOpen, async (_event, path: unknown) => {
      const error = await shell.openPath(parseArtifactPath(path))
      if (error !== '') throw new Error(`artifact open failed: ${error}`)
    })
    ipcMain.handle(DESKTOP_IPC.artifactReveal, (_event, path: unknown) => {
      shell.showItemInFolder(parseArtifactPath(path))
    })
    ipcMain.handle(DESKTOP_IPC.importFiles, async (event) => {
      const options: OpenDialogOptions = {
        title: '导入资料文件',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '支持的资料', extensions: supportedDocumentExtensions() }, { name: '所有文件', extensions: ['*'] }],
      }
      const owner = BrowserWindow.fromWebContents(event.sender)
      const selected = owner === null ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(owner, options)
      if (selected.canceled) return []
      return importDocumentSelections((await runtime).dshHome, selected.filePaths, 'files')
    })
    ipcMain.handle(DESKTOP_IPC.importFolder, async (event) => {
      const options: OpenDialogOptions = {
        title: '导入资料文件夹',
        properties: ['openDirectory'],
      }
      const owner = BrowserWindow.fromWebContents(event.sender)
      const selected = owner === null ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(owner, options)
      if (selected.canceled) return []
      return importDocumentSelections((await runtime).dshHome, selected.filePaths, 'folder')
    })
    ipcMain.handle(DESKTOP_IPC.smokeQuit, () => {
      if (!app.commandLine.hasSwitch('dsh-electron-smoke')) {
        throw new Error('desktop: smoke shutdown is unavailable for an ordinary application launch')
      }
      setTimeout(() => { app.quit() }, 100)
    })
    this.releaseUpdater = updater.subscribe((snapshot) => {
      for (const sender of [...this.updateSenders]) {
        if (sender.isDestroyed()) {
          this.updateSenders.delete(sender)
        } else {
          sender.send(DESKTOP_IPC.updateState, snapshot)
        }
      }
    })
    this.releasePluginManager = pluginManager.subscribe((snapshot) => {
      for (const sender of [...this.pluginSenders]) {
        if (sender.isDestroyed()) {
          this.pluginSenders.delete(sender)
        } else {
          sender.send(DESKTOP_IPC.pluginState, snapshot)
        }
      }
    })
    this.releaseMcpManager = mcpManager.subscribe((snapshot) => {
      for (const sender of [...this.mcpSenders]) {
        if (sender.isDestroyed()) {
          this.mcpSenders.delete(sender)
        } else {
          sender.send(DESKTOP_IPC.mcpState, snapshot)
        }
      }
    })
  }

  /** Remove global IPC handlers and abort every in-flight operation. */
  dispose(): void {
    ipcMain.removeHandler(DESKTOP_IPC.bootstrap)
    ipcMain.removeHandler(DESKTOP_IPC.bundle)
    ipcMain.removeHandler(DESKTOP_IPC.fetch)
    ipcMain.removeAllListeners(DESKTOP_IPC.fetchAbort)
    ipcMain.removeAllListeners(DESKTOP_IPC.streamOpen)
    ipcMain.removeAllListeners(DESKTOP_IPC.streamClose)
    ipcMain.removeHandler(DESKTOP_IPC.updateState)
    ipcMain.removeHandler(DESKTOP_IPC.updateCheck)
    ipcMain.removeHandler(DESKTOP_IPC.updateStart)
    ipcMain.removeHandler(DESKTOP_IPC.updateReveal)
    ipcMain.removeHandler(DESKTOP_IPC.updateInstall)
    ipcMain.removeHandler(DESKTOP_IPC.pluginState)
    ipcMain.removeHandler(DESKTOP_IPC.pluginCheck)
    ipcMain.removeHandler(DESKTOP_IPC.pluginUpdate)
    ipcMain.removeHandler(DESKTOP_IPC.pluginRestart)
    ipcMain.removeHandler(DESKTOP_IPC.mcpState)
    ipcMain.removeHandler(DESKTOP_IPC.mcpSave)
    ipcMain.removeHandler(DESKTOP_IPC.mcpRestart)
    ipcMain.removeHandler(DESKTOP_IPC.artifactPreview)
    ipcMain.removeHandler(DESKTOP_IPC.artifactOpen)
    ipcMain.removeHandler(DESKTOP_IPC.artifactReveal)
    ipcMain.removeHandler(DESKTOP_IPC.importFiles)
    ipcMain.removeHandler(DESKTOP_IPC.importFolder)
    ipcMain.removeHandler(DESKTOP_IPC.smokeQuit)
    this.releaseUpdater()
    this.releasePluginManager()
    this.releaseMcpManager()
    for (const controller of this.fetches.values()) controller.abort()
    for (const controller of this.streams.values()) controller.abort()
    this.fetches.clear()
    this.streams.clear()
    this.updateSenders.clear()
    this.pluginSenders.clear()
    this.mcpSenders.clear()
  }

  private trackUpdateSender(sender: WebContents): void {
    if (this.updateSenders.has(sender)) return
    this.updateSenders.add(sender)
    sender.once('destroyed', () => { this.updateSenders.delete(sender) })
  }

  private trackPluginSender(sender: WebContents): void {
    if (this.pluginSenders.has(sender)) return
    this.pluginSenders.add(sender)
    sender.once('destroyed', () => { this.pluginSenders.delete(sender) })
  }

  private trackMcpSender(sender: WebContents): void {
    if (this.mcpSenders.has(sender)) return
    this.mcpSenders.add(sender)
    sender.once('destroyed', () => { this.mcpSenders.delete(sender) })
  }

  private async openStream(sender: WebContents, input: DesktopStreamOpen): Promise<void> {
    const key = operationKey(sender, input.streamId)
    if (this.streams.has(key)) {
      sendStream(sender, { streamId: input.streamId, type: 'error', message: 'duplicate stream id' })
      sendStream(sender, { streamId: input.streamId, type: 'close' })
      return
    }
    const abort = new AbortController()
    this.streams.set(key, abort)
    const handleDestroyed = (): void => { abort.abort() }
    sender.once('destroyed', handleDestroyed)
    try {
      const settled = await this.runtime
      if (abort.signal.aborted) return
      sendStream(sender, { streamId: input.streamId, type: 'open' })
      for await (const envelope of settled.stream(input.kind, abort.signal)) {
        if (sender.isDestroyed()) return
        const full = {
          type: 'server-request',
          rpcId: envelope.rpcId,
          method: envelope.payload.type,
          payload: envelope.payload,
        }
        sendStream(sender, { streamId: input.streamId, type: 'message', data: JSON.stringify(full) })
      }
    } catch (error) {
      if (!abort.signal.aborted) {
        sendStream(sender, {
          streamId: input.streamId,
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      sender.removeListener('destroyed', handleDestroyed)
      this.streams.delete(key)
      sendStream(sender, { streamId: input.streamId, type: 'close' })
    }
  }
}

function parseArtifactPath(value: unknown): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error('desktop: artifact path must be absolute')
  }
  return value
}

function operationKey(sender: WebContents, id: string): string {
  return `${String(sender.id)}:${id}`
}

function parseFetchRequest(value: unknown): DesktopFetchRequest {
  if (!isRecord(value)
    || typeof value.requestId !== 'string'
    || typeof value.url !== 'string'
    || typeof value.method !== 'string'
    || !isHeaderList(value.headers)
    || (value.body !== undefined && !(value.body instanceof Uint8Array))) {
    throw new Error('desktop: malformed fetch request')
  }
  const url = new URL(value.url)
  if (url.origin !== INTERNAL_ORIGIN || !url.pathname.startsWith('/api/')) {
    throw new Error(`desktop: refused fetch target ${JSON.stringify(value.url)}`)
  }
  if (url.pathname === '/api/events.mux' || url.pathname === '/api/events.host') {
    throw new Error('desktop: event streams must use the stream IPC channel')
  }
  return {
    requestId: value.requestId,
    url: value.url,
    method: value.method,
    headers: value.headers,
    ...(value.body === undefined ? {} : { body: value.body }),
  }
}

function parseStreamOpen(value: unknown): DesktopStreamOpen {
  if (!isRecord(value)
    || typeof value.streamId !== 'string'
    || (value.kind !== 'mux' && value.kind !== 'host')) {
    throw new Error('desktop: malformed stream-open request')
  }
  return { streamId: value.streamId, kind: value.kind }
}

function parseMcpServers(value: unknown): DesktopMcpServer[] {
  if (!Array.isArray(value)) throw new Error('desktop: MCP servers must be an array')
  return value.map((item, index) => {
    if (!isRecord(item)
      || typeof item.enabled !== 'boolean'
      || typeof item.serverName !== 'string'
      || (item.transport !== 'stdio' && item.transport !== 'streamable-http')) {
      throw new Error(`desktop: malformed MCP server at index ${String(index)}`)
    }
    return item as unknown as DesktopMcpServer
  })
}

function toRequest(input: DesktopFetchRequest, signal: AbortSignal): Request {
  const body = input.body === undefined ? undefined : Uint8Array.from(input.body).buffer
  return new Request(input.url, {
    method: input.method,
    headers: input.headers,
    ...body === undefined ? {} : { body },
    signal,
  })
}

async function serializeResponse(response: Response): Promise<DesktopFetchResponse> {
  return {
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
    body: new Uint8Array(await response.arrayBuffer()),
  }
}

function sendStream(sender: WebContents, event: DesktopStreamEvent): void {
  if (!sender.isDestroyed()) sender.send(DESKTOP_IPC.streamEvent, event)
}

function isHeaderList(value: unknown): value is [string, string][] {
  return Array.isArray(value)
    && value.every(row => Array.isArray(row)
      && row.length === 2
      && typeof row[0] === 'string'
      && typeof row[1] === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function supportedDocumentExtensions(): string[] {
  return [
    'pdf', 'doc', 'docx', 'docm', 'odt', 'rtf', 'xls', 'xlsx', 'xlsm', 'ods', 'csv',
    'ppt', 'pptx', 'pptm', 'odp', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'heic',
    'md', 'markdown', 'txt', 'log', 'json', 'yaml', 'yml', 'xml', 'js', 'jsx', 'ts', 'tsx',
    'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'css', 'html', 'sql', 'sh', 'bash', 'zsh',
  ]
}
