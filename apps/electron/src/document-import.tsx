/** Renderer-side document import cards and prompt-context adapter. */

import { IconCloseOutline16, IconFolderOpenOutline16, IconPaperclipOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { createRoot, type Root } from 'react-dom/client'
import { useEffect, useState } from 'react'
import type { DesktopImportedDocument } from './protocol.ts'
import css from './document-import-ui.module.css'

const COMPOSER_SELECTOR = '[data-composer-card] .tools'
const IMPORT_ROOT_ATTRIBUTE = 'data-dsh-document-import'
const MAX_PROMPT_ITEMS = 200
const listeners = new Set<() => void>()
let imported: DesktopImportedDocument[] = []
let activeSessionId: string | undefined

/** Mount an Electron-only import affordance beside the official command button. */
export function mountDesktopDocumentImport(document: Document = globalThis.document): () => void {
  let mounted: { host: HTMLElement; root: Root; target: Element } | undefined
  let scheduled = false
  let disposed = false
  const sync = (): void => {
    scheduled = false
    if (disposed) return
    const target = document.querySelector(COMPOSER_SELECTOR)
    if (mounted !== undefined && mounted.target === target && mounted.host.isConnected) return
    if (mounted !== undefined) {
      mounted.root.unmount()
      mounted.host.remove()
      mounted = undefined
    }
    if (target === null) return
    const host = document.createElement('span')
    host.setAttribute(IMPORT_ROOT_ATTRIBUTE, '')
    target.append(host)
    const root = createRoot(host)
    root.render(<DocumentImportControl />)
    mounted = { host, root, target }
  }
  const schedule = (): void => {
    if (scheduled || disposed) return
    scheduled = true
    queueMicrotask(sync)
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  listeners.add(schedule)
  schedule()
  return () => {
    disposed = true
    observer.disconnect()
    listeners.delete(schedule)
    if (mounted !== undefined) {
      mounted.root.unmount()
      mounted.host.remove()
    }
  }
}

/**
 * Add the imported-document references to one official session.prompt envelope.
 * The resulting text goes through the normal Host prompt path and is therefore
 * durable session content; only metadata and paths are added, never full files.
 * @param request - outgoing internal API request.
 * @param body - serialized client-request envelope.
 * @returns rewritten JSON bytes, or undefined when no import is pending.
 */
export function prepareDocumentPrompt(request: Request, body: Uint8Array | undefined): Uint8Array | undefined {
  if (body === undefined || new URL(request.url).pathname !== '/api/session.prompt' || imported.length === 0) return undefined
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return undefined
  }
  if (!isRecord(value) || value.type !== 'client-request' || value.method !== 'session.prompt' || !isRecord(value.payload)) return undefined
  const content = Array.isArray(value.payload.content) ? value.payload.content : undefined
  if (content === undefined) return undefined
  const context = documentContext(imported)
  const textPart = content.find((part): part is Record<string, unknown> => isRecord(part) && part.type === 'text')
  if (textPart !== undefined && typeof textPart.text === 'string') {
    textPart.text = `${context}\n\n${textPart.text}`
  } else {
    content.unshift({ type: 'text', text: context })
  }
  return new TextEncoder().encode(JSON.stringify(value))
}

/** Drop pending cards when the official client navigates to another session. */
export function observeDocumentSessionRequest(request: Request, body: Uint8Array | undefined): void {
  if (body === undefined || !new URL(request.url).pathname.startsWith('/api/session.')) return
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return
  }
  if (!isRecord(value) || !isRecord(value.payload) || typeof value.payload.sessionId !== 'string') return
  const nextSessionId = value.payload.sessionId
  if (activeSessionId !== undefined && activeSessionId !== nextSessionId && imported.length > 0) {
    imported = []
    notify()
  }
  activeSessionId = nextSessionId
}

/** Clear cards after the Host accepted the associated prompt. */
export function observeDocumentPromptResult(request: Request, response: Response): void {
  if (new URL(request.url).pathname !== '/api/session.prompt' || response.status < 200 || response.status >= 300) return
  void response.clone().json().then((value: unknown) => {
    if (!isRecord(value) || value.type !== 'server-response' || !isRecord(value.result) || value.result.ok !== true) return
    imported = []
    notify()
  }, () => {})
}

function DocumentImportControl() {
  const [, redraw] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  useEffect(() => {
    const listener = (): void => { redraw(value => value + 1) }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])
  const choose = async (kind: 'files' | 'folder'): Promise<void> => {
    setMenuOpen(false)
    setBusy(true)
    setError(undefined)
    try {
      const next = kind === 'files' ? await window.dshDesktop.importFiles() : await window.dshDesktop.importFolder()
      if (next.length > 0) {
        imported = [...imported, ...next]
        notify()
      }
    } catch (reason: unknown) {
      setError(describe(reason))
    } finally {
      setBusy(false)
    }
  }
  const remove = (id: string): void => {
    imported = imported.filter(item => item.id !== id)
    notify()
  }
  return (
    <span className={css.root} data-dsh-document-import-control>
      <button
        type="button"
        className={css.trigger}
        aria-label="导入资料"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        disabled={busy}
        onMouseDown={(event) => { event.preventDefault() }}
        onClick={() => { setMenuOpen(open => !open) }}
      >
        <IconPaperclipOutline16 size={14} />
        {imported.length > 0 && <span className={css.badge}>{String(imported.length)}</span>}
      </button>
      {menuOpen && (
        <div className={css.menu} role="menu">
          <button type="button" role="menuitem" onClick={() => { void choose('files') }}>
            <IconPaperclipOutline16 size={14} />添加文件
          </button>
          <button type="button" role="menuitem" onClick={() => { void choose('folder') }}>
            <IconFolderOpenOutline16 size={14} />添加文件夹
          </button>
        </div>
      )}
      {imported.length > 0 && (
        <div className={css.rail} role="status" aria-label="已导入资料">
          {imported.map(item => (
            <span className={css.card} key={item.id} title={item.path}>
              <span className={css.cardName}>{item.name}</span>
              <small>{item.kind === 'folder' ? `${String(item.fileCount ?? 0)} 个文件夹内文件` : kindLabel(item.kind)}</small>
              <button type="button" aria-label={`移除 ${item.name}`} onClick={() => { remove(item.id) }}>
                <IconCloseOutline16 size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {error !== undefined && <span className={css.error} role="alert">{error}</span>}
    </span>
  )
}

function documentContext(items: readonly DesktopImportedDocument[]): string {
  const rows = items.slice(0, MAX_PROMPT_ITEMS).map((item) => {
    const detail = item.kind === 'folder'
      ? `文件夹，包含 ${String(item.fileCount ?? 0)} 个文件`
      : `${kindLabel(item.kind)}，${formatBytes(item.size)}`
    return `- ${item.name}（${detail}）：${item.path}`
  })
  const omitted = items.length > MAX_PROMPT_ITEMS ? `\n- 其余 ${String(items.length - MAX_PROMPT_ITEMS)} 项未列出，请先查看导入目录。` : ''
  return [
    '【Electron 本地资料】以下资料已复制到本机导入目录；Electron 不会自动上传文件内容，但资料名称和路径会随本轮提示发送给模型。请按需使用现有文件/目录工具读取；不要假设尚未读取的内容，也不要把整份大文件一次性复制进回答。',
    ...rows,
    omitted,
  ].filter(Boolean).join('\n')
}

function kindLabel(kind: DesktopImportedDocument['kind']): string {
  const labels: Record<DesktopImportedDocument['kind'], string> = {
    pdf: 'PDF', word: 'Word', excel: 'Excel', powerpoint: 'PPT', image: '图片', markdown: 'Markdown',
    code: '代码', text: '文本', folder: '文件夹', other: '文件',
  }
  return labels[kind]
}

function formatBytes(value: number): string {
  if (value < 1024) return `${String(value)} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function notify(): void {
  for (const listener of [...listeners]) listener()
}

function describe(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
