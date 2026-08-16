/** Electron-only plugin center rendered beside the upstream-owned Web application. */

import {
  Button,
  IconChevronDownOutline14,
  IconRefreshOutline16,
  IconSearchOutline16,
  IconShareOutline16,
  IconWarningOutline16,
  Modal,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  explainPlugin,
  PLUGIN_CATEGORY_LABELS,
  type DesktopPluginCategory,
  type DesktopPluginExplanation,
} from './plugin-catalog.ts'
import { summarizePluginCounts } from './plugin-counts.ts'
import type {
  DesktopBuildInfo,
  DesktopPluginPackage,
  DesktopPluginSnapshot,
  DesktopUpdateSnapshot,
} from './protocol.ts'
import css from './plugin-center-ui.module.css'

type CategoryFilter = 'all' | DesktopPluginCategory
type SourceFilter = 'all' | 'harness' | 'profile'

interface ExplainedPlugin {
  plugin: DesktopPluginPackage
  explanation: DesktopPluginExplanation
}

const INITIAL_SNAPSHOT: DesktopPluginSnapshot = {
  phase: 'idle',
  message: '正在读取插件信息…',
  checkedAt: undefined,
  busyPackage: undefined,
  restartRequired: false,
  error: undefined,
  packages: [],
}

/** Mount the desktop plugin center outside the upstream application's React root. */
export function mountDesktopPluginCenter(build: DesktopBuildInfo): void {
  const host = document.createElement('div')
  host.id = 'desktop-plugin-center-root'
  document.body.append(host)
  createRoot(host).render(<DesktopPluginCenter build={build} />)
}

function DesktopPluginCenter({ build }: { build: DesktopBuildInfo }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [source, setSource] = useState<SourceFilter>('all')
  const [expanded, setExpanded] = useState<string | undefined>()
  const [snapshot, setSnapshot] = useState<DesktopPluginSnapshot>(INITIAL_SNAPSHOT)
  const [harnessUpdate, setHarnessUpdate] = useState<DesktopUpdateSnapshot | undefined>()
  const [actionError, setActionError] = useState<string | undefined>()
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const checkedOnOpen = useRef(false)

  useEffect(() => {
    const pluginSubscription = window.dshDesktop.subscribePlugins(setSnapshot)
    const updateSubscription = window.dshDesktop.subscribeUpdates(setHarnessUpdate)
    void Promise.all([
      window.dshDesktop.getPluginState(),
      window.dshDesktop.getUpdateState(),
    ]).then(([plugins, update]) => {
      setSnapshot(plugins)
      setHarnessUpdate(update)
    }, (error: unknown) => { setActionError(describe(error)) })
    return () => {
      window.dshDesktop.unsubscribePlugins(pluginSubscription)
      window.dshDesktop.unsubscribeUpdates(updateSubscription)
    }
  }, [])

  useEffect(() => {
    const openPluginCenter = (): void => {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setOpen(true)
    }
    window.addEventListener('dsh-desktop:open-plugin-center', openPluginCenter)
    return () => { window.removeEventListener('dsh-desktop:open-plugin-center', openPluginCenter) }
  }, [])

  const checkAll = useCallback(async () => {
    setActionError(undefined)
    const operations: Promise<unknown>[] = [window.dshDesktop.checkPluginUpdates()]
    if (harnessUpdate?.phase !== 'checking') operations.push(window.dshDesktop.checkForUpdates())
    const results = await Promise.allSettled(operations)
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') setActionError(describe(failure.reason))
  }, [harnessUpdate?.phase])

  useEffect(() => {
    if (!open || checkedOnOpen.current) return
    checkedOnOpen.current = true
    void window.dshDesktop.checkPluginUpdates().catch((error: unknown) => { setActionError(describe(error)) })
  }, [open])

  const explained = useMemo<ExplainedPlugin[]>(() => snapshot.packages.map(plugin => ({
    plugin,
    explanation: explainPlugin(plugin),
  })), [snapshot.packages])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visible = useMemo(() => explained.filter(({ plugin, explanation }) => {
    if (category !== 'all' && explanation.category !== category) return false
    if (source !== 'all' && plugin.source !== source) return false
    if (normalizedQuery === '') return true
    return [
      plugin.packageName,
      plugin.description ?? '',
      explanation.name,
      explanation.summary,
      ...plugin.entries.flatMap(entry => [entry.entryId, entry.moduleName]),
    ].some(value => value.toLocaleLowerCase().includes(normalizedQuery))
  }).sort(comparePlugins), [category, explained, normalizedQuery, source])

  useEffect(() => {
    if (expanded !== undefined && !visible.some(({ plugin }) => plugin.packageName === expanded)) {
      setExpanded(undefined)
    }
  }, [expanded, visible])

  const updateCount = snapshot.packages.filter(plugin => plugin.latestVersion !== undefined).length
  const harnessAvailable = harnessUpdate?.phase === 'available'
  const hasUpdates = updateCount > 0 || harnessAvailable
  const busy = snapshot.phase === 'checking' || snapshot.phase === 'updating' || harnessUpdate?.phase === 'checking'
  const counts = summarizePluginCounts(snapshot.packages)
  const visibleEntryCount = visible.reduce((total, item) => total + item.plugin.entries.length, 0)

  const close = useCallback(() => {
    setOpen(false)
    setTimeout(() => {
      if (returnFocusRef.current?.isConnected === true) returnFocusRef.current.focus()
    })
  }, [])

  return (
    <Modal
      open={open}
      onClose={close}
      title="插件中心"
      closeLabel="关闭插件中心"
      description="看懂当前插件的作用、来源和影响；内置插件随 Harness 更新，外部插件独立检查。"
      className={css.dialog ?? ''}
      contentClassName={css.content ?? ''}
      footer={(
        <div className={css.footerActions}>
          <span className={css.footerStatus} aria-live="polite">{snapshot.message}</span>
          {snapshot.restartRequired ? (
            <Button variant="primary" onClick={() => {
              void window.dshDesktop.restartForPlugins().catch((error: unknown) => { setActionError(describe(error)) })
            }}>
              重启并生效
            </Button>
          ) : (
            <Button
              variant="primary"
              icon={<IconRefreshOutline16 className={busy ? css.spinning : undefined} />}
              disabled={busy}
              onClick={() => { void checkAll() }}
            >
              {busy ? '正在检查…' : '检查全部更新'}
            </Button>
          )}
        </div>
      )}
    >
      <div className={css.overview}>
        <OverviewStat label="官方列表条目" value={counts.loaderEntries} />
        <OverviewStat label="合并后插件包" value={counts.packages} />
        <OverviewStat label="运行中的包" value={counts.runningPackages} />
        <OverviewStat label="外部安装包" value={counts.externalPackages} />
        <OverviewStat label="可更新项" value={updateCount + (harnessAvailable ? 1 : 0)} warn={hasUpdates} />
      </div>
      <p className={css.countHint}>官方“插件列表”按 Loader 条目计数；下方将同一 npm 包的多个条目合并为一张卡片。</p>

      <section className={css.updateSummary} aria-label="插件更新方式">
        <div>
          <StateDot state={harnessUpdateState(harnessUpdate)} />
          <span>
            <strong>内置插件</strong>
            随 Harness {build.harnessVersion} 一起更新
          </span>
        </div>
        <button type="button" onClick={() => {
          setOpen(false)
          window.dispatchEvent(new CustomEvent('dsh-desktop:open-updater'))
        }}>
          {harnessAvailable ? '有新版，前往更新' : '打开 Harness 更新'}
        </button>
      </section>

      {(actionError ?? snapshot.error) !== undefined && (
        <div className={css.error} role="alert">
          <IconWarningOutline16 />
          <span>{actionError ?? snapshot.error}</span>
        </div>
      )}

      <div className={css.toolbar}>
        <label className={css.search}>
          <IconSearchOutline16 aria-hidden="true" />
          <span className={css.visuallyHidden}>搜索插件</span>
          <input
            type="search"
            value={query}
            placeholder="搜索名称、用途或条目…"
            onChange={(event) => { setQuery(event.currentTarget.value) }}
          />
        </label>
        <label className={css.selectLabel}>
          <span className={css.visuallyHidden}>按类型筛选</span>
          <select value={category} onChange={(event) => { setCategory(event.currentTarget.value as CategoryFilter) }}>
            <option value="all">全部类型</option>
            {Object.entries(PLUGIN_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className={css.selectLabel}>
          <span className={css.visuallyHidden}>按来源筛选</span>
          <select value={source} onChange={(event) => { setSource(event.currentTarget.value as SourceFilter) }}>
            <option value="all">全部来源</option>
            <option value="harness">Harness 内置</option>
            <option value="profile">外部安装</option>
          </select>
        </label>
      </div>

      <div className={css.catalogHeading}>
        <h3>插件包（按 npm 包聚合）</h3>
        <span data-dsh-plugin-count-summary>
          {visible.length} / {explained.length} 个包 · {visibleEntryCount} / {counts.loaderEntries} 个条目
        </span>
      </div>
      {snapshot.packages.length === 0 && snapshot.phase === 'idle' && <p className={css.empty}>正在读取插件…</p>}
      {snapshot.packages.length > 0 && visible.length === 0 && <p className={css.empty}>没有匹配的插件。</p>}
      {visible.length > 0 && (
        <ul className={css.pluginList} aria-busy={busy}>
          {visible.map(({ plugin, explanation }) => (
            <PluginRow
              key={plugin.packageName}
              plugin={plugin}
              explanation={explanation}
              open={expanded === plugin.packageName}
              busy={snapshot.busyPackage === plugin.packageName}
              onToggle={() => {
                setExpanded(current => current === plugin.packageName ? undefined : plugin.packageName)
              }}
              onUpdate={() => {
                setActionError(undefined)
                void window.dshDesktop.updatePlugin(plugin.packageName).then(setSnapshot, (error: unknown) => {
                  setActionError(describe(error))
                })
              }}
            />
          ))}
        </ul>
      )}
    </Modal>
  )
}

function PluginRow({ plugin, explanation, open, busy, onToggle, onUpdate }: {
  plugin: DesktopPluginPackage
  explanation: DesktopPluginExplanation
  open: boolean
  busy: boolean
  onToggle: () => void
  onUpdate: () => void
}) {
  const status = pluginStatus(plugin)
  const detailId = `desktop-plugin-${encodeURIComponent(plugin.packageName)}`
  return (
    <li className={css.pluginCard} data-open={open ? 'true' : undefined}>
      <button
        type="button"
        className={css.pluginHeader}
        aria-expanded={open}
        aria-controls={detailId}
        onClick={onToggle}
      >
        <span className={css.pluginIdentity}>
          <span className={css.pluginTitleLine}>
            <strong>{explanation.name}</strong>
            <span>{PLUGIN_CATEGORY_LABELS[explanation.category]}</span>
          </span>
          <span className={css.pluginSummary}>{explanation.summary}</span>
          <code>{plugin.packageName}</code>
        </span>
        <span className={css.pluginTrailing}>
          <span className={css.runtimeTag} data-state={status.state}>{status.label}</span>
          <span className={css.sourceTag} data-source={plugin.source}>
            {plugin.source === 'harness' ? '内置' : '外部'}
          </span>
          {plugin.latestVersion !== undefined && <span className={css.updateTag}>可更新</span>}
          <IconChevronDownOutline14 className={css.chevron} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div className={css.pluginDetails} id={detailId}>
          <div className={css.explanationGrid}>
            <DetailBlock label="什么时候会用到" value={explanation.whenUsed} />
            <DetailBlock label="停用后会怎样" value={explanation.disableImpact} />
          </div>
          <div className={css.capabilities}>
            <strong>涉及能力</strong>
            <span>最终访问范围仍受 Harness 权限和插件配置约束</span>
            <div>{explanation.capabilities.map(capability => <span key={capability}>{capability}</span>)}</div>
          </div>
          <dl className={css.metadata}>
            <div><dt>版本</dt><dd><code>{plugin.version ?? '未声明'}</code></dd></div>
            <div><dt>更新方式</dt><dd>{updatePolicy(plugin)}</dd></div>
            {plugin.description !== undefined && <div><dt>包描述</dt><dd>{plugin.description}</dd></div>}
            {plugin.dependencySpec !== undefined && <div><dt>安装范围</dt><dd><code>{plugin.dependencySpec}</code></dd></div>}
          </dl>
          {plugin.entries.length > 0 ? (
            <details className={css.technicalDetails}>
              <summary>运行条目（{plugin.entries.length}）</summary>
              <ul>{plugin.entries.map(entry => (
                <li key={entry.entryId}>
                  <code>{entry.entryId}</code>
                  <span>{entry.enabled ? phaseLabel(entry.fiberPhase) : '已停用'}</span>
                </li>
              ))}</ul>
            </details>
          ) : <p className={css.inactiveHint}>这个包已安装，但没有加入当前插件树。</p>}
          {plugin.dependencies.length > 0 && (
            <details className={css.technicalDetails}>
              <summary>插件依赖（{plugin.dependencies.length}）</summary>
              <ul>{plugin.dependencies.map(dependency => <li key={dependency}><code>{dependency}</code></li>)}</ul>
            </details>
          )}
          <div className={css.pluginActions}>
            {plugin.repositoryUrl !== undefined && (
              <a href={plugin.repositoryUrl} target="_blank" rel="noreferrer">
                <IconShareOutline16 size={14} />
                查看源码
              </a>
            )}
            {plugin.latestVersion !== undefined && (
              <Button size="sm" variant="primary" disabled={busy} onClick={onUpdate}>
                {busy ? '正在更新…' : `更新到 ${plugin.latestVersion}`}
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

function OverviewStat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return <div className={css.overviewStat} data-warn={warn ? 'true' : undefined}><strong>{value}</strong><span>{label}</span></div>
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return <div><strong>{label}</strong><p>{value}</p></div>
}

function comparePlugins(left: ExplainedPlugin, right: ExplainedPlugin): number {
  const category = Object.keys(PLUGIN_CATEGORY_LABELS)
  const categoryOrder = category.indexOf(left.explanation.category) - category.indexOf(right.explanation.category)
  return categoryOrder || left.explanation.name.localeCompare(right.explanation.name, 'zh-CN')
}

function pluginStatus(plugin: DesktopPluginPackage): { state: string; label: string } {
  if (plugin.entries.length === 0) return { state: 'unused', label: '未加入' }
  if (plugin.entries.every(entry => !entry.enabled)) return { state: 'disabled', label: '已停用' }
  if (plugin.entries.some(entry => entry.enabled && entry.fiberPhase === 'failed')) return { state: 'failed', label: '加载失败' }
  if (plugin.entries.some(entry => entry.enabled && entry.fiberPhase === 'active')) return { state: 'active', label: '运行中' }
  return { state: 'pending', label: '等待依赖' }
}

function phaseLabel(phase: DesktopPluginPackage['entries'][number]['fiberPhase']): string {
  if (phase === null) return '未挂载'
  return {
    pending: '等待依赖',
    loading: '加载中',
    active: '运行中',
    failed: '加载失败',
    unloading: '卸载中',
  }[phase]
}

function updatePolicy(plugin: DesktopPluginPackage): string {
  if (plugin.updateKind === 'harness') return '随 Harness 桌面更新'
  if (plugin.updateKind === 'manual') return '本地 / Git 来源，需要按原来源手动更新'
  return plugin.latestVersion === undefined ? '外部插件，可独立检查' : `发现 ${plugin.latestVersion}`
}

function harnessUpdateState(update: DesktopUpdateSnapshot | undefined): 'done' | 'warning' | 'ongoing' | 'error' {
  if (update?.phase === 'checking') return 'ongoing'
  if (update?.phase === 'error') return 'error'
  if (update?.phase === 'available') return 'warning'
  return 'done'
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
