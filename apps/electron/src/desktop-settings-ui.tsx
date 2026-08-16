/** Electron-only entries mounted into the official General settings slot. */

import {
  IconBranchOutline16,
  IconCodeOutline16,
  IconRefreshOutline16,
  IconRightUpOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { summarizePluginCounts } from './plugin-counts.ts'
import type { DesktopPluginSnapshot, DesktopUpdateSnapshot } from './protocol.ts'
import css from './desktop-settings-ui.module.css'

const GENERAL_SLOT_SELECTOR = '[data-slot="settings.general.item"]'

/** Keep one desktop-management row attached whenever the official General settings page is mounted. */
export function installDesktopSettingsEntries(document: Document = globalThis.document): () => void {
  let mounted: { host: HTMLElement; root: Root; target: Element } | undefined
  let scheduled = false
  let disposed = false
  const sync = (): void => {
    scheduled = false
    if (disposed) return
    const target = document.querySelector(GENERAL_SLOT_SELECTOR)
    if (mounted !== undefined && mounted.target === target && mounted.host.isConnected) return
    if (mounted !== undefined) {
      mounted.root.unmount()
      mounted.host.remove()
      mounted = undefined
    }
    if (target === null) return
    const host = document.createElement('div')
    host.setAttribute('data-dsh-desktop-settings', '')
    target.append(host)
    const root = createRoot(host)
    root.render(<DesktopSettingsEntries />)
    mounted = { host, root, target }
  }
  const schedule = (): void => {
    if (scheduled || disposed) return
    scheduled = true
    queueMicrotask(sync)
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, { childList: true, subtree: true })
  schedule()
  return () => {
    disposed = true
    observer.disconnect()
    if (mounted !== undefined) {
      mounted.root.unmount()
      mounted.host.remove()
    }
  }
}

function DesktopSettingsEntries() {
  const [update, setUpdate] = useState<DesktopUpdateSnapshot | undefined>()
  const [plugins, setPlugins] = useState<DesktopPluginSnapshot | undefined>()
  const [statusError, setStatusError] = useState<string | undefined>()

  useEffect(() => {
    const updateSubscription = window.dshDesktop.subscribeUpdates(setUpdate)
    const pluginSubscription = window.dshDesktop.subscribePlugins(setPlugins)
    void Promise.all([
      window.dshDesktop.getUpdateState(),
      window.dshDesktop.getPluginState(),
    ]).then(([nextUpdate, nextPlugins]) => {
      setUpdate(nextUpdate)
      setPlugins(nextPlugins)
    }, (error: unknown) => { setStatusError(describe(error)) })
    return () => {
      window.dshDesktop.unsubscribeUpdates(updateSubscription)
      window.dshDesktop.unsubscribePlugins(pluginSubscription)
    }
  }, [])

  const pluginUpdates = plugins?.packages.filter(plugin => plugin.latestVersion !== undefined).length ?? 0
  const pluginCounts = summarizePluginCounts(plugins?.packages ?? [])
  return (
    <section className={css.section} aria-labelledby="dsh-desktop-settings-title">
      <div className={css.intro}>
        <div>
          <h2 id="dsh-desktop-settings-title">桌面版</h2>
          <p>管理 Electron 壳、上游 Harness 和外部插件，不占用任务与轨迹界面。</p>
        </div>
        <span>仅本机</span>
      </div>
      <div className={css.cards}>
        <button
          type="button"
          className={css.card}
          aria-label="检查桌面更新"
          onClick={() => { openDesktopPanel('dsh-desktop:open-updater') }}
        >
          <span className={css.icon}><IconRefreshOutline16 /></span>
          <span className={css.cardCopy}>
            <strong>桌面更新</strong>
            <small>{statusError ?? update?.message ?? '读取更新状态…'}</small>
          </span>
          {update?.phase === 'available' && <span className={css.dot} aria-label="有可用更新" />}
          <IconRightUpOutline16 className={css.arrow} />
        </button>
        <button
          type="button"
          className={css.card}
          aria-label="打开插件中心"
          onClick={() => { openDesktopPanel('dsh-desktop:open-plugin-center') }}
        >
          <span className={css.icon}><IconBranchOutline16 /></span>
          <span className={css.cardCopy}>
            <strong>插件中心</strong>
            <small>{statusError ?? (plugins === undefined
              ? '读取插件状态…'
              : `${String(pluginCounts.loaderEntries)} 个列表条目 · ${String(pluginCounts.packages)} 个插件包`)}</small>
          </span>
          {pluginUpdates > 0 && <span className={css.dot} aria-label={`${String(pluginUpdates)} 个插件可更新`} />}
          <IconRightUpOutline16 className={css.arrow} />
        </button>
        <button
          type="button"
          className={css.card}
          aria-label="打开 MCP 配置"
          onClick={() => { openDesktopPanel('dsh-desktop:open-mcp-config') }}
        >
          <span className={css.icon}><IconCodeOutline16 /></span>
          <span className={css.cardCopy}>
            <strong>MCP 配置</strong>
            <small>连接外部工具服务器，重启后生效</small>
          </span>
          <IconRightUpOutline16 className={css.arrow} />
        </button>
      </div>
    </section>
  )
}

function openDesktopPanel(eventName: string): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  setTimeout(() => { window.dispatchEvent(new Event(eventName)) })
}

function describe(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}
