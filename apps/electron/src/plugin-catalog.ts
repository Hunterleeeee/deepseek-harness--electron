/** Chinese explanation layer for runtime-discovered desktop plugins. */

import type { DesktopPluginPackage } from './protocol.ts'

/** User-facing plugin layers used by filters and explanation cards. */
export type DesktopPluginCategory = 'feature' | 'system' | 'interface' | 'adapter' | 'developer'

/** Plain-language explanation derived from package facts with safe fallbacks for new plugins. */
export interface DesktopPluginExplanation {
  name: string
  category: DesktopPluginCategory
  summary: string
  whenUsed: string
  disableImpact: string
  capabilities: string[]
}

/** Chinese labels for the five plugin-center layers. */
export const PLUGIN_CATEGORY_LABELS = {
  feature: '功能插件',
  system: '系统插件',
  interface: '界面插件',
  adapter: '适配器',
  developer: '开发 / 内部',
} satisfies Record<DesktopPluginCategory, string>

const FEATURE_LABELS: Record<string, string> = {
  agent: '智能体运行时',
  'agent-loop': '智能体循环',
  'agent-default-model': '默认模型',
  'agent-instructions': '项目指令',
  'agent-presets': '智能体预设',
  approval: '操作审批',
  attachment: '附件',
  'attachment-local': '本地附件',
  bash: 'Bash 命令',
  compact: '上下文压缩',
  compaction: '上下文压缩',
  commands: '斜杠命令',
  connection: '桌面连接',
  credentials: '凭据',
  'credentials-local': '本地凭据',
  deliverables: '交付文件',
  'directory-picker': '目录选择',
  feedback: '反馈',
  fs: '文件操作',
  'fs-search': '文件搜索',
  goal: '目标管理',
  hmr: '热更新',
  jobs: '后台任务',
  layout: '应用布局',
  llm: '大模型服务',
  'message-feedback': '消息反馈',
  models: '模型设置',
  'model-selection': '模型选择',
  modules: '客户端模块加载',
  permission: '权限',
  'permission-presets': '权限预设',
  plan: '计划模式',
  'plan-mode': '计划模式',
  'plugin-inventory': '插件清单',
  plugins: '插件设置',
  pwsh: 'PowerShell 命令',
  ralph: '持续任务循环',
  runtime: '客户端运行时',
  sandbox: '执行沙箱',
  session: '会话',
  settings: '设置',
  sidebar: '会话侧边栏',
  skill: '技能',
  storage: '数据存储',
  'str-replace-editor': '文本编辑',
  subagent: '子智能体',
  'subagent-control': '子智能体控制',
  subprocess: '子进程',
  'system-prompt': '系统提示词',
  telemetry: '匿名遥测',
  theme: '主题',
  timer: '定时器',
  todo: '待办事项',
  tools: '工具注册表',
  trajectory: '运行轨迹',
  'user-questions': '向用户提问',
  web: '联网搜索与抓取',
  workflow: '工作流',
  workspace: '工作区',
}

const EXACT_SUMMARIES: Record<string, string> = {
  agent: '定义并管理可运行的智能体，是会话执行能力的核心服务。',
  'agent-loop': '驱动模型请求、工具调用和下一步执行，组成一次完整的智能体回合。',
  'agent-default-model': '决定新会话默认使用哪个模型提供方和模型。',
  'agent-presets': '按会话组合模型、工具和策略，让不同会话使用不同能力集合。',
  'api-gateway': '把 Host 服务发布成类型化 RPC，供桌面界面调用。',
  'api-remotes': '在客户端组装 Host 暴露的远程服务。',
  'client-modules': '读取 Host 给出的客户端插件图，并按需加载各个界面插件。',
  'client-runtime': '维护客户端会话、插件槽位和界面共享状态。',
  'credentials-local': '从本地环境和配置中解析凭据引用，不把密钥直接写进插件配置。',
  'fs-sandbox': '让文件写入遵守当前沙箱和权限策略。',
  'host-apiproxy': '承载桌面界面与 Harness Host 之间的请求和事件流。',
  'host-plugin-inventory': '读取当前 Cordis Loader 中的插件条目和运行状态。',
  llm: '定义统一的大模型调用接口，让不同模型提供方可以互换。',
  'llm-deepseek': '把 DeepSeek 官方接口接入统一的大模型服务。',
  'llm-pi-ai': '通过 pi-ai 适配层接入 DeepSeek，作为另一种模型实现。',
  'llm-retry': '在可重试的模型请求失败时按策略重试。',
  'sandbox-local': '在本机为命令和文件操作提供系统级隔离执行。',
  session: '记录会话事件，是恢复、回放、分叉和模型上下文的事实来源。',
  'session-persistence-jsonl': '把会话事件以 JSONL 文件持久保存到本机。',
  'session-query-sqlite': '用 SQLite 建立会话查询索引，支持列表和检索。',
  'settings-file': '把用户设置保存到本地 settings.yaml。',
  'system-prompt': '汇总各插件贡献的系统提示词和工具定义，再发送给模型。',
  tools: '注册、展示并安全执行模型可以调用的工具。',
  'typert-gateway': '生成并承载 Host 与客户端之间的类型化调用描述。',
  'typert-loader': '在插件加载时收集类型和校验信息。',
  'typert-registry': '保存运行时的类型图和输入校验器。',
}

/**
 * Explain one discovered package without requiring a hardcoded row for it.
 * @param plugin - factual package and Loader metadata from the main process.
 * @returns Chinese product copy, category, timing, disable impact, and capability hints.
 */
export function explainPlugin(plugin: DesktopPluginPackage): DesktopPluginExplanation {
  const shortName = packageShortName(plugin.packageName)
  const stem = pluginStem(shortName)
  const featureStem = roleFeatureStem(stem)
  const feature = FEATURE_LABELS[featureStem] ?? humanize(featureStem)
  const category = pluginCategory(shortName, stem)
  return {
    name: feature,
    category,
    summary: EXACT_SUMMARIES[stem] ?? summaryFor(category, stem, feature),
    whenUsed: whenUsedFor(category, stem, feature),
    disableImpact: disableImpactFor(category, stem, feature),
    capabilities: capabilitiesFor(shortName, stem, category),
  }
}

function packageShortName(packageName: string): string {
  return packageName.startsWith('@') ? packageName.slice(packageName.indexOf('/') + 1) : packageName
}

function pluginStem(shortName: string): string {
  return shortName
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-/, '')
}

function roleFeatureStem(stem: string): string {
  return stem
    .replace(/^client-ui-settings-/, '')
    .replace(/^client-ui-/, '')
    .replace(/^client-/, '')
    .replace(/^host-/, '')
    .replace(/^tool-/, '')
    .replace(/^command-/, '')
    .replace(/^skill-/, 'skill-')
    .replace(/-(?:local|sandbox|filesystem|deepseek|pi-ai|worker-thread|sqlite|jsonl|otel|auto)$/, '')
}

function pluginCategory(shortName: string, stem: string): DesktopPluginCategory {
  if (stem.startsWith('client-ui-') || stem === 'client-locale') return 'interface'
  if (/^(?:tool-|command-)/u.test(stem)
    || /^(?:goal|plan-mode|skill|skill-|workflow|jobs|message-feedback|user-questions)/u.test(stem)) return 'feature'
  if (shortName.startsWith('cordis-plugin-')
    || /^(?:typert-|api-|client-(?:modules|runtime|connection)|cordis-|host-webserver)/u.test(stem)) return 'developer'
  if (/(?:-local|-sandbox|-deepseek|-pi-ai|-sqlite|-jsonl|-otel|-worker-thread|-auto)$/u.test(stem)
    || /^(?:bash-|pwsh-|subprocess-|web-search-)/u.test(stem)) return 'adapter'
  return 'system'
}

function summaryFor(category: DesktopPluginCategory, stem: string, feature: string): string {
  if (stem.startsWith('tool-')) return `把“${feature}”作为工具提供给智能体，让模型可以主动调用。`
  if (stem.startsWith('command-')) return `提供与“${feature}”有关的人类命令，不需要模型先发起工具调用。`
  if (stem.startsWith('client-ui-')) return `在桌面界面中提供“${feature}”相关的显示和操作。`
  if (stem.startsWith('llm-')) return `把“${feature}”接入统一的大模型调用接口。`
  if (stem.startsWith('session-')) return `为会话提供“${feature}”相关的记录、投影或查询能力。`
  if (stem.startsWith('skill-')) return `为智能体技能系统提供“${feature}”能力。`
  if (category === 'adapter') return `把“${feature}”的具体实现接到 Harness 的可替换能力接口。`
  if (category === 'developer') return `为插件加载、类型化通信或运行诊断提供“${feature}”基础设施。`
  return `为 Harness 提供“${feature}”相关的系统能力。`
}

function whenUsedFor(category: DesktopPluginCategory, stem: string, feature: string): string {
  if (stem.startsWith('tool-')) return `当模型判断任务需要“${feature}”时调用。`
  if (stem.startsWith('command-')) return '当你主动使用对应命令时运行。'
  if (category === 'interface') return `打开或操作“${feature}”相关界面时使用。`
  if (category === 'adapter') return `有插件请求“${feature}”能力时在后台运行。`
  return '随 Harness 启动或在依赖它的插件工作时自动运行。'
}

function disableImpactFor(category: DesktopPluginCategory, stem: string, feature: string): string {
  if (stem.startsWith('tool-')) return `智能体将不能再调用“${feature}”工具。`
  if (stem.startsWith('command-')) return `对应的“${feature}”命令将不可用。`
  if (category === 'interface') return `“${feature}”相关入口或内容将从界面中消失，Host 数据通常仍保留。`
  if (category === 'adapter') return `依赖此适配器的“${feature}”能力将不可用，除非另一个适配器接管。`
  if (category === 'developer') return '可能导致依赖它的插件无法加载、连接或诊断；不建议单独停用。'
  return '可能让依赖它的功能插件等待依赖或加载失败；停用前应先查看依赖列表。'
}

function capabilitiesFor(
  shortName: string,
  stem: string,
  category: DesktopPluginCategory,
): string[] {
  const capabilities = new Set<string>()
  if (category === 'interface') capabilities.add('界面显示')
  if (/(?:fs|file|attachment|workspace|skill-filesystem|str-replace)/u.test(stem)) capabilities.add('本地文件')
  if (/(?:bash|pwsh|subprocess|sandbox|code-runtime|workflow-worker)/u.test(stem)) capabilities.add('命令执行')
  if (/(?:llm|web|telemetry|api-|connection|webserver)/u.test(stem)) capabilities.add('网络连接')
  if (/(?:credentials|llm-deepseek|pi-ai)/u.test(stem)) capabilities.add('凭据引用')
  if (/(?:session|storage|settings|feedback|goal|plan|todo|jobs)/u.test(stem)) capabilities.add('本地持久数据')
  if (shortName.startsWith('cordis-plugin-') || category === 'developer') capabilities.add('插件运行时')
  if (capabilities.size === 0) capabilities.add(category === 'feature' ? '智能体能力' : '内部服务')
  return [...capabilities]
}

function humanize(value: string): string {
  return value.split('-').filter(Boolean).map(word => FEATURE_LABELS[word] ?? word).join(' · ')
}
