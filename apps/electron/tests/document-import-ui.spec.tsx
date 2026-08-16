/** @vitest-environment jsdom */

import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  mountDesktopDocumentImport,
  observeDocumentPromptResult,
  prepareDocumentPrompt,
} from '../src/document-import.tsx'
import type { DesktopBridge, DesktopImportedDocument } from '../src/protocol.ts'

let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
})

describe('desktop document import UI', () => {
  it('offers files and folders and records only references in session.prompt', async () => {
    const item: DesktopImportedDocument = {
      id: 'doc-1', name: 'brief.pdf', path: '/private/imports/brief.pdf', kind: 'pdf', size: 42,
    }
    installBridge({ importFiles: vi.fn(async () => [item]), importFolder: vi.fn(async () => []) })
    const tools = document.createElement('div')
    tools.className = 'tools'
    const card = document.createElement('div')
    card.setAttribute('data-composer-card', '')
    card.append(tools)
    document.body.append(card)
    dispose = mountDesktopDocumentImport(document)
    await settle()

    const trigger = document.querySelector<HTMLButtonElement>('[aria-label="导入资料"]')
    expect(trigger).not.toBeNull()
    await act(async () => {
      trigger?.click()
      await settle()
    })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[role="menuitem"]')?.click()
      await settle()
    })
    expect(document.querySelector('[data-dsh-document-import-control]')?.textContent).toContain('brief.pdf')

    const body = new TextEncoder().encode(JSON.stringify({
      type: 'client-request', rpcId: 'prompt-1', method: 'session.prompt',
      payload: { sessionId: 'session-1', mode: 'queue', content: [{ type: 'text', text: '总结一下' }] },
    }))
    const request = new Request('http://dsh.internal/api/session.prompt', { method: 'POST', body })
    const rewritten = prepareDocumentPrompt(request, body)
    expect(rewritten).not.toBeUndefined()
    expect(new TextDecoder().decode(rewritten)).toContain('/private/imports/brief.pdf')
    expect(new TextDecoder().decode(rewritten)).toContain('总结一下')

    observeDocumentPromptResult(request, new Response(JSON.stringify({
      type: 'server-response', rpcId: 'prompt-1', result: { ok: true, value: { accepted: true } },
    }), { status: 200 }))
    await settle()
    expect(document.querySelector('[data-dsh-document-import-control]')?.textContent).not.toContain('brief.pdf')
  })
})

function installBridge(overrides: Pick<DesktopBridge, 'importFiles' | 'importFolder'>): void {
  Object.defineProperty(window, 'dshDesktop', {
    configurable: true,
    value: { ...overrides },
  })
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}
