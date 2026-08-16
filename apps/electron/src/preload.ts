/** Sandboxed preload exposing only the typed desktop transport API. */

import { contextBridge, ipcRenderer } from 'electron'
import {
  DESKTOP_IPC,
  type DesktopArtifactPreview,
  type DesktopBootstrap,
  type DesktopBridge,
  type DesktopImportedDocument,
  type DesktopFetchRequest,
  type DesktopFetchResponse,
  type DesktopPluginPhase,
  type DesktopPluginSnapshot,
  type DesktopMcpPhase,
  type DesktopMcpServer,
  type DesktopMcpSnapshot,
  type DesktopStreamEvent,
  type DesktopStreamOpen,
  type DesktopUpdatePhase,
  type DesktopUpdateSnapshot,
} from './protocol.ts'

let nextSubscriptionId = 1
const streamListeners = new Map<number, (event: DesktopStreamEvent) => void>()
const updateListeners = new Map<number, (snapshot: DesktopUpdateSnapshot) => void>()
const pluginListeners = new Map<number, (snapshot: DesktopPluginSnapshot) => void>()
const mcpListeners = new Map<number, (snapshot: DesktopMcpSnapshot) => void>()
const updatePhases: ReadonlySet<string> = new Set<DesktopUpdatePhase>([
  'idle',
  'checking',
  'up-to-date',
  'available',
  'preparing',
  'syncing',
  'installing-dependencies',
  'building',
  'packaging',
  'verifying',
  'ready',
  'installing',
  'error',
])
const pluginPhases: ReadonlySet<string> = new Set<DesktopPluginPhase>([
  'idle',
  'checking',
  'ready',
  'updating',
  'restart-required',
  'error',
])
const mcpPhases: ReadonlySet<string> = new Set<DesktopMcpPhase>([
  'idle', 'saving', 'ready', 'restart-required', 'error',
])

ipcRenderer.on(DESKTOP_IPC.streamEvent, (_event, value: unknown) => {
  if (!isStreamEvent(value)) return
  for (const listener of [...streamListeners.values()]) listener(value)
})

ipcRenderer.on(DESKTOP_IPC.updateState, (_event, value: unknown) => {
  if (!isUpdateSnapshot(value)) return
  for (const listener of [...updateListeners.values()]) listener(value)
})

ipcRenderer.on(DESKTOP_IPC.pluginState, (_event, value: unknown) => {
  if (!isPluginSnapshot(value)) return
  for (const listener of [...pluginListeners.values()]) listener(value)
})

ipcRenderer.on(DESKTOP_IPC.mcpState, (_event, value: unknown) => {
  if (!isMcpSnapshot(value)) return
  for (const listener of [...mcpListeners.values()]) listener(value)
})

const bridge: DesktopBridge = {
  bootstrap: () => ipcRenderer.invoke(DESKTOP_IPC.bootstrap) as Promise<DesktopBootstrap>,
  readBundle: (url: string) => ipcRenderer.invoke(DESKTOP_IPC.bundle, url) as Promise<string>,
  fetch: (request: DesktopFetchRequest) =>
    ipcRenderer.invoke(DESKTOP_IPC.fetch, request) as Promise<DesktopFetchResponse>,
  abortFetch(requestId: string): void {
    ipcRenderer.send(DESKTOP_IPC.fetchAbort, requestId)
  },
  openStream(request: DesktopStreamOpen): void {
    ipcRenderer.send(DESKTOP_IPC.streamOpen, request)
  },
  closeStream(streamId: string): void {
    ipcRenderer.send(DESKTOP_IPC.streamClose, streamId)
  },
  subscribeStream(listener: (event: DesktopStreamEvent) => void): number {
    const id = nextSubscriptionId++
    streamListeners.set(id, listener)
    return id
  },
  unsubscribeStream(subscriptionId: number): void {
    streamListeners.delete(subscriptionId)
  },
  getUpdateState: () => ipcRenderer.invoke(DESKTOP_IPC.updateState) as Promise<DesktopUpdateSnapshot>,
  checkForUpdates: () => ipcRenderer.invoke(DESKTOP_IPC.updateCheck) as Promise<DesktopUpdateSnapshot>,
  startUpdate: () => ipcRenderer.invoke(DESKTOP_IPC.updateStart) as Promise<DesktopUpdateSnapshot>,
  revealUpdate: () => ipcRenderer.invoke(DESKTOP_IPC.updateReveal) as Promise<void>,
  installUpdate: () => ipcRenderer.invoke(DESKTOP_IPC.updateInstall) as Promise<DesktopUpdateSnapshot>,
  subscribeUpdates(listener: (snapshot: DesktopUpdateSnapshot) => void): number {
    const id = nextSubscriptionId++
    updateListeners.set(id, listener)
    return id
  },
  unsubscribeUpdates(subscriptionId: number): void {
    updateListeners.delete(subscriptionId)
  },
  getPluginState: () => ipcRenderer.invoke(DESKTOP_IPC.pluginState) as Promise<DesktopPluginSnapshot>,
  checkPluginUpdates: () => ipcRenderer.invoke(DESKTOP_IPC.pluginCheck) as Promise<DesktopPluginSnapshot>,
  updatePlugin: (packageName: string) =>
    ipcRenderer.invoke(DESKTOP_IPC.pluginUpdate, packageName) as Promise<DesktopPluginSnapshot>,
  restartForPlugins: () => ipcRenderer.invoke(DESKTOP_IPC.pluginRestart) as Promise<void>,
  subscribePlugins(listener: (snapshot: DesktopPluginSnapshot) => void): number {
    const id = nextSubscriptionId++
    pluginListeners.set(id, listener)
    return id
  },
  unsubscribePlugins(subscriptionId: number): void {
    pluginListeners.delete(subscriptionId)
  },
  getMcpState: () => ipcRenderer.invoke(DESKTOP_IPC.mcpState) as Promise<DesktopMcpSnapshot>,
  saveMcpServers: (servers: DesktopMcpServer[]) =>
    ipcRenderer.invoke(DESKTOP_IPC.mcpSave, servers) as Promise<DesktopMcpSnapshot>,
  restartForMcp: () => ipcRenderer.invoke(DESKTOP_IPC.mcpRestart) as Promise<void>,
  subscribeMcp(listener: (snapshot: DesktopMcpSnapshot) => void): number {
    const id = nextSubscriptionId++
    mcpListeners.set(id, listener)
    return id
  },
  unsubscribeMcp(subscriptionId: number): void {
    mcpListeners.delete(subscriptionId)
  },
  previewArtifact: (path: string) =>
    ipcRenderer.invoke(DESKTOP_IPC.artifactPreview, path) as Promise<DesktopArtifactPreview>,
  openArtifact: (path: string) => ipcRenderer.invoke(DESKTOP_IPC.artifactOpen, path) as Promise<void>,
  revealArtifact: (path: string) => ipcRenderer.invoke(DESKTOP_IPC.artifactReveal, path) as Promise<void>,
  importFiles: () => ipcRenderer.invoke(DESKTOP_IPC.importFiles) as Promise<DesktopImportedDocument[]>,
  importFolder: () => ipcRenderer.invoke(DESKTOP_IPC.importFolder) as Promise<DesktopImportedDocument[]>,
  quitSmokeInstance: () => ipcRenderer.invoke(DESKTOP_IPC.smokeQuit) as Promise<void>,
}

contextBridge.exposeInMainWorld('dshDesktop', bridge)

function isStreamEvent(value: unknown): value is DesktopStreamEvent {
  if (!isRecord(value) || typeof value.streamId !== 'string' || typeof value.type !== 'string') return false
  if (value.type === 'open' || value.type === 'close') return true
  if (value.type === 'message') return typeof value.data === 'string'
  return value.type === 'error' && typeof value.message === 'string'
}

function isUpdateSnapshot(value: unknown): value is DesktopUpdateSnapshot {
  return isRecord(value)
    && typeof value.phase === 'string'
    && updatePhases.has(value.phase)
    && typeof value.message === 'string'
    && typeof value.currentCommit === 'string'
    && (value.latestCommit === undefined || typeof value.latestCommit === 'string')
    && (value.checkedAt === undefined || typeof value.checkedAt === 'string')
    && Number.isSafeInteger(value.step)
    && Number.isSafeInteger(value.stepCount)
    && Array.isArray(value.logs)
    && value.logs.every(line => typeof line === 'string')
    && typeof value.canInstall === 'boolean'
    && (value.error === undefined || typeof value.error === 'string')
}

function isPluginSnapshot(value: unknown): value is DesktopPluginSnapshot {
  return isRecord(value)
    && typeof value.phase === 'string'
    && pluginPhases.has(value.phase)
    && typeof value.message === 'string'
    && (value.checkedAt === undefined || typeof value.checkedAt === 'string')
    && (value.busyPackage === undefined || typeof value.busyPackage === 'string')
    && typeof value.restartRequired === 'boolean'
    && (value.error === undefined || typeof value.error === 'string')
    && Array.isArray(value.packages)
    && value.packages.every(plugin => isPluginPackage(plugin))
}

function isPluginPackage(value: unknown): boolean {
  return isRecord(value)
    && typeof value.packageName === 'string'
    && (value.version === undefined || typeof value.version === 'string')
    && (value.description === undefined || typeof value.description === 'string')
    && (value.repositoryUrl === undefined || typeof value.repositoryUrl === 'string')
    && (value.source === 'harness' || value.source === 'profile')
    && (value.dependencySpec === undefined || typeof value.dependencySpec === 'string')
    && (value.updateKind === 'harness' || value.updateKind === 'registry' || value.updateKind === 'manual')
    && (value.latestVersion === undefined || typeof value.latestVersion === 'string')
    && isStringArray(value.dependencies)
    && Array.isArray(value.entries)
    && value.entries.every(entry => isPluginEntry(entry))
}

function isPluginEntry(value: unknown): boolean {
  return isRecord(value)
    && typeof value.entryId === 'string'
    && typeof value.moduleName === 'string'
    && typeof value.enabled === 'boolean'
    && (value.fiberPhase === null
      || value.fiberPhase === 'pending'
      || value.fiberPhase === 'loading'
      || value.fiberPhase === 'active'
      || value.fiberPhase === 'failed'
      || value.fiberPhase === 'unloading')
}

function isMcpSnapshot(value: unknown): value is DesktopMcpSnapshot {
  return isRecord(value)
    && typeof value.phase === 'string'
    && mcpPhases.has(value.phase)
    && typeof value.message === 'string'
    && typeof value.path === 'string'
    && typeof value.restartRequired === 'boolean'
    && (value.error === undefined || typeof value.error === 'string')
    && Array.isArray(value.servers)
    && value.servers.every(server => isMcpServer(server))
}

function isMcpServer(value: unknown): value is DesktopMcpServer {
  return isRecord(value)
    && typeof value.enabled === 'boolean'
    && typeof value.serverName === 'string'
    && (value.transport === 'stdio' || value.transport === 'streamable-http')
    && (value.command === undefined || typeof value.command === 'string')
    && (value.args === undefined || isStringArray(value.args))
    && (value.env === undefined || isStringRecord(value.env))
    && (value.cwd === undefined || typeof value.cwd === 'string')
    && (value.url === undefined || typeof value.url === 'string')
    && (value.headers === undefined || isStringRecord(value.headers))
    && (value.toolCallTimeoutMs === undefined || Number.isSafeInteger(value.toolCallTimeoutMs))
    && (value.failOnStartupError === undefined || typeof value.failOnStartupError === 'boolean')
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(item => typeof item === 'string')
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
