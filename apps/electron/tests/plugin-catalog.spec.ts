import { describe, expect, it } from 'vitest'
import { explainPlugin, PLUGIN_CATEGORY_LABELS } from '../src/plugin-catalog.ts'
import type { DesktopPluginPackage } from '../src/protocol.ts'

function plugin(packageName: string): DesktopPluginPackage {
  return {
    packageName,
    version: '1.0.0',
    description: undefined,
    repositoryUrl: undefined,
    source: 'harness',
    dependencySpec: undefined,
    updateKind: 'harness',
    latestVersion: undefined,
    dependencies: [],
    entries: [],
  }
}

describe('desktop plugin explanation catalog', () => {
  it('explains model tools in task language', () => {
    const explanation = explainPlugin(plugin('@deepseek-ai/dsh-tool-fs-search'))
    expect(explanation).toMatchObject({
      name: '文件搜索',
      category: 'feature',
      summary: '把“文件搜索”作为工具提供给智能体，让模型可以主动调用。',
      whenUsed: '当模型判断任务需要“文件搜索”时调用。',
      disableImpact: '智能体将不能再调用“文件搜索”工具。',
    })
    expect(explanation.capabilities).toContain('本地文件')
  })

  it('separates interface plugins from the host capability they visualize', () => {
    const explanation = explainPlugin(plugin('@deepseek-ai/dsh-client-ui-settings-plugin-inventory'))
    expect(explanation.name).toBe('插件清单')
    expect(explanation.category).toBe('interface')
    expect(explanation.summary).toContain('桌面界面')
    expect(explanation.disableImpact).toContain('界面中消失')
    expect(explanation.capabilities).toEqual(['界面显示', '本地持久数据'])
  })

  it('uses curated summaries for core services', () => {
    expect(explainPlugin(plugin('@deepseek-ai/dsh-agent-loop'))).toMatchObject({
      name: '智能体循环',
      category: 'system',
      summary: '驱动模型请求、工具调用和下一步执行，组成一次完整的智能体回合。',
    })
  })

  it('labels concrete providers as adapters and describes their replacement behavior', () => {
    const explanation = explainPlugin(plugin('@deepseek-ai/dsh-sandbox-local'))
    expect(explanation.category).toBe('adapter')
    expect(explanation.name).toBe('执行沙箱')
    expect(explanation.disableImpact).toContain('除非另一个适配器接管')
    expect(explanation.capabilities).toContain('命令执行')
  })

  it('gives future unknown packages a readable fallback instead of an empty card', () => {
    const explanation = explainPlugin(plugin('@example/dsh-tool-vector-memory'))
    expect(explanation).toMatchObject({
      name: 'vector · memory',
      category: 'feature',
      summary: '把“vector · memory”作为工具提供给智能体，让模型可以主动调用。',
    })
  })

  it('keeps all filter categories labeled in Chinese', () => {
    expect(PLUGIN_CATEGORY_LABELS).toEqual({
      feature: '功能插件',
      system: '系统插件',
      interface: '界面插件',
      adapter: '适配器',
      developer: '开发 / 内部',
    })
  })
})
