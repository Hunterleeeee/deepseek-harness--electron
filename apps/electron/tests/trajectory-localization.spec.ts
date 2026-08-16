/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  explainTrajectorySelection,
  installTrajectoryPresentation,
  translateTrajectoryText,
  translateTrajectoryTextToEnglish,
} from '../src/trajectory-localization.ts'

beforeEach(() => {
  document.documentElement.lang = 'zh-CN'
  document.body.replaceChildren()
  localStorage.clear()
})

afterEach(() => {
  document.body.replaceChildren()
  localStorage.clear()
})

describe('desktop trajectory localization', () => {
  it('translates the upstream toolbar, ledger, and inspector vocabulary', () => {
    expect(translateTrajectoryText('Duration')).toBe('耗时')
    expect(translateTrajectoryText('SYSTEM')).toBe('系统')
    expect(translateTrajectoryText('Event details')).toBe('事件详情')
    expect(translateTrajectoryText('Loading earlier history…')).toBe('正在加载更早的记录…')
  })

  it('translates dynamic turn, request, and collapsed-summary labels', () => {
    expect(translateTrajectoryText('Turn 12')).toBe('第 12 回合')
    expect(translateTrajectoryText('Request #4 · Compaction')).toBe('请求 #4 · 上下文压缩')
    expect(translateTrajectoryText('3 steps · 2 tool calls')).toBe('3 步 · 2 次工具调用')
    expect(translateTrajectoryText('Collapsed assistant summary, 2 tool calls · bash, read')).toBe(
      '已折叠助手消息概览，2 次工具调用 · bash, read',
    )
  })

  it('preserves tool names, model names, and payload text', () => {
    expect(translateTrajectoryText('deepseek-reasoner')).toBe('deepseek-reasoner')
    expect(translateTrajectoryText('bash')).toBe('bash')
    expect(translateTrajectoryText('The tool returned No output for this request.')).toBe(
      'The tool returned No output for this request.',
    )
  })

  it('restores official Chinese toolbar copy for a Trajectory-only English view', () => {
    expect(translateTrajectoryTextToEnglish('轨迹工具栏')).toBe('Trajectory toolbar')
    expect(translateTrajectoryTextToEnglish('搜索轨迹')).toBe('Search trajectory')
    expect(translateTrajectoryTextToEnglish('用户输入')).toBe('用户输入')
  })

  it('explains observable tool facts without presenting hidden model reasoning', () => {
    const explanation = explainTrajectorySelection({
      kind: 'tool', index: '8', error: true, name: 'bash', label: 'TOOL, bash npm test',
    })
    expect(explanation.title).toBe('Tool：bash')
    expect(explanation.happened).toContain('轨迹记录 #8，名称为 bash，界面标记为失败')
    expect(explanation.knowledge).toContain('模型不会直接操作文件或终端')
    expect(explanation.evidence).toContain('轨迹记录 #8，界面标记为失败')
    expect(explanation.evidence).toContain('Parameters、Result 和 Status')
  })

  it('switches only Trajectory language and renders the selected record learning card', async () => {
    const root = document.createElement('div')
    root.setAttribute('data-conversation-composer-overlay', '')
    root.innerHTML = [
      '<div role="toolbar" aria-label="轨迹工具栏">Duration</div>',
      '<table><tbody><tr tabindex="0" data-kind="tool" data-record-index="7" data-error="true"',
      ' aria-label="TOOL, bash"><td>TOOL</td><td><code>Status</code></td></tr></tbody></table>',
    ].join('')
    document.body.append(root)
    const dispose = installTrajectoryPresentation(document)

    await settlePresentation()
    expect(root.textContent).toContain('耗时')
    expect(root.querySelector('[data-dsh-trajectory-experience]')).not.toBeNull()
    expect(root.querySelector('[data-dsh-trajectory-language="zh"]')?.getAttribute('aria-pressed')).toBe('true')

    root.querySelector<HTMLButtonElement>('[data-dsh-trajectory-language="en"]')?.click()
    await settlePresentation()
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(root.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toBe('Trajectory toolbar')
    expect(root.textContent).toContain('Duration')
    expect(root.textContent).toContain('TOOL')

    root.querySelector<HTMLButtonElement>('[data-dsh-trajectory-learning-toggle]')?.click()
    await settlePresentation()
    expect(root.querySelector('tr[data-kind="tool"]')?.hasAttribute('data-dsh-learning-selectable')).toBe(true)
    root.querySelector<HTMLTableRowElement>('tr[data-kind="tool"]')?.click()
    await settlePresentation()
    const panel = root.querySelector<HTMLElement>('[data-dsh-trajectory-learning]')
    expect(panel?.hidden).toBe(false)
    expect(panel?.textContent).toContain('Tool：bash')
    expect(panel?.textContent).toContain('讲解会跟随当前选择更新')
    expect(panel?.textContent).toContain('模型不会直接操作文件或终端')
    expect(panel?.textContent).toContain('轨迹记录 #7，界面标记为失败')
    expect(panel?.textContent).toContain('不展示或猜测模型隐藏思考')
    expect(root.querySelector('tr[data-kind="tool"]')?.getAttribute('data-dsh-learning-selected')).toBe('true')

    dispose()
    expect(root.querySelector('[data-dsh-trajectory-experience]')).toBeNull()
  })
})

async function settlePresentation(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
  await new Promise(resolve => setTimeout(resolve, 0))
}
