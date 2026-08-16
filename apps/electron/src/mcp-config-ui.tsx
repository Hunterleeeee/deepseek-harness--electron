/** Electron MCP server editor mounted beside the upstream settings UI. */

import { Button, IconPlusOutline16, IconRefreshOutline16, IconWarningOutline16, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { DesktopMcpServer, DesktopMcpSnapshot, DesktopMcpTransport } from './protocol.ts'
import css from './mcp-config-ui.module.css'

const OPEN_EVENT = 'dsh-desktop:open-mcp-config'

interface ServerDraft {
  enabled: boolean
  serverName: string
  transport: DesktopMcpTransport
  command: string
  args: string
  env: string
  cwd: string
  url: string
  headers: string
}

const EMPTY_DRAFT: ServerDraft = {
  enabled: true,
  serverName: '',
  transport: 'stdio',
  command: '',
  args: '',
  env: '',
  cwd: '',
  url: '',
  headers: '',
}

const INITIAL_SNAPSHOT: DesktopMcpSnapshot = {
  phase: 'idle',
  message: '正在读取 MCP 配置…',
  path: '',
  servers: [],
  restartRequired: false,
  error: undefined,
}

/** Mount the MCP editor outside the official React tree. */
export function mountDesktopMcpConfig(): void {
  const host = document.createElement('div')
  host.id = 'desktop-mcp-config-root'
  document.body.append(host)
  createRoot(host).render(<DesktopMcpConfig />)
}

function DesktopMcpConfig() {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<DesktopMcpSnapshot>(INITIAL_SNAPSHOT)
  const [drafts, setDrafts] = useState<ServerDraft[]>([])
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const subscription = window.dshDesktop.subscribeMcp(setSnapshot)
    void window.dshDesktop.getMcpState().then((value) => {
      setSnapshot(value)
      setDrafts(value.servers.map(toDraft))
    }, (reason: unknown) => { setError(describe(reason)) })
    const openEditor = (): void => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setError(undefined)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, openEditor)
    return () => {
      window.dshDesktop.unsubscribeMcp(subscription)
      window.removeEventListener(OPEN_EVENT, openEditor)
    }
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setTimeout(() => {
      if (returnFocusRef.current?.isConnected === true) returnFocusRef.current.focus()
    })
  }, [])

  const save = useCallback(async () => {
    setError(undefined)
    setBusy(true)
    try {
      const servers = drafts.map(fromDraft)
      const next = await window.dshDesktop.saveMcpServers(servers)
      setSnapshot(next)
    } catch (reason: unknown) {
      setError(describe(reason))
    } finally {
      setBusy(false)
    }
  }, [drafts])

  const restart = useCallback(async () => {
    setError(undefined)
    try {
      await window.dshDesktop.restartForMcp()
    } catch (reason: unknown) {
      setError(describe(reason))
    }
  }, [])

  return (
    <Modal
      open={open}
      onClose={close}
      title="MCP 配置"
      closeLabel="关闭 MCP 配置"
      description="把外部 MCP 服务器接入 Harness。stdio 会启动本机进程，HTTP 会访问你填写的地址；请只配置你信任的服务器。"
      className={css.dialog ?? ''}
      contentClassName={css.content ?? ''}
      footer={(
        <div className={css.footer}>
          <span className={css.status} aria-live="polite">{error ?? snapshot.message}</span>
          {snapshot.restartRequired ? (
            <Button variant="primary" onClick={() => { void restart() }}>重启并生效</Button>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => { void save() }}>
              {busy ? '正在保存…' : '保存配置'}
            </Button>
          )}
        </div>
      )}
    >
      <div className={css.notice}>
        <strong>配置位置</strong>
        <code>{snapshot.path || '应用 Harness home/mcp-servers.json'}</code>
        <span>密钥会以本机用户权限保存，不会自动同步到上游或其他设备。</span>
      </div>
      {(error ?? snapshot.error) !== undefined && (
        <div className={css.error} role="alert"><IconWarningOutline16 /><span>{error ?? snapshot.error}</span></div>
      )}
      <div className={css.toolbar}>
        <span className={css.toolbarTitle}>服务器（{String(drafts.length)}）</span>
        <button type="button" className={css.add} onClick={() => { setDrafts(current => [...current, { ...EMPTY_DRAFT }]) }}>
          <IconPlusOutline16 />添加服务器
        </button>
      </div>
      {drafts.length === 0 && <p className={css.empty}>还没有 MCP 服务器。添加后，重启应用即可让 Agent 看到它提供的工具。</p>}
      <div className={css.list}>
        {drafts.map((draft, index) => (
          <ServerForm
            key={`${draft.serverName}-${String(index)}`}
            draft={draft}
            index={index}
            onChange={(next) => { setDrafts(current => current.map((item, row) => row === index ? next : item)) }}
            onRemove={() => { setDrafts(current => current.filter((_item, row) => row !== index)) }}
          />
        ))}
      </div>
      {snapshot.restartRequired && <p className={css.restartHint}><IconRefreshOutline16 />配置已写入；需要重启后连接服务器并发现工具。</p>}
    </Modal>
  )
}

function ServerForm({ draft, index, onChange, onRemove }: {
  draft: ServerDraft
  index: number
  onChange: (draft: ServerDraft) => void
  onRemove: () => void
}) {
  const set = <K extends keyof ServerDraft>(key: K, value: ServerDraft[K]): void => { onChange({ ...draft, [key]: value }) }
  return (
    <section className={css.server} aria-labelledby={`mcp-server-${String(index)}`}>
      <div className={css.serverHeading}>
        <h3 id={`mcp-server-${String(index)}`}>服务器 {String(index + 1)}</h3>
        <label className={css.enabled}><input type="checkbox" checked={draft.enabled} onChange={(event) => { set('enabled', event.currentTarget.checked) }} />启用</label>
        <button type="button" className={css.remove} onClick={onRemove}>移除</button>
      </div>
      <div className={css.grid}>
        <label><span>serverName</span><input value={draft.serverName} placeholder="github" onChange={(event) => { set('serverName', event.currentTarget.value) }} /></label>
        <label><span>连接方式</span><select value={draft.transport} onChange={(event) => { set('transport', event.currentTarget.value as DesktopMcpTransport) }}><option value="stdio">stdio（本机命令）</option><option value="streamable-http">Streamable HTTP</option></select></label>
        {draft.transport === 'stdio' ? (
          <>
            <label className={css.wide}><span>启动命令</span><input value={draft.command} placeholder="npx" onChange={(event) => { set('command', event.currentTarget.value) }} /></label>
            <label className={css.wide}><span>参数（每行一个）</span><textarea value={draft.args} rows={2} placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/Users/me/Documents'} onChange={(event) => { set('args', event.currentTarget.value) }} /></label>
            <label className={css.wide}><span>环境变量（每行 KEY=VALUE）</span><textarea value={draft.env} rows={2} placeholder="GITHUB_TOKEN=…" onChange={(event) => { set('env', event.currentTarget.value) }} /></label>
            <label className={css.wide}><span>工作目录（可选）</span><input value={draft.cwd} placeholder="留空使用应用默认目录" onChange={(event) => { set('cwd', event.currentTarget.value) }} /></label>
          </>
        ) : (
          <>
            <label className={css.wide}><span>MCP URL</span><input value={draft.url} placeholder="https://example.com/mcp" onChange={(event) => { set('url', event.currentTarget.value) }} /></label>
            <label className={css.wide}><span>请求头（每行 KEY=VALUE）</span><textarea value={draft.headers} rows={2} placeholder="Authorization=Bearer …" onChange={(event) => { set('headers', event.currentTarget.value) }} /></label>
          </>
        )}
      </div>
    </section>
  )
}

function toDraft(server: DesktopMcpServer): ServerDraft {
  return {
    enabled: server.enabled,
    serverName: server.serverName,
    transport: server.transport,
    command: server.command ?? '',
    args: (server.args ?? []).join('\n'),
    env: recordLines(server.env),
    cwd: server.cwd ?? '',
    url: server.url ?? '',
    headers: recordLines(server.headers),
  }
}

function fromDraft(draft: ServerDraft): DesktopMcpServer {
  return draft.transport === 'stdio'
    ? {
      enabled: draft.enabled,
      serverName: draft.serverName.trim(),
      transport: draft.transport,
      command: draft.command,
      args: lines(draft.args),
      env: keyValueLines(draft.env),
      cwd: draft.cwd,
    }
    : {
      enabled: draft.enabled,
      serverName: draft.serverName.trim(),
      transport: draft.transport,
      url: draft.url.trim(),
      headers: keyValueLines(draft.headers),
    }
}

function lines(value: string): string[] {
  return value.split('\n').map(line => line.trim()).filter(line => line !== '')
}

function keyValueLines(value: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of value.split('\n').map(item => item.trim()).filter(item => item !== '')) {
    const separator = line.indexOf('=')
    if (separator <= 0) throw new Error(`无效的键值行：${line}`)
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return result
}

function recordLines(value: Record<string, string> | undefined): string {
  return value === undefined ? '' : Object.entries(value).map(([key, item]) => `${key}=${item}`).join('\n')
}

function describe(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}
