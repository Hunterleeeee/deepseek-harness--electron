/** Electron-only update control rendered beside the upstream-owned Web application. */

import {
  Button,
  IconCheckOutline16,
  IconCopyOutline16,
  IconDownloadOutline16,
  IconFolderOpenOutline16,
  IconRefreshOutline16,
  IconWarningOutline16,
  Modal,
  StateDot,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { DesktopBuildInfo, DesktopUpdatePhase, DesktopUpdateSnapshot } from './protocol.ts'
import css from './update-ui.module.css'

const UPDATE_STEPS: readonly string[] = [
  '准备环境',
  '同步源码',
  '安装依赖',
  '编译 Harness',
  '生成应用',
  '启动验证',
]
const BUSY_PHASES: ReadonlySet<DesktopUpdatePhase> = new Set([
  'checking',
  'preparing',
  'syncing',
  'installing-dependencies',
  'building',
  'packaging',
  'verifying',
  'installing',
])

/** Mount the desktop update control outside the upstream application's React root. */
export function mountDesktopUpdateControl(build: DesktopBuildInfo): void {
  const host = document.createElement('div')
  host.id = 'desktop-update-root'
  document.body.append(host)
  createRoot(host).render(<DesktopUpdateControl build={build} />)
}

function DesktopUpdateControl({ build }: { build: DesktopBuildInfo }) {
  const [open, setOpen] = useState(false)
  const [actionError, setActionError] = useState<string | undefined>()
  const [copied, setCopied] = useState(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [snapshot, setSnapshot] = useState<DesktopUpdateSnapshot>(() => ({
    phase: 'idle',
    message: '尚未检查上游更新',
    currentCommit: build.upstreamCommit,
    latestCommit: undefined,
    checkedAt: undefined,
    step: 0,
    stepCount: UPDATE_STEPS.length,
    logs: [],
    canInstall: false,
    error: undefined,
  }))

  useEffect(() => {
    const subscription = window.dshDesktop.subscribeUpdates(setSnapshot)
    void window.dshDesktop.getUpdateState().then(setSnapshot, (error: unknown) => {
      setActionError(describe(error))
    })
    return () => { window.dshDesktop.unsubscribeUpdates(subscription) }
  }, [])

  useEffect(() => {
    const openUpdater = (): void => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpen(true)
    }
    window.addEventListener('dsh-desktop:open-updater', openUpdater)
    return () => { window.removeEventListener('dsh-desktop:open-updater', openUpdater) }
  }, [])

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      document.querySelector<HTMLButtonElement>('[data-desktop-update-primary]')?.focus()
    })
    return () => { clearTimeout(timer) }
  }, [open, snapshot.phase])

  const close = useCallback(() => {
    setOpen(false)
    setTimeout(() => {
      if (returnFocusRef.current?.isConnected === true) returnFocusRef.current.focus()
    })
  }, [])

  const act = useCallback(async (operation: () => Promise<DesktopUpdateSnapshot>) => {
    setActionError(undefined)
    try {
      setSnapshot(await operation())
    } catch (error) {
      setActionError(describe(error))
    }
  }, [])

  const busy = BUSY_PHASES.has(snapshot.phase)
  const indicator = updateIndicator(snapshot.phase)
  const progress = Math.min(100, Math.max(0, (snapshot.step / snapshot.stepCount) * 100))
  const statusDetail = actionError ?? snapshot.error
  const checkedAt = useMemo(() => formatCheckedAt(snapshot.checkedAt), [snapshot.checkedAt])

  const copyLogs = useCallback(async () => {
    const accepted = await writeClipboard(snapshot.logs.join('\n'))
    setCopied(accepted)
    if (accepted) setTimeout(() => { setCopied(false) }, 1500)
  }, [snapshot.logs])

  return (
    <Modal
      open={open}
      onClose={close}
      title="桌面更新"
      closeLabel="关闭更新面板"
      description="从 DeepSeek 官方仓库构建并验证新版，不会修改当前源码工作区。"
      className={css.dialog ?? ''}
      contentClassName={css.content ?? ''}
      footer={(
        <UpdateActions
          snapshot={snapshot}
          busy={busy}
          onCheck={() => { void act(() => window.dshDesktop.checkForUpdates()) }}
          onStart={() => { void act(() => window.dshDesktop.startUpdate()) }}
          onReveal={() => {
            void window.dshDesktop.revealUpdate().catch((error: unknown) => { setActionError(describe(error)) })
          }}
          onInstall={() => { void act(() => window.dshDesktop.installUpdate()) }}
        />
      )}
    >
      <div className={css.status} aria-live="polite">
        <StateDot state={indicator} />
        <div className={css.statusCopy}>
          <strong>{snapshot.message}</strong>
          {checkedAt !== undefined && <span>上次检查：{checkedAt}</span>}
        </div>
      </div>

      <div className={css.commits}>
        <Commit label="当前" value={snapshot.currentCommit} />
        <span className={css.commitArrow} aria-hidden="true">→</span>
        <Commit label="官方" value={snapshot.latestCommit ?? '尚未检查'} />
      </div>

      {(snapshot.step > 0 || snapshot.phase === 'ready') && (
        <section className={css.progressSection} aria-label={`更新进度 ${String(Math.round(progress))}%`}>
          <div className={css.progressTrack} aria-hidden="true">
            <span className={css.progressFill} style={{ width: `${String(progress)}%` }} />
          </div>
          <ol className={css.steps}>
            {UPDATE_STEPS.map((label, index) => {
              const number = index + 1
              const done = snapshot.phase === 'ready' || number < snapshot.step
              const active = busy && number === snapshot.step
              return (
                <li key={label} className={done ? css.stepDone : active ? css.stepActive : css.stepPending}>
                  {done ? <IconCheckOutline16 size={14} /> : <span>{number}</span>}
                  {label}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {statusDetail !== undefined && (
        <div className={css.error} role="alert">
          <IconWarningOutline16 />
          <span>{statusDetail}</span>
        </div>
      )}

      {snapshot.phase === 'ready' && !snapshot.canInstall && (
        <p className={css.installHint}>
          当前应用位于只读磁盘映像或不可写目录。请在访达中把新版复制到“应用程序”后打开。
        </p>
      )}

      {snapshot.logs.length > 0 && (
        <details className={css.logs} open={snapshot.phase === 'error'}>
          <summary>
            <span>构建日志</span>
            <button type="button" className={css.copyLogs} onClick={(event) => {
              event.preventDefault()
              void copyLogs()
            }}>
              <IconCopyOutline16 size={14} />
              {copied ? '已复制' : '复制'}
            </button>
          </summary>
          <pre tabIndex={0}>{snapshot.logs.join('\n')}</pre>
        </details>
      )}
    </Modal>
  )
}

function UpdateActions({ snapshot, busy, onCheck, onStart, onReveal, onInstall }: {
  snapshot: DesktopUpdateSnapshot
  busy: boolean
  onCheck: () => void
  onStart: () => void
  onReveal: () => void
  onInstall: () => void
}) {
  if (snapshot.phase === 'ready') {
    return (
      <>
        <Button variant="outline" icon={<IconFolderOpenOutline16 />} onClick={onReveal}>
          在访达中查看
        </Button>
        {snapshot.canInstall && (
          <Button data-desktop-update-primary variant="primary" icon={<IconDownloadOutline16 />} onClick={onInstall}>
            安装并重启
          </Button>
        )}
      </>
    )
  }
  if (snapshot.phase === 'available' || (snapshot.phase === 'error' && snapshot.latestCommit !== undefined)) {
    return (
      <Button data-desktop-update-primary variant="primary" icon={<IconDownloadOutline16 />} onClick={onStart}>
        {snapshot.phase === 'error' ? '重新构建' : '下载并构建'}
      </Button>
    )
  }
  return (
    <Button
      data-desktop-update-primary
      variant="primary"
      icon={<IconRefreshOutline16 className={busy ? css.spinning : undefined} />}
      disabled={busy}
      onClick={onCheck}
    >
      {busy ? '正在处理…' : snapshot.phase === 'up-to-date' ? '再次检查' : '检查更新'}
    </Button>
  )
}

function Commit({ label, value }: { label: string; value: string }) {
  return (
    <div className={css.commit}>
      <span>{label}</span>
      <code title={value}>{shortCommit(value)}</code>
    </div>
  )
}

function updateIndicator(phase: DesktopUpdatePhase): 'done' | 'warning' | 'ongoing' | 'error' {
  if (BUSY_PHASES.has(phase)) return 'ongoing'
  if (phase === 'error') return 'error'
  if (phase === 'available') return 'warning'
  return 'done'
}

function shortCommit(value: string): string {
  return /^[0-9a-f]{40}$/u.test(value) ? value.slice(0, 10) : value
}

function formatCheckedAt(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? undefined : time.toLocaleString('zh-CN', { hour12: false })
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
