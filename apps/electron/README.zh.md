# Electron 桌面应用

[English](README.md) | 中文

此 workspace 应用将 DeepSeek Harness 打包为本地 macOS 桌面应用。它复用官方 Web profile、React 壳和 client 插件图，但通过 Electron IPC 承载 API 调用、插件 bundle 与事件流，不监听本地 HTTP 端口。[GUI 分层决策](../../.agents/notes/implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)说明了它所复用的 Host/Client 架构。

## 架构

| 进程 | 职责 | 安全属性 |
|---|---|---|
| Main | 启动 `dsh-base` + `dsh-web-app`，用内存注册服务替代监听端口的 Web server，分发官方 API Proxy，读取插件包元数据，并管理更新子进程 | 管理 Node.js、文件系统、凭据、会话、profile 依赖和 Cordis 生命周期 |
| Preload | 暴露精简的 `window.dshDesktop` API，用于初始化、读取 bundle、unary fetch、取消、Host/Mux 流、桌面／插件更新和有大小限制的产物读取 | 启用沙箱与上下文隔离；校验 Main 进程快照，不暴露 `ipcRenderer` 或 Node.js |
| Renderer | 运行官方 `AppWebEntry`，安装 `fetch` 与只接收消息的 `WebSocket` 兼容适配器，从 Host 生成的插件图加载全部 client 插件，并增加 Electron 设置项、轨迹学习和产物预览呈现 | `nodeIntegration: false`；CSP 禁止网络连接，页面导航限制在打包页面内 |

CSP 保留 `unsafe-eval`，因为 vendored Cordis Loader 需要求值 Harness 配置使用的动态表达式。`connect-src 'none'` 仍阻止 renderer 建立网络连接；全部 Harness 流量都经过明确的 preload API。

## 本地使用

打包后的应用可以运行在 macOS 12 或更高版本的 Apple 芯片 Mac 上。日常使用不需要源码仓库、Node.js 或 pnpm；只有从源码构建或使用源码更新器时才需要这些工具。

DMG 可以复制给其他使用 Apple 芯片 Mac 的人。安装包只包含应用代码、依赖和上游 MIT 许可声明，不包含构建机器上的会话、设置、工作区数据或凭据；每位使用者都会获得独立的 Harness home，并且必须配置自己的 `DEEPSEEK_API_KEY`。这个本地构建没有 Developer ID 签名或公证，macOS 可能要求按住 Control 键点按应用并选择「打开」，或在「系统设置 → 隐私与安全性」中允许打开。Intel Mac、Windows 和 Linux 不能运行这个安装包。

从源码构建需要仓库支持的 Node.js 版本、pnpm，以及在仓库根目录完成一次 `pnpm install`。

从源码运行：

```sh
pnpm electron:dev
```

构建本地 `.app` 或磁盘映像：

```sh
pnpm electron:pack
pnpm electron:dist
```

产物分别位于 `apps/electron/release/mac-arm64/DeepSeek Harness.app` 和 `apps/electron/release/DeepSeek Harness-0.1.0-local.1-arm64.dmg`。它们是未签名的本地构建。首次启动时，macOS 可能要求按住 Control 键点按应用并选择「打开」，或在「系统设置 → 隐私与安全性」中允许打开。

每次桌面构建都会基于 `apps/web/public/favicon.svg` 中的官方黑鲸生成应用图标，因此上游更新 Logo 后，无需维护第二份素材即可进入下一个安装包。

发起模型轮次前，请在应用的模型设置中保存 `DEEPSEEK_API_KEY`。可写凭据提供方会将其保存在应用的 Harness home 中；不要把密钥写入仓库。

应用的 Harness home 是 `~/Library/Application Support/DeepSeek Harness/harness`。重新构建应用后，会话、workspace、设置、凭据和生成的 `electron` profile 都保留在这里。只有在确实需要全新的桌面状态时，才应删除或备份该目录。

## 轨迹语言与学习

Trajectory 视图拥有独立的 **中文 / English** 选择器。首次选择跟随应用当前语言，之后会独立保存；切换轨迹语言不会改变应用其他部分。中文模式会翻译明确的 Trajectory 根节点内可见的工具栏、记录表、时间线、状态、概览、详情检查器和无障碍文案。原始 JSON、代码、工具输出、模型名称和诊断正文保持不变。[轨迹语言决策](../../.agents/notes/implemented/feature/2026-08-14-electron-trajectory-localization.md)说明了这项能力为何保留为 Electron 呈现层，而不分叉上游包。

「逐步学习」会标记每个可选择的记录表条目、Request 边界和时间线步骤。点击或聚焦其中一项后，面板会按照该条记录可见的序号、状态、标签和工具名更新，再分别说明发生了什么、相关 Agent 知识，以及到原始详情中的核对位置。它不是固定教材：选择 `Tool：bash` 和一次模型 Request 会得到不同讲解。解释目录不会展示或猜测模型隐藏思考。[轨迹学习决策](../../.agents/notes/implemented/feature/2026-08-14-electron-trajectory-learning.md)记录了这项证据限制和确定性教学目录。

## 产物预览

点击官方产出文件行中的文件，或通过同一打开路径流程生成的行内文件引用，会在应用右侧打开预览。Markdown 支持「渲染／源码」切换；常见文本以及 PNG、JPEG、GIF 和 WebP 图片可以直接查看。抽屉还可以复制解析后的路径、在 Finder 中显示文件，或交给系统应用打开。

Main 进程会解析真实文件路径并读取内容，但不会执行文件。文本与 Markdown 预览上限为 2 MiB，图片上限为 12 MiB；更大或不支持的文件只显示元数据，并保留 Finder 与系统打开操作。没有紧跟产出文件点击的普通 `host.openPath` 请求仍使用官方系统打开行为。[产物预览决策](../../.agents/notes/implemented/feature/2026-08-14-electron-artifact-preview.md)记录了拦截范围与大小限制。

## 资料导入

官方命令按钮旁的回形针按钮提供「添加文件」和「添加文件夹」。它接受 PDF、Word、Excel、PowerPoint、图片、Markdown、代码、文本和其他文件；文件夹会作为一个目录复制，并保留相对目录结构。Main 进程会把选择复制到 Harness home 下随机生成的应用专属目录，拒绝符号链接，并限制每次最多 200 个文件、单文件 100 MiB、单次导入 500 MiB。

导入资料是本地引用，不是第二套浏览器附件协议。下一次发送 `session.prompt` 时，Electron carrier 会把导入资料的名称、类型、大小和绝对路径加入已记录的用户文本。模型随后可以使用现有文件或目录工具按需读取；完整文件字节不会自动放进提示。移除卡片会使它不再出现在后续提示中，提示被接受后卡片会清空。模型提供方仍会收到提示中包含的名称和路径，工具输出也遵循正常的模型提供方策略。

第一版不承诺原生 Office/PDF 渲染或 OCR。导入副本会继续提供给现有工具和系统应用；不支持的解析会明确显示错误，不会静默当作纯文本处理。[资料导入决策](../../.agents/notes/implemented/feature/2026-08-15-electron-document-import.md)记录了这项职责边界和安全限制。

## 插件中心

从「设置 → 通用设置 → 桌面版 → 插件中心」进入。官方「插件列表」会分别统计每个非 group Loader 配置项，插件中心则把同一 npm 包贡献的配置项合并为一张说明与更新卡片。插件中心会分别显示 Loader 配置项总数和合并后的包总数，因此即使一个包贡献多个配置项，第一项数量也会与官方列表一致。界面会区分功能、系统、界面、适配器和开发／内部包。每张卡片都会说明包的用途、使用时机、停用影响、涉及的主要能力、配置项运行状态、代码来源、更新方式和 Harness 包依赖。包名、版本、源码地址、依赖、配置项、启用状态和 Fiber 阶段来自正在运行的 Loader 与已安装的 `package.json`；中文说明使用按插件家族维护的目录，并为新包名提供可读兜底，因此上游新增包即使还没有专门说明也会正常出现。

内置包显示「随 Harness 更新」，并使用下文的桌面源码更新器。插件中心不会比较它们的 npm 版本，因为运行中的源码 commit 才定义彼此兼容的整套内置插件。

安装到 `electron` profile 的依赖显示「外部」。打开插件中心时会通过 pnpm 检查 registry 管理的依赖；本地、link、URL 和 Git 规格没有可代表其来源的 registry 版本，因此保留手动更新。外部更新只会处理用户明确选择的依赖，以清除凭据变量的环境运行子进程，把更新前的 profile manifest 和 lockfile 保留到 `~/Library/Application Support/DeepSeek Harness/plugin-backups`，同步其组合包层成员关系，并要求重启应用后生效。更新失败时会恢复保留的文件并执行离线 frozen install；如果回滚也失败，界面会明确显示失败，不会把它当作成功。

插件中心刻意不提供启用、停用、安装或移除。那些操作会改变 profile 组合，需要独立设计配置与权限；现有的 `dsh plugin --profile electron ...` 仍可用于手动管理 profile。[桌面插件中心决策](../../.agents/notes/implemented/feature/2026-08-14-electron-plugin-center.md)记录了这组职责划分。

## MCP 配置

从「设置 → 通用设置 → 桌面版 → MCP 配置」进入。配置支持 `stdio` 本机命令和 Streamable HTTP 两种 MCP 传输；stdio 可填写命令、参数、环境变量和工作目录，HTTP 可填写 URL 与请求头。每个服务器都有独立的 `serverName`，其工具会以 `mcp__<serverName>__<tool>` 的名称进入 Agent 工具列表。

配置保存在应用 Harness home 的 `mcp-servers.json`，文件权限为当前用户可读写；环境变量和请求头会按明文配置保存，因此不要在共享账户或不信任的机器上填写长期密钥。启用 stdio 会在 Harness 进程外启动你填写的可执行文件，启用 HTTP 会向你填写的地址发送 MCP 请求；应用不会替你下载、审核或隔离服务器。

保存后需要重启应用。启动时 Electron 会把这份配置转换为官方 `@deepseek-ai/dsh-mcp-client` Loader 条目，连接成功后工具即可被 Agent 使用；关闭某项只会在下一次启动时跳过该服务器。连接失败会保留在 Harness 诊断中。[MCP 配置决策](../../.agents/notes/implemented/feature/2026-08-15-electron-mcp-config.md)记录了配置文件与运行时组合的职责边界。

## 跟随上游

将桌面改动保留在本地分支即可，无需推送到远端。应用直接导入 Harness workspace 并启动随仓库提供的 `dsh-base` 和 `dsh-web-app` 组合包，不复制 Web UI，也不维护第二份插件清单。因此，大部分上游功能更改会直接进入下一次桌面构建，无需修改 Electron 代码。

从「设置 → 通用设置 → 桌面版 → 桌面更新」进入。「检查更新」会读取官方 `master` commit，不会修改生成当前应用的仓库。发现新 commit 后，「下载并构建」会在应用专属的托管 checkout `~/Library/Application Support/DeepSeek Harness/updates/source` 中执行以下操作：

1. 同步官方源码，并覆盖当前安装包携带的 Electron 应用。
2. 安装依赖、编译 Harness，再生成新的 `.app` 与磁盘映像。
3. 启动待安装应用并运行打包兼容性检查。

更新器需要网络、`/usr/bin/git`、仓库支持的 Node.js 版本，以及可从用户 Bash 或 Zsh 登录 shell 访问的 pnpm。首次更新会下载完整的依赖与构建树，可能耗时数分钟并占用数 GB 磁盘空间。面板会显示构建输出和最近 300 行日志；构建失败不会改动当前运行的应用，并且可以重试。

验证通过后，从可写位置运行的应用会提供「安装并重启」。独立 helper 会等待当前进程退出，将已安装应用移到 `~/Library/Application Support/DeepSeek Harness/updates/backup/DeepSeek Harness.app`，再换入待安装构建；替换失败时会回滚，成功后会启动新版本。每次成功安装都会替换上一次备份。从 `/Volumes` 下的磁盘映像或其他不可写位置运行时，面板只提供「在访达中查看」；此时需要手动把新应用复制到「应用程序」。

[桌面托管更新决策](../../.agents/notes/implemented/feature/2026-08-14-electron-managed-source-updates.md)记录了这套源码更新机制及其取舍。本地工作 checkout 永远不会被 fetch、rebase、stash 或 clean，也不会作为托管构建目录使用。

当上游变更破坏兼容性、需要调整覆盖层时，仍可使用手动维护流程：

```sh
git fetch origin
git rebase origin/master
pnpm install
pnpm electron:verify
pnpm electron:dist
```

`electron:verify` 会重新构建仓库和 `.app`，检查打包后的对等依赖（peer dependency）闭包、原生 `node-pty` 二进制文件与更新覆盖层，使用临时用户数据目录启动真实打包可执行文件，并验证 client 插件图、`host.describe`、`session.list`、Host 事件流、设置页中的三个 Electron 面板、非空的包／Loader 清单、中文说明层、产出文件预览、所选记录的轨迹学习、内嵌 Harness 与上游 commit，以及应用完全退出。检查失败时会指出上游更新后需要适配的层。每次构建的 `dist/build-info.json` 都记录桌面版本、Harness 版本、源码 commit、上游 commit 与构建时间。

## 当前限制

- 仅打包 macOS arm64。
- 构建与源码更新都是未签名的本地产物；更新器不提供代码签名或公证信任。
- 官方项目不发布这个本地 Electron 壳，因此更新需要从源码构建。首次构建耗时较长；上游出现不兼容变更时，需要先手动更新覆盖层才能安装。
- `asar` 处于关闭状态，因此应用比优化后的发行包更大，插件与 profile 文件也会直接保留为可检查文件。
- 插件中心只更新已有且由 registry 管理的 profile 依赖；安装／移除以及本地／Git 来源更新仍是手动 profile 操作。
- 产物预览支持有大小限制的 Markdown、文本和常见位图；其他格式仍需使用系统应用。
- 资料导入会把文件保存在本机并把路径提供给模型；Electron 壳暂不提取 Office/PDF 文本，也不执行 OCR。
- MCP 配置只负责连接工具服务器；MCP 资源和提示词尚未接入，服务器本身的安装、升级、认证和隔离仍由用户负责。
- 导入文件会保留在应用 Harness home 中，直到用户移除它们或清理该目录；界面暂不提供导入历史管理器。
- 兼容性检查不需要密钥。它覆盖桌面启动、API 传输、插件加载、事件流和资源释放，但不覆盖真实模型轮次、审批或提问交互。
