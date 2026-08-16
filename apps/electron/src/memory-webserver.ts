/** No-port implementation of the WebServer registration API used during desktop composition. */

import type { WebRoute, WebUpgradeRoute, WebServer } from '@deepseek-ai/dsh-host-webserver'

/** The WebServer members consumed by the Web bundle's Host-side plugins. */
export type WebServerRegistrationFace = Pick<
  WebServer,
  'host' | 'port' | 'register' | 'registerUpgrade' | 'registerFallback' | 'tapIndex' | 'applyIndexTaps'
>

/**
 * Satisfy Host plugin injection without binding a socket. HTTP handlers remain
 * registered for composition checks; Electron dispatches API calls directly
 * through the Fetch carrier and therefore never invokes them.
 */
export class MemoryWebServer implements WebServerRegistrationFace {
  readonly host = '127.0.0.1' as const
  readonly port = 0

  private readonly routes = new Map<string, WebRoute>()
  private readonly upgrades = new Map<string, WebUpgradeRoute>()
  private readonly indexTaps: Array<(html: string) => string> = []
  private fallback: WebRoute['handler'] | undefined

  /** Register a route and preserve WebServer's duplicate ownership failure. */
  register(route: WebRoute): () => void {
    const key = `${route.kind}:${route.path}`
    if (this.routes.has(key)) throw new Error(`desktop carrier: duplicate route ${JSON.stringify(key)}`)
    this.routes.set(key, route)
    return () => { this.routes.delete(key) }
  }

  /** Register an unused upgrade route so browser-only plugins can activate. */
  registerUpgrade(route: WebUpgradeRoute): () => void {
    if (this.upgrades.has(route.path)) {
      throw new Error(`desktop carrier: duplicate upgrade route ${JSON.stringify(route.path)}`)
    }
    this.upgrades.set(route.path, route)
    return () => { this.upgrades.delete(route.path) }
  }

  /** Claim the single fallback seat without serving it. */
  registerFallback(handler: WebRoute['handler']): () => void {
    if (this.fallback !== undefined) throw new Error('desktop carrier: fallback already registered')
    this.fallback = handler
    return () => { this.fallback = undefined }
  }

  /** Retain index transforms for API compatibility with the modules plugin. */
  tapIndex(transform: (html: string) => string): () => void {
    this.indexTaps.push(transform)
    return () => {
      const index = this.indexTaps.indexOf(transform)
      if (index !== -1) this.indexTaps.splice(index, 1)
    }
  }

  /** Apply retained transforms for diagnostics and focused tests. */
  applyIndexTaps(html: string): string {
    let result = html
    for (const transform of this.indexTaps) result = transform(result)
    return result
  }
}
