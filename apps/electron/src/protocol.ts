/** IPC message types shared by the Electron main, preload, and renderer processes. */

/** Stable IPC channel names; renderer code never receives `ipcRenderer` itself. */
export const DESKTOP_IPC = {
  bootstrap: 'dsh-desktop:bootstrap',
  bundle: 'dsh-desktop:bundle',
  fetch: 'dsh-desktop:fetch',
  fetchAbort: 'dsh-desktop:fetch-abort',
  streamOpen: 'dsh-desktop:stream-open',
  streamClose: 'dsh-desktop:stream-close',
  streamEvent: 'dsh-desktop:stream-event',
  updateState: 'dsh-desktop:update-state',
  updateCheck: 'dsh-desktop:update-check',
  updateStart: 'dsh-desktop:update-start',
  updateReveal: 'dsh-desktop:update-reveal',
  updateInstall: 'dsh-desktop:update-install',
  pluginState: 'dsh-desktop:plugin-state',
  pluginCheck: 'dsh-desktop:plugin-check',
  pluginUpdate: 'dsh-desktop:plugin-update',
  pluginRestart: 'dsh-desktop:plugin-restart',
  mcpState: 'dsh-desktop:mcp-state',
  mcpSave: 'dsh-desktop:mcp-save',
  mcpRestart: 'dsh-desktop:mcp-restart',
  artifactPreview: 'dsh-desktop:artifact-preview',
  artifactOpen: 'dsh-desktop:artifact-open',
  artifactReveal: 'dsh-desktop:artifact-reveal',
  importFiles: 'dsh-desktop:import-files',
  importFolder: 'dsh-desktop:import-folder',
  smokeQuit: 'dsh-desktop:smoke-quit',
} as const

/** One client plugin row in the Host-authored boot graph. */
export interface DesktopBootEntry {
  id: string
  url: string
  rev: string
  inject?: string[]
  immediately?: boolean
}

/** Client plugin graph passed to the official Web shell before it boots. */
export interface DesktopBootGraph {
  rev: string
  entries: DesktopBootEntry[]
}

/** Versions recorded with a desktop build for upgrade and rollback diagnostics. */
export interface DesktopBuildInfo {
  desktopVersion: string
  harnessVersion: string
  harnessCommit: string
  upstreamCommit: string
  builtAt: string
}

/** User-visible lifecycle of one desktop source update. */
export type DesktopUpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'preparing'
  | 'syncing'
  | 'installing-dependencies'
  | 'building'
  | 'packaging'
  | 'verifying'
  | 'ready'
  | 'installing'
  | 'error'

/** Immutable updater state published to the sandboxed renderer. */
export interface DesktopUpdateSnapshot {
  phase: DesktopUpdatePhase
  message: string
  currentCommit: string
  latestCommit: string | undefined
  checkedAt: string | undefined
  step: number
  stepCount: number
  logs: string[]
  canInstall: boolean
  error: string | undefined
}

/** Lifecycle phase of one configured Loader entry. */
export type DesktopPluginFiberPhase =
  | 'pending'
  | 'loading'
  | 'active'
  | 'failed'
  | 'unloading'
  | null

/** One configured entry belonging to a desktop plugin package. */
export interface DesktopPluginEntry {
  entryId: string
  moduleName: string
  enabled: boolean
  fiberPhase: DesktopPluginFiberPhase
}

/** Where a desktop plugin package is installed from. */
export type DesktopPluginSource = 'harness' | 'profile'

/** How one profile dependency can be checked for updates. */
export type DesktopPluginUpdateKind = 'harness' | 'registry' | 'manual'

/** Package metadata and current Loader entries shown in the desktop plugin center. */
export interface DesktopPluginPackage {
  packageName: string
  version: string | undefined
  description: string | undefined
  repositoryUrl: string | undefined
  source: DesktopPluginSource
  dependencySpec: string | undefined
  updateKind: DesktopPluginUpdateKind
  latestVersion: string | undefined
  dependencies: string[]
  entries: DesktopPluginEntry[]
}

/** User-visible lifecycle of profile-plugin update management. */
export type DesktopPluginPhase =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'updating'
  | 'restart-required'
  | 'error'

/** Immutable plugin-center state published to the sandboxed renderer. */
export interface DesktopPluginSnapshot {
  phase: DesktopPluginPhase
  message: string
  checkedAt: string | undefined
  busyPackage: string | undefined
  restartRequired: boolean
  error: string | undefined
  packages: DesktopPluginPackage[]
}

/** Transport used by one Electron-managed MCP server. */
export type DesktopMcpTransport = 'stdio' | 'streamable-http'

/** JSON-safe MCP server configuration stored in the Electron Harness home. */
export interface DesktopMcpServer {
  enabled: boolean
  serverName: string
  transport: DesktopMcpTransport
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  toolCallTimeoutMs?: number
  failOnStartupError?: boolean
}

/** Lifecycle state for the Electron MCP configuration editor. */
export type DesktopMcpPhase = 'idle' | 'saving' | 'ready' | 'restart-required' | 'error'

/** Snapshot returned to the renderer for the local MCP configuration. */
export interface DesktopMcpSnapshot {
  phase: DesktopMcpPhase
  message: string
  path: string
  servers: DesktopMcpServer[]
  restartRequired: boolean
  error: string | undefined
}

/** Renderer-safe presentation returned for one Host-resolved artifact path. */
export interface DesktopArtifactPreview {
  path: string
  name: string
  kind: 'markdown' | 'text' | 'image' | 'unsupported'
  size: number
  mimeType: string | undefined
  content: string | undefined
  dataUrl: string | undefined
  tooLarge: boolean
}

/** One file or directory copied into the application-owned import store. */
export interface DesktopImportedDocument {
  id: string
  name: string
  path: string
  kind: 'pdf' | 'word' | 'excel' | 'powerpoint' | 'image' | 'markdown' | 'code' | 'text' | 'folder' | 'other'
  size: number
  fileCount?: number
}

/** Initial state returned only after the embedded Harness has settled. */
export interface DesktopBootstrap {
  graph: DesktopBootGraph
  build: DesktopBuildInfo
  dshHome: string
}

/** Serialized renderer fetch request accepted by the main process. */
export interface DesktopFetchRequest {
  requestId: string
  url: string
  method: string
  headers: [string, string][]
  body?: Uint8Array
}

/** Serialized main-process response reconstructed as a Web `Response`. */
export interface DesktopFetchResponse {
  status: number
  statusText: string
  headers: [string, string][]
  body: Uint8Array
}

/** The two downlink-only streams used by the official connection client. */
export type DesktopStreamKind = 'mux' | 'host'

/** Request to create one renderer-owned stream. */
export interface DesktopStreamOpen {
  streamId: string
  kind: DesktopStreamKind
}

/** Lifecycle event delivered to the renderer's WebSocket-compatible adapter. */
export type DesktopStreamEvent =
  | { streamId: string; type: 'open' }
  | { streamId: string; type: 'message'; data: string }
  | { streamId: string; type: 'error'; message: string }
  | { streamId: string; type: 'close' }

/** Narrow API exposed through contextBridge. */
export interface DesktopBridge {
  bootstrap(): Promise<DesktopBootstrap>
  readBundle(url: string): Promise<string>
  fetch(request: DesktopFetchRequest): Promise<DesktopFetchResponse>
  abortFetch(requestId: string): void
  openStream(request: DesktopStreamOpen): void
  closeStream(streamId: string): void
  subscribeStream(listener: (event: DesktopStreamEvent) => void): number
  unsubscribeStream(subscriptionId: number): void
  getUpdateState(): Promise<DesktopUpdateSnapshot>
  checkForUpdates(): Promise<DesktopUpdateSnapshot>
  startUpdate(): Promise<DesktopUpdateSnapshot>
  revealUpdate(): Promise<void>
  installUpdate(): Promise<DesktopUpdateSnapshot>
  subscribeUpdates(listener: (snapshot: DesktopUpdateSnapshot) => void): number
  unsubscribeUpdates(subscriptionId: number): void
  getPluginState(): Promise<DesktopPluginSnapshot>
  checkPluginUpdates(): Promise<DesktopPluginSnapshot>
  updatePlugin(packageName: string): Promise<DesktopPluginSnapshot>
  restartForPlugins(): Promise<void>
  subscribePlugins(listener: (snapshot: DesktopPluginSnapshot) => void): number
  unsubscribePlugins(subscriptionId: number): void
  getMcpState(): Promise<DesktopMcpSnapshot>
  saveMcpServers(servers: DesktopMcpServer[]): Promise<DesktopMcpSnapshot>
  restartForMcp(): Promise<void>
  subscribeMcp(listener: (snapshot: DesktopMcpSnapshot) => void): number
  unsubscribeMcp(subscriptionId: number): void
  previewArtifact(path: string): Promise<DesktopArtifactPreview>
  openArtifact(path: string): Promise<void>
  revealArtifact(path: string): Promise<void>
  importFiles(): Promise<DesktopImportedDocument[]>
  importFolder(): Promise<DesktopImportedDocument[]>
  quitSmokeInstance(): Promise<void>
}
