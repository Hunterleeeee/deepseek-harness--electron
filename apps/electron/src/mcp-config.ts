/** Electron-managed MCP configuration and the runtime patch it produces. */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { DesktopMcpServer, DesktopMcpSnapshot } from './protocol.ts'

/** File holding the Electron-only MCP rows, separate from a hand-edited patch layer. */
export const MCP_CONFIG_FILENAME = 'mcp-servers.json'
const MCP_CONFIG_VERSION = 1
const MAX_SERVERS = 64
const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/u
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u

interface McpConfigFile {
  version: typeof MCP_CONFIG_VERSION
  servers: DesktopMcpServer[]
}

/** Read and validate the Electron MCP file, returning an empty list when absent. */
export async function readMcpServers(dshHome: string): Promise<DesktopMcpServer[]> {
  const file = join(dshHome, MCP_CONFIG_FILENAME)
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return []
    throw new Error(`MCP 配置读取失败：${String(error)}`)
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error(`MCP 配置不是有效 JSON：${String(error)}`)
  }
  if (!isRecord(value) || value.version !== MCP_CONFIG_VERSION || !Array.isArray(value.servers)) {
    throw new Error(`MCP 配置版本不受支持：${file}`)
  }
  return validateServers(value.servers)
}

/** Atomically write a validated Electron MCP file with owner-only permissions. */
export async function writeMcpServers(dshHome: string, servers: readonly DesktopMcpServer[]): Promise<DesktopMcpServer[]> {
  const next = validateServers(servers)
  const file: McpConfigFile = { version: MCP_CONFIG_VERSION, servers: next }
  await writeFileAtomic(
    join(dshHome, MCP_CONFIG_FILENAME),
    `${JSON.stringify(file, undefined, 2)}\n`,
    { mode: 0o600, dirMode: 0o700 },
  )
  return next
}

/** Turn enabled MCP rows into the same Loader entries used by Cordis overlays. */
export function mcpPatches(servers: readonly DesktopMcpServer[]): PatchOptions[] {
  const insert = servers.filter(server => server.enabled).map(server => ({
    id: `electron-mcp-${server.serverName}`,
    name: '@deepseek-ai/dsh-mcp-client',
    config: toPluginConfig(server),
  }))
  return insert.length === 0 ? [] : [{ insert }]
}

/** Own the configuration file and expose a restart-required snapshot to IPC. */
export class DesktopMcpManager {
  private readonly subscribers = new Set<(snapshot: DesktopMcpSnapshot) => void>()
  private snapshot: DesktopMcpSnapshot
  private disposed = false
  private writeJob: Promise<DesktopMcpSnapshot> | undefined

  constructor(private readonly dshHome: string) {
    this.snapshot = {
      phase: 'idle',
      message: 'MCP 配置尚未读取',
      path: join(dshHome, MCP_CONFIG_FILENAME),
      servers: [],
      restartRequired: false,
      error: undefined,
    }
  }

  /** Return the current file contents and any previous lifecycle status. */
  async getSnapshot(): Promise<DesktopMcpSnapshot> {
    if (this.snapshot.phase === 'idle') {
      try {
        const servers = await readMcpServers(this.dshHome)
        this.publish({ phase: 'ready', message: servers.length === 0 ? '尚未配置 MCP 服务器' : `已配置 ${String(servers.length)} 个 MCP 服务器`, servers, error: undefined })
      } catch (error) {
        this.publish({ phase: 'error', message: 'MCP 配置读取失败', error: describe(error) })
      }
    }
    return cloneSnapshot(this.snapshot)
  }

  /** Subscribe to save and validation transitions. */
  subscribe(listener: (snapshot: DesktopMcpSnapshot) => void): () => void {
    this.subscribers.add(listener)
    return () => { this.subscribers.delete(listener) }
  }

  /** Validate and save a new server list; activation happens after restart. */
  async save(servers: readonly DesktopMcpServer[]): Promise<DesktopMcpSnapshot> {
    if (this.writeJob !== undefined) return this.writeJob
    const job = this.saveNow(servers)
    this.writeJob = job
    try {
      return await job
    } finally {
      if (this.writeJob === job) this.writeJob = undefined
    }
  }

  /** Relaunch the Electron process after a saved MCP configuration. */
  restart(): void {
    if (!this.snapshot.restartRequired) throw new Error('MCP 配置没有待生效的修改')
    app.relaunch()
    app.exit(0)
  }

  /** Silence listeners after the main process begins shutdown. */
  async dispose(): Promise<void> {
    this.disposed = true
    await this.writeJob?.catch(() => undefined)
    this.subscribers.clear()
  }

  private async saveNow(servers: readonly DesktopMcpServer[]): Promise<DesktopMcpSnapshot> {
    this.publish({ phase: 'saving', message: '正在保存 MCP 配置…', error: undefined })
    try {
      const next = await writeMcpServers(this.dshHome, servers)
      this.publish({
        phase: 'restart-required',
        message: `已保存 ${String(next.length)} 个 MCP 服务器，重启后生效`,
        servers: next,
        restartRequired: true,
        error: undefined,
      })
    } catch (error) {
      this.publish({ phase: 'error', message: 'MCP 配置保存失败', error: describe(error) })
    }
    return cloneSnapshot(this.snapshot)
  }

  private publish(patch: Partial<DesktopMcpSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    if (this.disposed) return
    const detached = cloneSnapshot(this.snapshot)
    for (const subscriber of [...this.subscribers]) subscriber(detached)
  }
}

function validateServers(value: readonly unknown[]): DesktopMcpServer[] {
  if (value.length > MAX_SERVERS) throw new Error(`MCP 服务器最多配置 ${String(MAX_SERVERS)} 个`)
  const names = new Set<string>()
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`MCP 服务器第 ${String(index + 1)} 项不是对象`)
    const server = normalizeServer(item)
    if (names.has(server.serverName)) throw new Error(`MCP serverName 重复：${server.serverName}`)
    names.add(server.serverName)
    return server
  })
}

function normalizeServer(value: Record<string, unknown>): DesktopMcpServer {
  if (typeof value.enabled !== 'boolean') throw new Error('MCP enabled 必须是布尔值')
  if (typeof value.serverName !== 'string' || !SERVER_NAME.test(value.serverName)) {
    throw new Error('MCP serverName 必须是 1–32 位字母、数字、下划线或短横线')
  }
  if (value.transport !== 'stdio' && value.transport !== 'streamable-http') {
    throw new Error(`MCP transport 不支持：${String(value.transport)}`)
  }
  const server: DesktopMcpServer = {
    enabled: value.enabled,
    serverName: value.serverName,
    transport: value.transport,
  }
  if (value.transport === 'stdio') {
    if (typeof value.command !== 'string' || value.command.trim() === '') throw new Error(`${value.serverName} 需要 command`)
    server.command = value.command.trim()
    server.args = stringArray(value.args, `${value.serverName} args`)
    server.env = stringMap(value.env, `${value.serverName} env`, ENVIRONMENT_NAME)
    const cwd = optionalString(value.cwd, `${value.serverName} cwd`)
    if (cwd !== undefined) server.cwd = cwd
  } else {
    if (typeof value.url !== 'string' || !/^https?:\/\//u.test(value.url)) throw new Error(`${value.serverName} 需要 http(s) MCP URL`)
    server.url = value.url.trim()
    server.headers = stringMap(value.headers, `${value.serverName} headers`)
  }
  const timeout = value.toolCallTimeoutMs
  if (timeout !== undefined) {
    if (typeof timeout !== 'number' || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) {
      throw new Error(`${value.serverName} toolCallTimeoutMs 必须在 1–300000 之间`)
    }
    server.toolCallTimeoutMs = timeout
  }
  if (value.failOnStartupError !== undefined) {
    if (typeof value.failOnStartupError !== 'boolean') throw new Error(`${value.serverName} failOnStartupError 必须是布尔值`)
    server.failOnStartupError = value.failOnStartupError
  }
  return server
}

function toPluginConfig(server: DesktopMcpServer): Record<string, unknown> {
  const common = {
    serverName: server.serverName,
    transport: server.transport,
    toolCallTimeoutMs: server.toolCallTimeoutMs ?? 60_000,
    failOnStartupError: server.failOnStartupError ?? false,
  }
  return server.transport === 'stdio'
    ? { ...common, command: server.command, args: server.args ?? [], env: server.env ?? {}, cwd: server.cwd ?? '' }
    : { ...common, url: server.url, headers: server.headers ?? {} }
}

function stringArray(value: unknown, label: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`${label} 必须是字符串数组`)
  return value.map(item => item as string)
}

function stringMap(value: unknown, label: string, keyPattern?: RegExp): Record<string, string> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new Error(`${label} 必须是字符串对象`)
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (keyPattern !== undefined && !keyPattern.test(key)) throw new Error(`${label} 的键名无效：${key}`)
    if (typeof item !== 'string') throw new Error(`${label} 的值必须是字符串`)
    result[key] = item
  }
  return result
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`${label} 必须是字符串`)
  return value
}

function cloneSnapshot(snapshot: DesktopMcpSnapshot): DesktopMcpSnapshot {
  return structuredClone(snapshot)
}

function describe(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
