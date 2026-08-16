/** Electron renderer bootstrap over the official React Web shell. */

import { AppWebEntry } from '@deepseek-ai/dsh-client-web'
import { interceptArtifactPreviewRequest, mountDesktopArtifactPreview } from './artifact-preview-ui.tsx'
import {
  mountDesktopDocumentImport,
  observeDocumentPromptResult,
  observeDocumentSessionRequest,
  prepareDocumentPrompt,
} from './document-import.tsx'
import { installDesktopSettingsEntries } from './desktop-settings-ui.tsx'
import type { DesktopFetchResponse, DesktopStreamEvent, DesktopStreamKind } from './protocol.ts'
import { mountDesktopPluginCenter } from './plugin-center-ui.tsx'
import { mountDesktopMcpConfig } from './mcp-config-ui.tsx'
import { installTrajectoryPresentation } from './trajectory-localization.ts'
import './trajectory-presentation.css'
import { mountDesktopUpdateControl } from './update-ui.tsx'

const INTERNAL_ORIGIN = 'http://dsh.internal'
const nativeFetch = globalThis.fetch.bind(globalThis)

async function run(): Promise<void> {
  const root = document.getElementById('root')
  if (root === null) throw new Error('desktop: missing #root')
  const bootstrap = await window.dshDesktop.bootstrap()
  window.__DSH_BOOT__ = bootstrap.graph
  installDesktopTransport()
  document.title = `DeepSeek Harness ${bootstrap.build.desktopVersion}`
  await new AppWebEntry(root, { loadBundle }).run()
  installTrajectoryPresentation()
  mountDesktopArtifactPreview()
  mountDesktopDocumentImport()
  installDesktopSettingsEntries()
  mountDesktopUpdateControl(bootstrap.build)
  mountDesktopPluginCenter(bootstrap.build)
  mountDesktopMcpConfig()
}

function installDesktopTransport(): void {
  globalThis.fetch = desktopFetch
  globalThis.WebSocket = DesktopWebSocket as unknown as typeof WebSocket
}

const desktopFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const target = desktopApiTarget(new URL(request.url))
  if (target === undefined) {
    return nativeFetch(request)
  }
  if (request.signal.aborted) throw abortReason(request.signal)
  const requestId = crypto.randomUUID()
  const onAbort = (): void => { window.dshDesktop.abortFetch(requestId) }
  request.signal.addEventListener('abort', onAbort, { once: true })
  try {
    const body = request.body === null ? undefined : new Uint8Array(await request.arrayBuffer())
    const artifactPreview = interceptArtifactPreviewRequest(request, body)
    if (artifactPreview !== undefined) return artifactPreview
    observeDocumentSessionRequest(request, body)
    const importedBody = prepareDocumentPrompt(request, body)
    const outboundBody = importedBody ?? body
    const response = await window.dshDesktop.fetch({
      requestId,
      url: target.href,
      method: request.method,
      headers: [...request.headers.entries()],
      ...(outboundBody === undefined ? {} : { body: outboundBody }),
    })
    const result = deserializeResponse(response)
    observeDocumentPromptResult(request, result)
    return result
  } finally {
    request.signal.removeEventListener('abort', onAbort)
  }
}

function desktopApiTarget(url: URL): URL | undefined {
  if (!url.pathname.startsWith('/api/')) return undefined
  if (url.origin === INTERNAL_ORIGIN) return url
  if (url.protocol === 'file:' && url.host === '') {
    return new URL(`${url.pathname}${url.search}`, INTERNAL_ORIGIN)
  }
  return undefined
}

function deserializeResponse(response: DesktopFetchResponse): Response {
  const body = response.status === 204 || response.status === 205 || response.status === 304
    ? null
    : Uint8Array.from(response.body).buffer
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

class DesktopWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly CONNECTING = DesktopWebSocket.CONNECTING
  readonly OPEN = DesktopWebSocket.OPEN
  readonly CLOSING = DesktopWebSocket.CLOSING
  readonly CLOSED = DesktopWebSocket.CLOSED
  readonly url: string
  readonly protocol = ''
  readonly extensions = ''
  readonly bufferedAmount = 0
  binaryType: BinaryType = 'blob'
  readyState = DesktopWebSocket.CONNECTING

  private readonly streamId = crypto.randomUUID()
  private readonly subscriptionId: number

  constructor(url: string | URL) {
    super()
    this.url = String(url)
    const kind = streamKind(this.url)
    this.subscriptionId = window.dshDesktop.subscribeStream((event) => { this.receive(event) })
    window.dshDesktop.openStream({ streamId: this.streamId, kind })
  }

  /** Downlink sockets never send frames; client responses use unary fetch. */
  send(): void {
    throw new DOMException('Desktop downlink sockets are receive-only', 'InvalidStateError')
  }

  /** Close the renderer-owned stream and publish the local close transition. */
  close(): void {
    if (this.readyState === DesktopWebSocket.CLOSED || this.readyState === DesktopWebSocket.CLOSING) return
    this.readyState = DesktopWebSocket.CLOSING
    window.dshDesktop.closeStream(this.streamId)
    this.finishClose()
  }

  private receive(event: DesktopStreamEvent): void {
    if (event.streamId !== this.streamId || this.readyState === DesktopWebSocket.CLOSED) return
    if (event.type === 'open') {
      if (this.readyState !== DesktopWebSocket.CONNECTING) return
      this.readyState = DesktopWebSocket.OPEN
      this.dispatchEvent(new Event('open'))
      return
    }
    if (event.type === 'message') {
      if (this.readyState === DesktopWebSocket.OPEN) {
        this.dispatchEvent(new MessageEvent('message', { data: event.data }))
      }
      return
    }
    if (event.type === 'error') {
      this.dispatchEvent(new Event('error'))
      return
    }
    this.finishClose()
  }

  private finishClose(): void {
    if (this.readyState === DesktopWebSocket.CLOSED) return
    this.readyState = DesktopWebSocket.CLOSED
    window.dshDesktop.unsubscribeStream(this.subscriptionId)
    this.dispatchEvent(new Event('close'))
  }
}

function streamKind(url: string): DesktopStreamKind {
  if (url.endsWith('/api/events.mux')) return 'mux'
  if (url.endsWith('/api/events.host')) return 'host'
  throw new Error(`desktop: refused WebSocket target ${JSON.stringify(url)}`)
}

async function loadBundle(url: string): Promise<void> {
  const source = await window.dshDesktop.readBundle(url)
  const objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  try {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = objectUrl
      script.addEventListener('load', () => {
        script.remove()
        resolve()
      }, { once: true })
      script.addEventListener('error', () => {
        script.remove()
        reject(new Error(`desktop: client bundle ${url} failed to execute`))
      }, { once: true })
      document.head.append(script)
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function renderFatal(error: unknown): void {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error)
  const target = document.querySelector<HTMLElement>('.desktop-boot__detail')
  if (target !== null) target.textContent = `启动失败\n\n${detail}`
  console.error(error)
}

void run().catch(renderFatal)
