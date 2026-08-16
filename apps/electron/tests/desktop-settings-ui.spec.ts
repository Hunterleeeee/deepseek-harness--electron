/** @vitest-environment jsdom */

import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installDesktopSettingsEntries } from '../src/desktop-settings-ui.tsx'
import type {
  DesktopBridge,
  DesktopPluginSnapshot,
  DesktopUpdateSnapshot,
} from '../src/protocol.ts'

const update: DesktopUpdateSnapshot = {
  phase: 'available',
  message: '发现上游更新',
  currentCommit: 'current',
  latestCommit: 'latest',
  checkedAt: undefined,
  step: 0,
  stepCount: 6,
  logs: [],
  canInstall: false,
  error: undefined,
}
const plugins: DesktopPluginSnapshot = {
  phase: 'ready',
  message: '插件信息已就绪',
  checkedAt: undefined,
  busyPackage: undefined,
  restartRequired: false,
  error: undefined,
  packages: [],
}

let dispose: (() => void) | undefined

beforeEach(() => {
  document.body.replaceChildren()
  installBridge()
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
})

describe('desktop settings entries', () => {
  it('mounts update, plugin, and MCP entry points only inside General settings', async () => {
    dispose = installDesktopSettingsEntries(document)
    expect(document.querySelector('[aria-label="检查桌面更新"]')).toBeNull()

    const slot = document.createElement('div')
    slot.setAttribute('data-slot', 'settings.general.item')
    await act(async () => {
      document.body.append(slot)
      await settle()
    })

    const updateButton = slot.querySelector<HTMLButtonElement>('[aria-label="检查桌面更新"]')
    const pluginButton = slot.querySelector<HTMLButtonElement>('[aria-label="打开插件中心"]')
    const mcpButton = slot.querySelector<HTMLButtonElement>('[aria-label="打开 MCP 配置"]')
    expect(updateButton?.textContent).toContain('发现上游更新')
    expect(pluginButton?.textContent).toContain('插件中心')
    expect(mcpButton?.textContent).toContain('MCP 配置')
    expect(document.querySelectorAll('[data-dsh-desktop-settings]')).toHaveLength(1)

    const openedUpdater = vi.fn()
    const openedPlugins = vi.fn()
    const openedMcp = vi.fn()
    window.addEventListener('dsh-desktop:open-updater', openedUpdater)
    window.addEventListener('dsh-desktop:open-plugin-center', openedPlugins)
    window.addEventListener('dsh-desktop:open-mcp-config', openedMcp)
    await act(async () => {
      updateButton?.click()
      pluginButton?.click()
      mcpButton?.click()
      await settle()
    })
    expect(openedUpdater).toHaveBeenCalledOnce()
    expect(openedPlugins).toHaveBeenCalledOnce()
    expect(openedMcp).toHaveBeenCalledOnce()
    window.removeEventListener('dsh-desktop:open-updater', openedUpdater)
    window.removeEventListener('dsh-desktop:open-plugin-center', openedPlugins)
    window.removeEventListener('dsh-desktop:open-mcp-config', openedMcp)

    await act(async () => {
      slot.remove()
      await settle()
    })
    expect(document.querySelector('[data-dsh-desktop-settings]')).toBeNull()
  })
})

function installBridge(): void {
  let subscription = 0
  const bridge = {
    getUpdateState: vi.fn(async () => update),
    getPluginState: vi.fn(async () => plugins),
    subscribeUpdates: vi.fn(() => ++subscription),
    unsubscribeUpdates: vi.fn(),
    subscribePlugins: vi.fn(() => ++subscription),
    unsubscribePlugins: vi.fn(),
  } as unknown as DesktopBridge
  Object.defineProperty(window, 'dshDesktop', { configurable: true, value: bridge })
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}
