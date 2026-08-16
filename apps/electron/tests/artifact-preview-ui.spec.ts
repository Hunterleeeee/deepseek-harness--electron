/** @vitest-environment jsdom */

import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  interceptArtifactPreviewRequest,
  mountDesktopArtifactPreview,
} from '../src/artifact-preview-ui.tsx'
import type { DesktopArtifactPreview, DesktopBridge } from '../src/protocol.ts'

const path = '/workspace/report.md'
const artifact: DesktopArtifactPreview = {
  path,
  name: 'report.md',
  kind: 'markdown',
  size: 18,
  mimeType: 'text/markdown',
  content: '# Report\n\nHello',
  dataUrl: undefined,
  tooLarge: false,
}

let dispose: (() => void) | undefined

beforeEach(() => {
  document.body.replaceChildren()
})

afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
})

describe('desktop artifact preview UI', () => {
  it('turns one official produced-file open into a Markdown drawer', async () => {
    const previewArtifact = vi.fn(async () => artifact)
    installBridge({ previewArtifact })
    dispose = mountDesktopArtifactPreview(document)
    await act(async () => { await settle() })
    const row = document.createElement('div')
    row.setAttribute('data-produced-files-row', '')
    const button = document.createElement('button')
    button.type = 'button'
    button.title = 'report.md'
    row.append(button)
    document.body.append(row)

    let response: Response | undefined
    await act(async () => {
      button.click()
      const body = new TextEncoder().encode(JSON.stringify({
        type: 'client-request', rpcId: 'preview-1', method: 'host.openPath', payload: { path },
      }))
      response = interceptArtifactPreviewRequest(
        new Request('http://dsh.internal/api/host.openPath', { method: 'POST', body }),
        body,
      )
      await settle()
    })

    expect(response?.status).toBe(200)
    expect(await response?.json()).toMatchObject({
      rpcId: 'preview-1', result: { ok: true, value: { opened: true } },
    })
    expect(previewArtifact).toHaveBeenCalledWith(path)
    const drawer = document.querySelector('[data-dsh-artifact-drawer]')
    expect(drawer?.textContent).toContain('report.md')
    expect(drawer?.textContent).toContain('Report')
    expect(drawer?.textContent).toContain('渲染')
    expect(drawer?.textContent).toContain('源码')

    await act(async () => {
      drawer?.querySelector<HTMLButtonElement>('[aria-label="关闭产物预览"]')?.click()
      await settle()
    })
    expect(document.querySelector('[data-dsh-artifact-drawer]')).toBeNull()
  })

  it('leaves ordinary Host path opens on the normal transport', () => {
    installBridge({ previewArtifact: vi.fn(async () => artifact) })
    dispose = mountDesktopArtifactPreview(document)
    const body = new TextEncoder().encode(JSON.stringify({
      type: 'client-request', rpcId: 'ordinary-1', method: 'host.openPath', payload: { path },
    }))
    expect(interceptArtifactPreviewRequest(
      new Request('http://dsh.internal/api/host.openPath', { method: 'POST', body }),
      body,
    )).toBeUndefined()
  })
})

function installBridge(overrides: Pick<DesktopBridge, 'previewArtifact'>): void {
  const bridge = {
    ...overrides,
    openArtifact: vi.fn(async () => {}),
    revealArtifact: vi.fn(async () => {}),
  } as unknown as DesktopBridge
  Object.defineProperty(window, 'dshDesktop', { configurable: true, value: bridge })
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}
