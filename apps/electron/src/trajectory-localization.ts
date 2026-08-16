/** Electron-only language and learning presentation for upstream Trajectory. */

const TRAJECTORY_ROOT_SELECTOR = '[data-conversation-composer-overlay]'
const CHINESE_TOOLBAR_LABEL = '轨迹工具栏'
const LOCALIZED_ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'data-label'] as const
const EXPERIENCE_SELECTOR = '[data-dsh-trajectory-experience]'
const RAW_CONTENT_SELECTOR = `pre, code, textarea, [contenteditable="true"], [role="tree"], ${EXPERIENCE_SELECTOR}`
const PREFERENCE_KEY = 'dsh.desktop.trajectory-presentation.v1'

/** Language selected only for the Trajectory view. */
export type TrajectoryLanguage = 'zh' | 'en'

/** Record or grouping selected for an evidence-based Agent explanation. */
export type TrajectoryLearningKind =
  | 'overview'
  | 'turn'
  | 'request'
  | 'system'
  | 'user'
  | 'context'
  | 'compacted'
  | 'message'
  | 'tool'
  | 'subtool'

/** Input facts available from the rendered Trajectory record. */
export interface TrajectoryLearningSelection {
  kind: TrajectoryLearningKind
  index?: string
  error?: boolean
  running?: boolean
  name?: string
  label?: string
}

/** Plain-language explanation rendered by the Trajectory learning panel. */
export interface TrajectoryLearningExplanation {
  title: string
  happened: string
  knowledge: string
  evidence: string
}

const EXACT_TRANSLATIONS: Readonly<Record<string, string>> = {
  'ASSISTANT': '助手',
  'Assistant Message': '助手消息',
  'Between turns': '回合之间',
  'Cache created': '新建缓存',
  'Cached': '缓存命中',
  'Calls': '工具调用',
  'Click to load earlier history': '点击加载更早的记录',
  'Close details': '关闭详情',
  'Completed': '已完成',
  'Compacted': '已压缩',
  'Compaction': '上下文压缩',
  'Compaction failed': '上下文压缩失败',
  'CONTEXT': '上下文',
  'Context': '上下文',
  'Context compacted': '上下文已压缩',
  'Content': '正文',
  'Decoding': '解码',
  'Diff': '差异',
  'Drag to resize. Double-click to reset.': '拖动调整大小，双击恢复默认大小。',
  'Duration': '耗时',
  'Duration too short': '耗时过短',
  'Error': '错误',
  'Event details': '事件详情',
  'Expand calls': '展开全部工具调用',
  'Expand turns': '展开全部回合',
  'Failed': '失败',
  'First token unavailable': '未记录首个 Token 时间',
  'Generation': '生成耗时',
  'Goal': '目标',
  'Hierarchy': '层级关系',
  'Initial System Prompt': '初始系统提示词',
  'Input': '输入',
  'Load earlier history': '加载更早的记录',
  'Loading earlier history': '正在加载更早的记录',
  'Loading earlier history…': '正在加载更早的记录…',
  'Loading trajectory…': '正在加载运行轨迹…',
  'Message': '消息',
  'Message source JSON': '消息来源 JSON',
  'Model': '模型',
  'No content': '无内容',
  'No output': '无输出',
  'No payload captured': '未捕获入参',
  'No result captured': '未捕获结果',
  'No system prompt in this request': '本次请求没有系统提示词',
  'No timing data': '没有计时数据',
  'No tools in this request': '本次请求没有工具',
  'Not available': '未提供',
  'Not recorded': '未记录',
  'Options': '请求选项',
  'Options not recorded': '未记录请求选项',
  'Other': '其他',
  'Output': '输出',
  'Output tokens unavailable': '未记录输出 Token',
  'Parameters': '参数',
  'Payload': '入参',
  'Pending': '进行中',
  'Plugin': '插件',
  'Preview': '预览',
  'Provider': '提供方',
  'Purpose': '用途',
  'Raw Output': '原始输出',
  'Reasoning': '推理',
  'Request options JSON': '请求选项 JSON',
  'Request Timing': '请求计时',
  'Resize event details': '调整事件详情宽度',
  'Result': '结果',
  'Result JSON': '结果 JSON',
  'Retry': '重试',
  'Retry delay': '重试延迟',
  'Schema': '参数结构',
  'Schema unavailable': '没有参数结构',
  'Session cumulative': '会话累计',
  'Session timestamps': '会话时间戳',
  'Session timestamps (running)': '会话时间戳（仍在运行）',
  'Show local time': '显示本地时间',
  'Show Unix timestamp': '显示 Unix 时间戳',
  'Source': '来源',
  'Source not recorded': '未记录来源',
  'Started': '开始时间',
  'Status': '状态',
  'Step start unavailable': '未记录步骤开始时间',
  'Sub': '子工具',
  'SUBTOOL': '子工具',
  'Subtool calls': '子工具调用',
  'Summary': '概览',
  'SYSTEM': '系统',
  'System': '系统',
  'System Prompt': '系统提示词',
  'System Prompt and Tools Updated': '系统提示词和工具已更新',
  'System Prompt Updated': '系统提示词已更新',
  'Think': '思考',
  'This request': '本次请求',
  'Throughput': '生成速度',
  'Time': '耗时',
  'Timeline overview; drag horizontally to focus events': '时间线概览；横向拖动可聚焦事件',
  'Timing': '计时',
  'Timing source': '计时来源',
  'Tokens': 'Token 数',
  'TOOL': '工具',
  'Tool': '工具',
  'Tool Call': '工具调用',
  'Tool call only': '仅工具调用',
  '(tool call only)': '（仅工具调用）',
  'Tool calls': '工具调用',
  'Tools': '工具',
  'Tools Updated': '工具已更新',
  'Total duration': '总耗时',
  'Trajectory timeline': '轨迹时间线',
  'Turns': '回合',
  'Unknown': '未知',
  'Usage': 'Token 用量',
  'Usage not reported': '未报告 Token 用量',
  'Usage unavailable': 'Token 用量不可用',
  'Use actual duration': '按实际耗时显示',
  'Use equal-width operations': '按等宽操作显示',
  'USER': '用户',
  'User': '用户',
}

const KIND_TRANSLATIONS: Readonly<Record<string, string>> = {
  ASSISTANT: '助手',
  COMPACTED: '已压缩',
  CONTEXT: '上下文',
  SYSTEM: '系统',
  SUBTOOL: '子工具',
  TOOL: '工具',
  USER: '用户',
}

const OFFICIAL_CHINESE_TO_ENGLISH: Readonly<Record<string, string>> = {
  '实际时间': 'Actual time',
  '搜索': 'Search',
  '搜索轨迹': 'Search trajectory',
  '轨迹工具栏': 'Trajectory toolbar',
}

const LEARNING_EXPLANATIONS: Readonly<Record<TrajectoryLearningKind, Omit<TrajectoryLearningExplanation, 'evidence'>>> = {
  overview: {
    title: '怎样阅读 Agent 轨迹',
    happened: '轨迹按 Turn、Step 和模型 Request 组织系统输入、用户输入、上下文、模型消息与工具执行记录。',
    knowledge: 'Agent 不只是生成文本。agent loop 会组装上下文、请求模型、执行工具、把结果交回模型，再根据结果继续或结束。',
  },
  turn: {
    title: 'Turn：一次用户轮次',
    happened: '界面把同一次用户交互产生的模型请求、消息和工具记录组织在一个 Turn 下。',
    knowledge: '一个 Turn 可以包含多个 Step 和多次模型 Request；工具结果返回后，agent loop 往往会再次请求模型。',
  },
  request: {
    title: 'Request：一次模型请求',
    happened: 'Harness 组装当时的消息、系统提示词、工具定义和请求选项，并调用模型提供方。',
    knowledge: '模型请求是 Agent 与 LLM 的一次交互，不等于完整任务。一次任务通常由多次模型请求和工具执行共同完成。',
  },
  system: {
    title: 'System：规则和工具目录',
    happened: 'Harness 向模型提供本次请求使用的系统提示词，以及可调用工具的名称、用途和参数定义。',
    knowledge: '系统提示词约束 Agent 的角色和行为；工具 schema 决定模型能以什么结构发起工具调用。',
  },
  user: {
    title: 'User：用户输入',
    happened: '用户消息进入会话，成为模型理解目标和约束的主要输入。',
    knowledge: '清晰的目标、范围和验收标准会直接影响 Agent 如何拆解任务、选择工具和判断是否完成。',
  },
  context: {
    title: 'Context：插件补充的上下文',
    happened: 'Harness 插件在模型请求前补充了模型可见信息，例如时间、工作区状态、说明或会话引用。',
    knowledge: '上下文不是模型凭空知道的内容。只要信息会进入模型请求，就需要由运行时提供，并能从会话记录重建。',
  },
  compacted: {
    title: 'Compacted：上下文压缩',
    happened: '较早的会话内容被压缩结果替代，以减少后续模型请求占用的上下文长度。',
    knowledge: '上下文窗口有限。压缩可以继续长任务，但摘要可能丢失细节，因此重要约束需要保留并可追溯。',
  },
  message: {
    title: 'Assistant：模型返回消息',
    happened: '模型返回了助手内容；其中可能包含回答、推理内容或下一步工具调用。',
    knowledge: 'agent loop 会读取模型的结束原因和工具调用。需要执行工具时，任务不会在这条模型消息处结束。',
  },
  tool: {
    title: 'Tool：顶层工具调用',
    happened: 'Agent 运行时执行了一次结构化工具调用，并把工具结果记录下来供后续模型请求使用。',
    knowledge: '模型不会直接操作文件或终端。模型产生工具名称和参数，Harness 校验权限并执行工具，再把结果交回模型。',
  },
  subtool: {
    title: 'Subtool：工具内部操作',
    happened: '一个顶层工具在执行过程中产生了更细的内部操作，轨迹把它记录为 Subtool。',
    knowledge: 'Subtool 用于解释工具怎样完成工作，不一定代表模型又做了一次独立决策；判断 Agent 决策时应先看顶层 Tool。',
  },
}

/**
 * Translate one Trajectory-owned label without changing model or tool payload text.
 * @param value - rendered text or an interface attribute value.
 * @returns the Chinese label, or the original value when it is not presentation copy.
 */
export function translateTrajectoryText(value: string): string {
  const whitespace = /^(\s*)([\s\S]*?)(\s*)$/u.exec(value)
  if (whitespace === null) return value
  const [, leading = '', body = '', trailing = ''] = whitespace
  const translated = EXACT_TRANSLATIONS[body] ?? translateDynamicLabel(body)
  return translated === body ? value : `${leading}${translated}${trailing}`
}

/**
 * Restore the few labels that the official Trajectory dictionary already renders in Chinese.
 * @param value - rendered text or an interface attribute value.
 * @returns the official English label, or the original value when it is not dictionary copy.
 */
export function translateTrajectoryTextToEnglish(value: string): string {
  const whitespace = /^(\s*)([\s\S]*?)(\s*)$/u.exec(value)
  if (whitespace === null) return value
  const [, leading = '', body = '', trailing = ''] = whitespace
  const translated = OFFICIAL_CHINESE_TO_ENGLISH[body] ?? body
  return translated === body ? value : `${leading}${translated}${trailing}`
}

function translateDynamicLabel(value: string): string {
  let match = /^Turn (\d+)$/u.exec(value)
  if (match !== null) return `第 ${match[1]} 回合`

  match = /^Step (\d+)$/u.exec(value)
  if (match !== null) return `第 ${match[1]} 步`

  match = /^Compaction (\d+)$/u.exec(value)
  if (match !== null) return `上下文压缩 ${match[1]}`

  match = /^Request #(\d+) · Compaction$/u.exec(value)
  if (match !== null) return `请求 #${match[1]} · 上下文压缩`

  match = /^Request #(\d+)$/u.exec(value)
  if (match !== null) return `请求 #${match[1]}`

  match = /^Compaction · (.+)$/u.exec(value)
  if (match !== null) return `上下文压缩 · ${translateTrajectoryText(requiredGroup(match, 1))}`

  match = /^(\d+) steps? · (\d+) tool calls?$/u.exec(value)
  if (match !== null) return `${match[1]} 步 · ${match[2]} 次工具调用`

  match = /^(\d+) tool calls?( · .+)$/u.exec(value)
  if (match !== null) return `${match[1]} 次工具调用${match[2]}`

  match = /^(\d+) tool calls?$/u.exec(value)
  if (match !== null) return `${match[1]} 次工具调用`

  match = /^Plugin · (.+)$/u.exec(value)
  if (match !== null) return `插件 · ${match[1]}`

  match = /^Goal · Round (\d+)$/u.exec(value)
  if (match !== null) return `目标 · 第 ${match[1]} 轮`

  match = /^Open Block #(\d+) tool call summary$/u.exec(value)
  if (match !== null) return `打开内容块 #${match[1]} 的工具调用概览`

  match = /^Block #(\d+) (.+)$/u.exec(value)
  if (match !== null) return `内容块 #${match[1]} ${blockTypeLabel(requiredGroup(match, 2))}`

  match = /^(.+) parameters JSON$/u.exec(value)
  if (match !== null) return `${match[1]} 参数 JSON`

  match = /^(Payload|Result) JSON$/u.exec(value)
  if (match !== null) return `${match[1] === 'Payload' ? '入参' : '结果'} JSON`

  match = /^Total (.+)$/u.exec(value)
  if (match !== null) return `总耗时 ${match[1]}`

  match = /^Started (.+)$/u.exec(value)
  if (match !== null) return `开始于 ${match[1]}`

  match = /^TTFT (.+) · Decoding (.+)$/u.exec(value)
  if (match !== null) return `首 Token 延迟 ${match[1]} · 解码 ${match[2]}`

  match = /^Scheduled (\d+) of (\d+)$/u.exec(value)
  if (match !== null) return `计划第 ${match[1]} 次，最多 ${match[2]} 次`

  match = /^Scheduled (\d+)$/u.exec(value)
  if (match !== null) return `计划第 ${match[1]} 次`

  match = /^Collapsed (turn|assistant) summary, (.+)$/u.exec(value)
  if (match !== null) {
    const owner = match[1] === 'turn' ? '回合' : '助手消息'
    return `已折叠${owner}概览，${translateTrajectoryText(requiredGroup(match, 2))}`
  }

  match = /^Request (\d*), compaction$/u.exec(value)
  if (match !== null) return `请求${match[1] === '' ? '' : ` ${match[1]}`}，上下文压缩`

  match = /^Request (\d+), (SYSTEM|USER|CONTEXT|COMPACTED|ASSISTANT|TOOL|SUBTOOL), (.+)$/u.exec(value)
  if (match !== null) {
    const content = match[3] === 'no content' ? '无内容' : match[3]
    const kind = requiredGroup(match, 2)
    return `请求 ${match[1]}，${KIND_TRANSLATIONS[kind]}，${content}`
  }

  match = /^(SYSTEM|USER|CONTEXT|COMPACTED|ASSISTANT|TOOL|SUBTOOL), (.+)$/u.exec(value)
  if (match !== null) {
    const content = match[2] === 'no content' ? '无内容' : match[2]
    const kind = requiredGroup(match, 1)
    return `${KIND_TRANSLATIONS[kind]}，${content}`
  }

  return value
}

function requiredGroup(match: RegExpExecArray, index: number): string {
  const value: unknown = Reflect.get(match, index)
  if (typeof value !== 'string') {
    throw new Error('trajectory localization pattern omitted a required group')
  }
  return value
}

function blockTypeLabel(value: string): string {
  if (value === 'text') return '文本'
  if (value === 'reasoning') return '推理'
  if (value === 'tool-call') return '工具调用'
  if (value === 'image') return '图像'
  return value
}

/**
 * Explain one rendered Trajectory fact without claiming access to hidden model reasoning.
 * @param selection - record type, visible index, and rendered status.
 * @returns the stable learning copy plus evidence available in the Trajectory interface.
 */
export function explainTrajectorySelection(
  selection: TrajectoryLearningSelection,
): TrajectoryLearningExplanation {
  const explanation = LEARNING_EXPLANATIONS[selection.kind]
  if (selection.kind === 'overview') {
    return {
      ...explanation,
      evidence: '点击任意轨迹记录，再打开它的详情核对输入、输出、状态和时间；学习解释不会代替原始记录。',
    }
  }
  const position = selection.index === undefined
    ? '当前轨迹项'
    : selection.kind === 'turn'
      ? `Turn ${selection.index}`
      : selection.kind === 'request'
        ? `Request #${selection.index}`
        : `轨迹记录 #${selection.index}`
  const status = selection.error === true
    ? '，界面标记为失败'
    : selection.running === true
      ? '，界面标记为运行中'
      : ''
  const name = selection.name === undefined ? '' : `，名称为 ${selection.name}`
  const visible = visibleSelectionSummary(selection)
  return {
    title: selection.name === undefined ? explanation.title : `${kindHeading(selection.kind)}：${selection.name}`,
    happened: `${explanation.happened} 当前选择的是${position}${name}${status}${visible === '' ? '。' : `，界面摘要为“${visible}”。`}`,
    knowledge: explanation.knowledge,
    evidence: `${position}${status}。${learningEvidence(selection.kind)}`,
  }
}

function kindHeading(kind: TrajectoryLearningKind): string {
  if (kind === 'tool') return 'Tool'
  if (kind === 'subtool') return 'Subtool'
  if (kind === 'request') return 'Request'
  if (kind === 'message') return 'Assistant'
  return LEARNING_EXPLANATIONS[kind].title.split('：')[0] ?? kind
}

function visibleSelectionSummary(selection: TrajectoryLearningSelection): string {
  if (selection.label === undefined || selection.kind === 'tool' || selection.kind === 'subtool') return ''
  const compact = selection.label.replaceAll(/\s+/gu, ' ').trim()
  if (compact === '') return ''
  return compact.length <= 100 ? compact : `${compact.slice(0, 99)}…`
}

function learningEvidence(kind: Exclude<TrajectoryLearningKind, 'overview'>): string {
  if (kind === 'turn') return '查看该 Turn 下的 Step、Request 和记录顺序，确认这一轮经历了哪些阶段。'
  if (kind === 'request') return '点击 Request 边界，核对系统提示词、工具目录、请求选项和计时。'
  if (kind === 'system') return '打开详情中的 System Prompt 和 Tools，核对模型实际收到的规则与工具定义。'
  if (kind === 'user') return '打开输入详情，核对用户原话以及这条消息是否开启新的 Turn。'
  if (kind === 'context') return '打开输入和来源详情，核对哪个插件向模型补充了什么信息。'
  if (kind === 'compacted') return '比较压缩前后的上下文记录，检查重要目标和约束是否仍然存在。'
  if (kind === 'message') return '打开正文、推理和计时详情，确认模型返回内容以及是否继续调用工具。'
  if (kind === 'tool') return '打开 Parameters、Result 和 Status，核对工具收到了什么以及实际返回了什么。'
  return '先查看所属顶层 Tool，再检查这个 Subtool 的参数和结果，区分模型决策与工具内部执行。'
}

interface TrajectoryPreferences {
  language?: TrajectoryLanguage
  learning: boolean
}

interface RootListeners {
  select: EventListener
}

/**
 * Install the Trajectory-only language selector and evidence-based learning panel.
 * @param document - renderer document that owns the upstream Web application.
 * @returns a disposer that restores translated values and removes Electron controls.
 */
export function installTrajectoryPresentation(document: Document = globalThis.document): () => void {
  const textOriginals = new WeakMap<Text, string>()
  const attributeOriginals = new WeakMap<Element, Map<string, string>>()
  const renderedLanguages = new WeakMap<HTMLElement, TrajectoryLanguage>()
  const selections = new WeakMap<HTMLElement, TrajectoryLearningSelection>()
  const listeners = new Map<HTMLElement, RootListeners>()
  const stored = readPreferences(document)
  let language = stored.language
  let learning = stored.learning
  let scheduled = false
  let disposed = false

  const update = (): void => {
    scheduled = false
    if (disposed) return
    for (const [root, rootListeners] of listeners) {
      if (root.isConnected) continue
      root.removeEventListener('click', rootListeners.select)
      root.removeEventListener('focusin', rootListeners.select)
      listeners.delete(root)
    }
    for (const root of document.querySelectorAll<HTMLElement>(TRAJECTORY_ROOT_SELECTOR)) {
      language ??= detectTrajectoryLanguage(root)
      ensureExperience(root, {
        language,
        learning,
        selection: selections.get(root) ?? { kind: 'overview' },
        onLanguageChange: (nextLanguage) => {
          language = nextLanguage
          writePreferences(document, { language, learning })
          schedule()
        },
        onLearningChange: (nextLearning) => {
          learning = nextLearning
          writePreferences(document, { language: language ?? detectTrajectoryLanguage(root), learning })
          schedule()
        },
      })
      if (!listeners.has(root)) {
        const select: EventListener = (event) => {
          const selection = selectionFromEvent(root, event)
          if (selection === undefined) return
          selections.set(root, selection)
          if (learning) {
            renderLearning(root, selection)
            schedule()
          }
        }
        root.addEventListener('click', select)
        root.addEventListener('focusin', select)
        listeners.set(root, { select })
      }
      applyRootLanguage(root, language, renderedLanguages, textOriginals, attributeOriginals)
    }
  }
  const schedule = (): void => {
    if (scheduled || disposed) return
    scheduled = true
    queueMicrotask(update)
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [...LOCALIZED_ATTRIBUTES],
    characterData: true,
    childList: true,
    subtree: true,
  })
  schedule()
  return () => {
    disposed = true
    observer.disconnect()
    for (const root of document.querySelectorAll<HTMLElement>(TRAJECTORY_ROOT_SELECTOR)) {
      restoreRoot(root, textOriginals, attributeOriginals)
      root.querySelector(EXPERIENCE_SELECTOR)?.remove()
      clearLearningTargets(root)
    }
    for (const [root, rootListeners] of listeners) {
      root.removeEventListener('click', rootListeners.select)
      root.removeEventListener('focusin', rootListeners.select)
    }
    listeners.clear()
  }
}

function applyRootLanguage(
  root: HTMLElement,
  language: TrajectoryLanguage,
  renderedLanguages: WeakMap<HTMLElement, TrajectoryLanguage>,
  textOriginals: WeakMap<Text, string>,
  attributeOriginals: WeakMap<Element, Map<string, string>>,
): void {
  const previous = renderedLanguages.get(root)
  if (previous !== undefined && previous !== language) {
    restoreRoot(root, textOriginals, attributeOriginals)
  }
  translateRoot(
    root,
    language === 'zh' ? translateTrajectoryText : translateTrajectoryTextToEnglish,
    textOriginals,
    attributeOriginals,
  )
  root.dataset.dshTrajectoryLanguage = language
  renderedLanguages.set(root, language)
}

function translateRoot(
  root: HTMLElement,
  translate: (value: string) => string,
  textOriginals: WeakMap<Text, string>,
  attributeOriginals: WeakMap<Element, Map<string, string>>,
): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text
    if (text.parentElement?.closest(RAW_CONTENT_SELECTOR) !== null) continue
    const translated = translate(text.data)
    if (translated === text.data) continue
    textOriginals.set(text, text.data)
    text.data = translated
  }
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (element !== root && element.closest(EXPERIENCE_SELECTOR) !== null) continue
    for (const attribute of LOCALIZED_ATTRIBUTES) {
      const value = element.getAttribute(attribute)
      if (value === null) continue
      const translated = translate(value)
      if (translated === value) continue
      const originals = attributeOriginals.get(element) ?? new Map<string, string>()
      originals.set(attribute, value)
      attributeOriginals.set(element, originals)
      element.setAttribute(attribute, translated)
    }
  }
}

interface ExperienceState {
  language: TrajectoryLanguage
  learning: boolean
  selection: TrajectoryLearningSelection
  onLanguageChange: (language: TrajectoryLanguage) => void
  onLearningChange: (learning: boolean) => void
}

function ensureExperience(root: HTMLElement, state: ExperienceState): void {
  let experience = root.querySelector<HTMLElement>(EXPERIENCE_SELECTOR)
  if (experience === null) {
    experience = createExperience(root.ownerDocument, state)
    const toolbar = root.querySelector<HTMLElement>('[role="toolbar"]')
    if (toolbar === null) root.prepend(experience)
    else toolbar.insertAdjacentElement('afterend', experience)
  }
  for (const button of experience.querySelectorAll<HTMLButtonElement>('[data-dsh-trajectory-language]')) {
    button.setAttribute('aria-pressed', String(button.dataset.dshTrajectoryLanguage === state.language))
  }
  const learningButton = requiredElement(experience, '[data-dsh-trajectory-learning-toggle]')
  learningButton.setAttribute('aria-pressed', String(state.learning))
  const panel = requiredElement(experience, '[data-dsh-trajectory-learning]')
  panel.hidden = !state.learning
  if (state.learning) renderLearning(root, state.selection)
  syncLearningTargets(root, state.learning, state.selection)
}

function createExperience(document: Document, state: ExperienceState): HTMLElement {
  const experience = document.createElement('div')
  experience.setAttribute('data-dsh-trajectory-experience', '')
  const controls = document.createElement('div')
  controls.setAttribute('data-dsh-trajectory-controls', '')

  const label = document.createElement('span')
  label.className = 'dsh-trajectory-control-label'
  label.textContent = '轨迹语言'
  controls.append(label)

  const segments = document.createElement('div')
  segments.className = 'dsh-trajectory-segments'
  segments.setAttribute('role', 'group')
  segments.setAttribute('aria-label', '轨迹语言')
  for (const [id, text] of [['zh', '中文'], ['en', 'English']] as const) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = text
    button.dataset.dshTrajectoryLanguage = id
    button.addEventListener('click', () => { state.onLanguageChange(id) })
    segments.append(button)
  }
  controls.append(segments)

  const learningButton = document.createElement('button')
  learningButton.type = 'button'
  learningButton.className = 'dsh-trajectory-learning-toggle'
  learningButton.setAttribute('data-dsh-trajectory-learning-toggle', '')
  learningButton.textContent = '逐步学习'
  learningButton.title = '开启后点击轨迹中的任意一步，查看对应的 Agent 知识'
  learningButton.addEventListener('click', () => {
    state.onLearningChange(learningButton.getAttribute('aria-pressed') !== 'true')
  })
  controls.append(learningButton)
  experience.append(controls, createLearningPanel(document))
  return experience
}

function createLearningPanel(document: Document): HTMLElement {
  const panel = document.createElement('section')
  panel.setAttribute('data-dsh-trajectory-learning', '')
  panel.setAttribute('aria-label', 'Agent 学习解释')
  panel.setAttribute('aria-live', 'polite')

  const heading = document.createElement('div')
  heading.className = 'dsh-trajectory-learning-heading'
  const title = document.createElement('strong')
  title.setAttribute('data-dsh-learning-title', '')
  const badge = document.createElement('span')
  badge.className = 'dsh-trajectory-learning-evidence'
  badge.setAttribute('data-dsh-learning-badge', '')
  heading.append(title, badge)

  const grid = document.createElement('div')
  grid.className = 'dsh-trajectory-learning-grid'
  for (const [headingText, field] of [
    ['发生了什么', 'happened'],
    ['Agent 知识', 'knowledge'],
    ['怎么验证', 'evidence'],
  ] as const) {
    const card = document.createElement('article')
    const cardHeading = document.createElement('h3')
    cardHeading.textContent = headingText
    const copy = document.createElement('p')
    copy.setAttribute(`data-dsh-learning-${field}`, '')
    card.append(cardHeading, copy)
    grid.append(card)
  }

  const boundary = document.createElement('p')
  boundary.className = 'dsh-trajectory-learning-boundary'
  boundary.textContent = '解释只依据可见轨迹事件和界面状态，不展示或猜测模型隐藏思考。'
  const instruction = document.createElement('p')
  instruction.className = 'dsh-trajectory-learning-instruction'
  instruction.textContent = '点击下方任意记录、Request 边界或时间线步骤，讲解会跟随当前选择更新。'
  panel.append(heading, instruction, grid, boundary)
  return panel
}

function renderLearning(root: HTMLElement, selection: TrajectoryLearningSelection): void {
  const panel = root.querySelector<HTMLElement>('[data-dsh-trajectory-learning]')
  if (panel === null) return
  const explanation = explainTrajectorySelection(selection)
  setText(requiredElement(panel, '[data-dsh-learning-title]'), explanation.title)
  setText(requiredElement(panel, '[data-dsh-learning-happened]'), explanation.happened)
  setText(requiredElement(panel, '[data-dsh-learning-knowledge]'), explanation.knowledge)
  setText(requiredElement(panel, '[data-dsh-learning-evidence]'), explanation.evidence)
  const badge = selection.index === undefined
    ? selection.kind === 'overview' ? '阅读提示' : selection.kind.toUpperCase()
    : selection.kind === 'turn'
      ? `Turn ${selection.index}`
      : selection.kind === 'request'
        ? `Request #${selection.index}`
        : `#${selection.index} · ${selection.kind.toUpperCase()}`
  setText(requiredElement(panel, '[data-dsh-learning-badge]'), badge)
}

function setText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value
}

function selectionFromEvent(root: HTMLElement, event: Event): TrajectoryLearningSelection | undefined {
  if (!(event.target instanceof Element) || event.target.closest(EXPERIENCE_SELECTOR) !== null) return undefined
  return selectionFromElement(root, event.target)
}

function selectionFromElement(root: HTMLElement, element: Element): TrajectoryLearningSelection | undefined {
  const request = element.closest<HTMLElement>('[data-request-run-index]')
  if (request !== null && root.contains(request)) {
    return {
      kind: 'request',
      ...optionalIndex(request.getAttribute('data-label')),
      ...selectionMetadata(request, 'request'),
    }
  }
  const row = element.closest<HTMLElement>('tr[data-kind]')
  if (row !== null && root.contains(row)) {
    if (row.dataset.requestOnly === 'true') return { kind: 'request' }
    const kind = learningKind(row.dataset.kind)
    if (kind !== undefined) {
      return {
        kind,
        ...optionalIndex(row.dataset.recordIndex),
        ...(row.dataset.error === 'true' ? { error: true } : {}),
        ...(row.dataset.running === 'true' ? { running: true } : {}),
        ...selectionMetadata(row, kind),
      }
    }
  }
  const timeline = element.closest<HTMLElement>('[data-timeline-record-index][data-timeline-span]')
  if (timeline !== null && root.contains(timeline)) {
    const kind = learningKind(timeline.dataset.timelineSpan)
    if (kind !== undefined) {
      const index = timeline.dataset.timelineRecordIndex
      const rowForTimeline = index === undefined
        ? undefined
        : root.querySelector<HTMLElement>(`tr[data-record-index="${index}"]`) ?? undefined
      return {
        kind,
        ...optionalIndex(index),
        ...(timeline.dataset.error === 'true' ? { error: true } : {}),
        ...selectionMetadata(rowForTimeline ?? timeline, kind),
      }
    }
  }
  const turn = element.closest<HTMLElement>('section[data-turn]')
  if (turn !== null && root.contains(turn)) return { kind: 'turn', ...optionalIndex(turn.dataset.turn) }
  return undefined
}

function selectionMetadata(
  element: HTMLElement,
  kind: Exclude<TrajectoryLearningKind, 'overview'>,
): Pick<TrajectoryLearningSelection, 'label' | 'name'> {
  const label = element.getAttribute('aria-label') ?? element.getAttribute('data-label') ?? undefined
  const name = kind === 'tool' || kind === 'subtool'
    ? toolNameFromLabel(label)
    : undefined
  return {
    ...(label === undefined || label.trim() === '' ? {} : { label }),
    ...(name === undefined ? {} : { name }),
  }
}

function toolNameFromLabel(label: string | undefined): string | undefined {
  if (label === undefined) return undefined
  const match = /(?:^|[,，]\s*)(?:TOOL|SUBTOOL|工具|子工具)[,，]\s*([^\s·,，]+)/u.exec(label)
  return match?.[1]
}

function syncLearningTargets(
  root: HTMLElement,
  learning: boolean,
  selection: TrajectoryLearningSelection,
): void {
  if (learning) root.setAttribute('data-dsh-learning-mode', 'true')
  else root.removeAttribute('data-dsh-learning-mode')
  for (const target of root.querySelectorAll<HTMLElement>([
    'tr[data-kind]:not([data-request-only="true"])',
    '[data-request-run-index]',
    '[data-timeline-record-index][data-timeline-span]',
  ].join(', '))) {
    if (learning) target.setAttribute('data-dsh-learning-selectable', '')
    else target.removeAttribute('data-dsh-learning-selectable')
    const candidate = selectionFromElement(root, target)
    if (learning && candidate !== undefined && sameLearningSelection(candidate, selection)) {
      target.setAttribute('data-dsh-learning-selected', 'true')
    } else {
      target.removeAttribute('data-dsh-learning-selected')
    }
  }
}

function sameLearningSelection(
  left: TrajectoryLearningSelection,
  right: TrajectoryLearningSelection,
): boolean {
  return left.kind === right.kind && left.index === right.index
}

function clearLearningTargets(root: HTMLElement): void {
  root.removeAttribute('data-dsh-learning-mode')
  for (const target of root.querySelectorAll<HTMLElement>('[data-dsh-learning-selectable], [data-dsh-learning-selected]')) {
    target.removeAttribute('data-dsh-learning-selectable')
    target.removeAttribute('data-dsh-learning-selected')
  }
}

function optionalIndex(value: string | null | undefined): { index?: string } {
  if (value === null || value === undefined) return {}
  const match = /(?:#|＃)?(\d+)/u.exec(value)
  return match?.[1] === undefined ? {} : { index: match[1] }
}

function learningKind(value: string | undefined): Exclude<TrajectoryLearningKind, 'overview' | 'turn' | 'request'> | undefined {
  if (value === 'system' || value === 'user' || value === 'context' || value === 'compacted'
    || value === 'message' || value === 'tool' || value === 'subtool') return value
  return undefined
}

function requiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector)
  if (element === null) throw new Error(`trajectory presentation omitted required element ${selector}`)
  return element
}

function detectTrajectoryLanguage(root: HTMLElement): TrajectoryLanguage {
  return root.querySelector<HTMLElement>('[role="toolbar"]')?.getAttribute('aria-label') === CHINESE_TOOLBAR_LABEL
    ? 'zh'
    : 'en'
}

function readPreferences(document: Document): TrajectoryPreferences {
  try {
    const raw = document.defaultView?.localStorage.getItem(PREFERENCE_KEY)
    if (raw === null || raw === undefined) return { learning: false }
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return { learning: false }
    const candidate = value as Record<string, unknown>
    const language = candidate.language === 'zh' || candidate.language === 'en'
      ? candidate.language
      : undefined
    return {
      ...(language === undefined ? {} : { language }),
      learning: candidate.learning === true,
    }
  } catch {
    // File-origin storage may be disabled; the running renderer still keeps its in-memory preference.
    return { learning: false }
  }
}

function writePreferences(document: Document, preferences: Required<TrajectoryPreferences>): void {
  try {
    document.defaultView?.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences))
  } catch {
    // File-origin storage may be disabled; failure leaves the current in-memory selection active.
  }
}

function restoreRoot(
  root: HTMLElement,
  textOriginals: WeakMap<Text, string>,
  attributeOriginals: WeakMap<Element, Map<string, string>>,
): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text
    const original = textOriginals.get(text)
    if (original === undefined) continue
    textOriginals.delete(text)
    text.data = original
  }
  for (const element of [root, ...root.querySelectorAll('*')]) {
    const originals = attributeOriginals.get(element)
    if (originals === undefined) continue
    attributeOriginals.delete(element)
    for (const [attribute, value] of originals) element.setAttribute(attribute, value)
  }
}
