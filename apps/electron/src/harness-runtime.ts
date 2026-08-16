/** Boot the official Web composition behind an IPC-only Electron carrier. */

import { randomUUID } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Context, FiberState } from '@deepseek-ai/cordis'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import {
  boot,
  healProfilesModuleFallback,
  initProfile,
  loadOptionalPatches,
  loadProfile,
  PROFILE_PATCH_FILENAME,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import { HostConnectionService } from '@deepseek-ai/dsh-client-connection'
import type { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules'
import { RpcId, type HostFrame, type MuxFrame, type RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import { MemoryWebServer } from './memory-webserver.ts'
import type {
  DesktopBootGraph,
  DesktopPluginEntry,
  DesktopPluginFiberPhase,
  DesktopPluginPackage,
  DesktopPluginUpdateKind,
  DesktopStreamKind,
} from './protocol.ts'
import { mcpPatches, readMcpServers } from './mcp-config.ts'

const APP_NAME = 'dsh-electron'
const PROFILE_NAME = 'electron'
const PROFILE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] as const
const ROOT_CONFIG = '# Electron profile root; composition is supplied by bundle and user patch layers.\n[]\n'
const INSTALL_ANCHOR = new URL('../../package.json', import.meta.url)

interface PackageManifest {
  name?: string
  version?: string
  description?: string
  homepage?: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  repository?: string | { type?: string; url?: string; directory?: string }
  dsh?: { client?: { inject?: string[] } }
}

/** Runtime mirror: FiberState is a cross-package const enum. */
const FIBER_PHASE = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: null,
  5: 'unloading',
} as const satisfies Record<FiberState, DesktopPluginFiberPhase>

/** A settled Harness tree plus the desktop transport operations layered over it. */
export class HarnessRuntime {
  private readonly modules: ClientModuleRegistry
  private readonly apiFetch: { fetch(request: Request): Promise<Response> }

  private constructor(
    private readonly ctx: Context,
    readonly dshHome: string,
    readonly profileDir: string,
  ) {
    const connection = ctx.get('connection')
    const modules = ctx.get('clientModules')
    const apiProxy = ctx.get('apiProxy')
    if (!(connection instanceof HostConnectionService)) {
      throw new Error('desktop: Host Connection service did not activate')
    }
    if (modules === undefined) throw new Error('desktop: client module registry did not activate')
    if (apiProxy === undefined) throw new Error('desktop: API proxy did not activate')
    this.modules = modules
    this.apiFetch = connection.createSharedFetchHandler('/api', toFetchHandler(apiProxy))
  }

  /**
   * Compose and boot the desktop profile under its isolated Harness home.
   * @param dshHome - absolute data root owned by Electron userData.
   * @returns a settled runtime ready for IPC calls.
   */
  static async boot(dshHome: string): Promise<HarnessRuntime> {
    process.env.DSH_HOME = dshHome
    const installAnchor = fileURLToPath(INSTALL_ANCHOR)
    healProfilesModuleFallback(installAnchor, dshHome)

    const profileDir = resolveProfileDir(PROFILE_NAME, dshHome)
    initProfile(profileDir, PROFILE_BUNDLES)
    const profile = loadProfile(APP_NAME, PROFILE_NAME, installAnchor, dshHome)
    const rootConfig = join(profile.dir, 'cordis.yml')
    writeFileSync(rootConfig, ROOT_CONFIG)

    const cliPackage = createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')
    const shippedPresets = join(dirname(cliPackage), 'config', 'agent-presets')
    if (!existsSync(shippedPresets)) {
      throw new Error(`desktop: shipped agent presets are missing at ${shippedPresets}`)
    }

    const homePatches = loadOptionalPatches(APP_NAME, join(dshHome, PROFILE_PATCH_FILENAME)) ?? []
    const configuredMcpPatches = mcpPatches(await readMcpServers(dshHome))
    const desktopPatches: PatchOptions[] = [
      { id: 'web-startup', disabled: true },
      { id: 'webserver', disabled: true },
      { id: 'web-runtime', disabled: true },
      { id: 'client-hmr', disabled: true },
      {
        id: 'connection',
        inject: [],
        config: { trustedHosts: [] },
      },
      {
        id: 'agent-presets',
        config: {
          default: 'standard',
          roots: [{ path: shippedPresets, trust: 'system' }],
        },
      },
    ]
    const patches = [
      ...profile.layers.flatMap(layer => layer.patches),
      ...profile.patches,
      ...homePatches,
      ...configuredMcpPatches,
      ...desktopPatches,
    ]
    const ctx = await boot(
      APP_NAME,
      rootConfig,
      structuredClone(patches),
      (hostCtx) => {
        installDesktopModuleLoader(hostCtx)
        const memoryServer = new MemoryWebServer()
        hostCtx.provide('webServer', memoryServer as unknown as WebServer)
      },
    )
    return new HarnessRuntime(ctx, dshHome, profile.dir)
  }

  /** Return a detached graph safe to send through structured clone. */
  graph(): DesktopBootGraph {
    return structuredClone(this.modules.graph())
  }

  /**
   * Read package metadata and current Loader state for the desktop plugin center.
   * @returns Packages in first-Loader-entry order, followed by inactive profile dependencies.
   */
  async pluginInventory(): Promise<DesktopPluginPackage[]> {
    const profileManifest = parsePackageManifest(
      JSON.parse(await readFile(join(this.profileDir, 'package.json'), 'utf8')),
    )
    const profileDependencies = profileManifest.dependencies ?? {}
    const entriesByPackage = new Map<string, DesktopPluginEntry[]>()
    for (const entry of this.ctx.loader.entries()) {
      if (entry.options.group) continue
      const packageName = packageNameFromSpecifier(entry.options.name)
      const entries = entriesByPackage.get(packageName) ?? []
      entries.push({
        entryId: entry.id,
        moduleName: entry.options.name,
        enabled: !entry.disabled,
        fiberPhase: entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state],
      })
      entriesByPackage.set(packageName, entries)
    }
    for (const packageName of Object.keys(profileDependencies)) {
      if (!entriesByPackage.has(packageName)) entriesByPackage.set(packageName, [])
    }

    const anchor = join(this.profileDir, 'package.json')
    const packages: DesktopPluginPackage[] = []
    for (const [packageName, entries] of entriesByPackage) {
      const packageDir = packageDirFromAnchor(anchor, packageName)
      const manifest = packageDir === undefined
        ? {}
        : parsePackageManifest(JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')))
      const dependencySpec = profileDependencies[packageName]
      packages.push({
        packageName,
        version: manifest.version,
        description: manifest.description,
        repositoryUrl: repositoryUrl(manifest),
        source: dependencySpec === undefined ? 'harness' : 'profile',
        dependencySpec,
        updateKind: dependencySpec === undefined ? 'harness' : dependencyUpdateKind(dependencySpec),
        latestVersion: undefined,
        dependencies: pluginDependencies(manifest),
        entries,
      })
    }
    return packages
  }

  /**
   * Read a graph-owned client bundle after matching its exact revisioned URL.
   * @param requestedUrl - relative URL from the boot graph.
   * @returns JavaScript bundle source.
   */
  async readBundle(requestedUrl: string): Promise<string> {
    const requested = new URL(requestedUrl, 'http://dsh.internal')
    const row = this.modules.graph().entries.find((entry) => {
      const candidate = new URL(entry.url, 'http://dsh.internal')
      return requested.pathname === candidate.pathname && requested.search === candidate.search
    })
    if (row === undefined) throw new Error(`desktop: unknown client bundle ${JSON.stringify(requestedUrl)}`)
    const path = this.modules.clientPath(row.id)
    if (path === undefined) throw new Error(`desktop: client bundle path disappeared for ${JSON.stringify(row.id)}`)
    return readFile(path, 'utf8')
  }

  /**
   * Dispatch one API Request through the same Fetch handler as the Web carrier.
   * @param request - validated desktop API request.
   * @returns the carrier Response.
   */
  fetch(request: Request): Promise<Response> {
    return this.apiFetch.fetch(request)
  }

  /**
   * Open one API Proxy downlink directly, bypassing browser WebSockets.
   * @param kind - mux or host stream.
   * @param signal - renderer-owned cancellation.
   * @returns the stream's request envelopes.
   */
  async *stream(
    kind: DesktopStreamKind,
    signal: AbortSignal,
  ): AsyncGenerator<RpcRequest<MuxFrame | HostFrame>> {
    const apiProxy = this.ctx.get('apiProxy')
    if (apiProxy === undefined) throw new Error('desktop: API proxy disposed')
    const request = { rpcId: RpcId(randomUUID()), payload: {} }
    if (kind === 'mux') {
      for await (const envelope of apiProxy.events.mux(request, signal)) yield envelope
      return
    }
    for await (const envelope of apiProxy.events.host(request, signal)) yield envelope
  }

  /** Dispose the complete plugin tree and wait for quiescence. */
  async dispose(): Promise<void> {
    await this.ctx.fiber.dispose()
  }
}

/** Return the package portion of a Loader module specifier. */
function packageNameFromSpecifier(specifier: string): string {
  if (!specifier.startsWith('@')) return specifier.split('/')[0] ?? specifier
  const [scope, name] = specifier.split('/')
  return name === undefined ? specifier : `${scope}/${name}`
}

/** Resolve a package root without requiring a package.json export. */
function packageDirFromAnchor(anchor: string, packageName: string): string | undefined {
  for (const searchPath of createRequire(anchor).resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, packageName)
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return undefined
}

/** Parse only the package.json fields the plugin center is allowed to expose. */
function parsePackageManifest(value: unknown): PackageManifest {
  if (!isRecord(value)) return {}
  const repository = typeof value.repository === 'string'
    ? value.repository
    : isRecord(value.repository)
      ? {
        ...(typeof value.repository.type === 'string' ? { type: value.repository.type } : {}),
        ...(typeof value.repository.url === 'string' ? { url: value.repository.url } : {}),
        ...(typeof value.repository.directory === 'string' ? { directory: value.repository.directory } : {}),
      }
      : undefined
  const clientInject = isRecord(value.dsh) && isRecord(value.dsh.client)
    ? stringArray(value.dsh.client.inject)
    : undefined
  const client = isRecord(value.dsh) && isRecord(value.dsh.client)
    ? { ...(clientInject === undefined ? {} : { inject: clientInject }) }
    : undefined
  return {
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(typeof value.version === 'string' ? { version: value.version } : {}),
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    ...(typeof value.homepage === 'string' ? { homepage: value.homepage } : {}),
    ...(isStringMap(value.dependencies) ? { dependencies: value.dependencies } : {}),
    ...(isStringMap(value.peerDependencies) ? { peerDependencies: value.peerDependencies } : {}),
    ...(repository === undefined ? {} : { repository }),
    ...(client === undefined ? {} : { dsh: { client } }),
  }
}

/** Build a browser-safe repository link from standard npm manifest fields. */
function repositoryUrl(manifest: PackageManifest): string | undefined {
  const raw = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
  if (raw === undefined) return manifest.homepage
  const normalized = raw
    .replace(/^git\+/, '')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
  if (!normalized.startsWith('https://') && !normalized.startsWith('http://')) return manifest.homepage
  const directory = typeof manifest.repository === 'object' ? manifest.repository.directory : undefined
  return directory === undefined || !normalized.includes('github.com/')
    ? normalized
    : `${normalized}/tree/master/${directory}`
}

/** Keep only plugin-to-plugin dependencies useful in an ecosystem view. */
function pluginDependencies(manifest: PackageManifest): string[] {
  const names = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...(manifest.dsh?.client?.inject ?? []),
  ])
  return [...names]
    .filter(name => name.startsWith('@deepseek-ai/dsh-') || name.startsWith('@deepseek-ai/cordis'))
    .sort((left, right) => left.localeCompare(right))
}

/** Local, Git, and URL specs have no trustworthy registry latest version. */
function dependencyUpdateKind(spec: string): DesktopPluginUpdateKind {
  return /^(?:file:|link:|workspace:|git(?:\+|:)|github:|https?:|\.{0,2}\/)/u.test(spec)
    ? 'manual'
    : 'registry'
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : undefined
}

function isStringMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(item => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Resolve Loader bare imports from the profile, without Node-internal addons unavailable in Electron. */
function installDesktopModuleLoader(ctx: Context): void {
  ctx.loader.internal = {
    version: 'v2',
    loadCache: new Map(),
    async import(specifier: string, parentUrl: string): Promise<unknown> {
      const anchor = new URL('package.json', parentUrl)
      const resolved = createRequire(anchor).resolve(specifier)
      return import(pathToFileURL(resolved).href)
    },
  } as never
}
