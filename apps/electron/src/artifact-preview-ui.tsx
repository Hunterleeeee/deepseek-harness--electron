/** Electron-only in-app preview for official produced-file links. */

import {
  IconCloseOutline16,
  IconCodeOutline16,
  IconCopyOutline16,
  IconFolderOpenOutline16,
  IconInspectOutline12,
  IconRightUpOutline16,
  MarkdownText,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { DesktopArtifactPreview } from './protocol.ts'
import css from './artifact-preview-ui.module.css'

const OPEN_EVENT = 'dsh-desktop:preview-artifact'
const PREVIEW_INTENT_MS = 1_000
let previewIntentExpiresAt = 0

/** Mount the artifact drawer and intercept only the official produced-file affordances. */
export function mountDesktopArtifactPreview(document: Document = globalThis.document): () => void {
  const host = document.createElement('div')
  host.id = 'desktop-artifact-preview-root'
  document.body.append(host)
  const root = createRoot(host)
  root.render(<DesktopArtifactPreviewDrawer />)
  const capture = (event: MouseEvent): void => {
    if (event.button !== 0 || !(event.target instanceof Element)) return
    const button = event.target.closest<HTMLButtonElement>('button')
    if (button === null) return
    const producedFile = button.closest('[data-produced-files-row]') !== null
    const inlineFileMention = button.parentElement?.tagName === 'CODE' && button.title !== ''
    if (!producedFile && !inlineFileMention) return
    previewIntentExpiresAt = Date.now() + PREVIEW_INTENT_MS
  }
  document.addEventListener('click', capture, true)
  return () => {
    previewIntentExpiresAt = 0
    document.removeEventListener('click', capture, true)
    root.unmount()
    host.remove()
  }
}

/**
 * Replace one official `host.openPath` response after a produced-file click with an in-app preview request.
 * @param request - outbound fetch whose body has already been serialized.
 * @param body - serialized client-request envelope.
 * @returns A successful Host response when consumed, otherwise undefined for the normal desktop transport.
 */
export function interceptArtifactPreviewRequest(
  request: Request,
  body: Uint8Array | undefined,
): Response | undefined {
  if (Date.now() > previewIntentExpiresAt || body === undefined) return undefined
  if (new URL(request.url).pathname !== '/api/host.openPath') return undefined
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return undefined
  }
  if (!isRecord(value)
    || value.type !== 'client-request'
    || typeof value.rpcId !== 'string'
    || value.method !== 'host.openPath'
    || !isRecord(value.payload)
    || typeof value.payload.path !== 'string') return undefined
  previewIntentExpiresAt = 0
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: value.payload.path }))
  return new Response(JSON.stringify({
    type: 'server-response',
    rpcId: value.rpcId,
    result: { ok: true, value: { opened: true } },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function DesktopArtifactPreviewDrawer() {
  const [path, setPath] = useState<string | undefined>()
  const [artifact, setArtifact] = useState<DesktopArtifactPreview | undefined>()
  const [mode, setMode] = useState<'preview' | 'source'>('preview')
  const [error, setError] = useState<string | undefined>()
  const [copied, setCopied] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const requestGeneration = useRef(0)

  useEffect(() => {
    const open = (event: Event): void => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setPath(event.detail)
      setArtifact(undefined)
      setError(undefined)
      setMode('preview')
    }
    window.addEventListener(OPEN_EVENT, open)
    return () => { window.removeEventListener(OPEN_EVENT, open) }
  }, [])

  useEffect(() => {
    if (path === undefined) return
    const generation = ++requestGeneration.current
    void window.dshDesktop.previewArtifact(path).then((value) => {
      if (generation !== requestGeneration.current) return
      setArtifact(value)
    }, (reason: unknown) => {
      if (generation !== requestGeneration.current) return
      setError(describe(reason))
    })
  }, [path])

  useEffect(() => {
    if (path === undefined) return
    const timer = setTimeout(() => { closeRef.current?.focus() })
    return () => { clearTimeout(timer) }
  }, [path])

  const close = useCallback(() => {
    requestGeneration.current++
    setPath(undefined)
    setArtifact(undefined)
    setError(undefined)
    setTimeout(() => {
      if (returnFocusRef.current?.isConnected === true) returnFocusRef.current.focus()
    })
  }, [])

  useEffect(() => {
    if (path === undefined) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [close, path])

  if (path === undefined) return null
  const availablePath = artifact?.path ?? path
  const openNative = (): void => {
    setError(undefined)
    void window.dshDesktop.openArtifact(availablePath).catch((reason: unknown) => { setError(describe(reason)) })
  }
  const reveal = (): void => {
    setError(undefined)
    void window.dshDesktop.revealArtifact(availablePath).catch((reason: unknown) => { setError(describe(reason)) })
  }
  const copyPath = (): void => {
    void writeClipboard(availablePath).then((accepted) => {
      setCopied(accepted)
      if (accepted) setTimeout(() => { setCopied(false) }, 1_500)
    })
  }

  return (
    <aside className={css.drawer} role="dialog" aria-modal="false" aria-label="产物预览" data-dsh-artifact-drawer>
      <header className={css.header}>
        <div className={css.titleBlock}>
          <div className={css.eyebrow}><IconInspectOutline12 /> 产物预览</div>
          <h2>{artifact?.name ?? '正在读取…'}</h2>
          <p title={availablePath}>{availablePath}</p>
        </div>
        <button ref={closeRef} type="button" className={css.iconButton} aria-label="关闭产物预览" onClick={close}>
          <IconCloseOutline16 />
        </button>
      </header>

      <div className={css.toolbar}>
        {artifact?.kind === 'markdown' && artifact.content !== undefined && (
          <div className={css.segments} role="group" aria-label="Markdown 显示方式">
            <button type="button" aria-pressed={mode === 'preview'} onClick={() => { setMode('preview') }}>
              <IconInspectOutline12 />渲染
            </button>
            <button type="button" aria-pressed={mode === 'source'} onClick={() => { setMode('source') }}>
              <IconCodeOutline16 size={13} />源码
            </button>
          </div>
        )}
        <span className={css.meta}>{artifact === undefined ? '读取中' : `${formatBytes(artifact.size)} · ${kindLabel(artifact.kind)}`}</span>
        <div className={css.actions}>
          <button type="button" onClick={copyPath}><IconCopyOutline16 />{copied ? '已复制' : '复制路径'}</button>
          <button type="button" onClick={reveal}><IconFolderOpenOutline16 />Finder</button>
          <button type="button" onClick={openNative}><IconRightUpOutline16 />系统打开</button>
        </div>
      </div>

      <div className={css.content}>
        {artifact === undefined && error === undefined && <p className={css.state} aria-live="polite">正在读取产物…</p>}
        {error !== undefined && <p className={css.error} role="alert">{error}</p>}
        {artifact !== undefined && <ArtifactContent artifact={artifact} mode={mode} />}
      </div>
    </aside>
  )
}

function ArtifactContent({ artifact, mode }: {
  artifact: DesktopArtifactPreview
  mode: 'preview' | 'source'
}) {
  if (artifact.tooLarge) {
    return <p className={css.state}>文件过大，未载入应用内预览。可以使用“系统打开”或“Finder”。</p>
  }
  if (artifact.kind === 'image' && artifact.dataUrl !== undefined) {
    return <div className={css.imageStage}><img src={artifact.dataUrl} alt={artifact.name} /></div>
  }
  if (artifact.kind === 'markdown' && artifact.content !== undefined && mode === 'preview') {
    return <article className={css.markdown}><MarkdownText text={artifact.content} /></article>
  }
  if ((artifact.kind === 'markdown' || artifact.kind === 'text') && artifact.content !== undefined) {
    return <pre className={css.source} tabIndex={0}>{artifact.content}</pre>
  }
  return <p className={css.state}>这种文件暂不支持应用内预览，可以使用“系统打开”查看。</p>
}

function kindLabel(kind: DesktopArtifactPreview['kind']): string {
  if (kind === 'markdown') return 'Markdown'
  if (kind === 'image') return '图片'
  if (kind === 'text') return '文本'
  return '其他文件'
}

function formatBytes(value: number): string {
  if (value < 1024) return `${String(value)} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function describe(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
