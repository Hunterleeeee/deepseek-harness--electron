# Agent Note: Electron 插件中心与拆分的更新职责

Status: implemented

[English](2026-08-14-electron-plugin-center.md) | 中文

## Problem

Electron 应用会运行一百多个 Cordis 配置项，但上游清单页面只暴露模块名、启用状态和 Fiber 阶段。这些事实适合诊断加载，不能解释插件的作用、参与时机、停用影响、代码来源或由哪条更新流负责。把每个配置项都当作可独立更新的包同样不正确：内置包共同组成与一个源码 commit 兼容的 Harness 发行版，而 profile 依赖可以拥有独立的 registry 生命周期。

桌面壳的托管源码更新器构建后续上游 commit 时，必须保留这些说明和更新行为。只修改上游 `packages/` 的内容不会进入该托管 checkout，因为更新器会把 `apps/electron` 覆盖到拉取的源码上。

## Decision

Electron 覆盖层从官方「通用设置」页面提供一个插件中心，不把固定控件覆盖在任务内容之上。Main 进程读取活动的 Host Loader，按包名聚合非 group 配置项，从 Electron profile 解析已安装的 `package.json`，并补充 profile 声明但未激活的依赖。启用沙箱的 preload 会先校验事实快照，再交给 renderer。Renderer 会把官方「插件列表」使用的非 group Loader 配置项总数与合并后的包卡片总数分开显示，增加中文产品说明，并把包分为功能、系统、界面、适配器和开发／内部插件，不修改 Loader 树。

说明目录按插件家族工作，不是一份封闭清单。已知核心包使用专门文案；`tool-`、`client-ui-`、`command-` 和 `llm-` 等角色前缀提供可用的时机与停用影响兜底。因此，新发现的包即使还没有专门文案，也仍然可搜索并提供足够的检查信息。能力标签是按包角色推断的定位提示；界面明确说明实际访问权限仍由 Harness 权限和插件配置决定。

插件中心不修改组合：它不启用、停用、安装或移除插件。这些操作会改变依赖拓扑、配置、权限和启动可用性，因此仍由[profile 插件组合包决策](../architecture/2026-08-05-profile-plugin-bundles.md)定义的 profile 管理路径负责。

## Update ownership

内置包只有一个更新负责人：Harness 源码 commit。它们显示「随 Harness 更新」，并交给[桌面托管源码更新器](2026-08-14-electron-managed-source-updates.md)处理；插件中心不会比较它们各自发布的 npm 版本。

Profile 依赖拥有独立更新负责人。Registry 管理的规格通过 pnpm 检查，只有用户选择一个明确的已安装包后才会更新。本地、link、URL、workspace 和 Git 规格保留手动更新，因为 registry 最新版本不能描述它们的来源。更新成功后会同步该依赖是否贡献 `dsh.bundle` 层，并要求重启应用后再运行新代码。

## Update safety

每次外部更新都会先在应用用户数据目录保留 profile manifest、存在时的 lockfile 和更新记录，再允许 pnpm 修改 profile。子进程使用与桌面源码更新器相同的凭据名称清理和受限 npm 用户配置。包名来自当前 profile 依赖快照，并作为参数交给 `spawn`，从不经过 shell。

更新失败时会恢复保留的 manifest 与 lockfile，再要求 pnpm 执行离线 frozen install，使已安装树重新匹配这些文件。回滚失败会作为独立错误明确显示。应用关闭时会向自己管理的 pnpm 子进程发送 `SIGTERM`，等待其结束后再清空插件管理器订阅者。

## Alternatives considered

**扩展上游 plugin-inventory 包。** 这样可以直接复用 Web 设置标签页，但桌面托管更新器会拉取干净的上游树并且只覆盖 `apps/electron`；本地 `packages/` 改动会在第一次成功桌面更新后消失。让覆盖层携带 package 补丁会形成不断增长且容易冲突的上游 UI 与 Remote contract 分叉。

**硬编码当前完整插件清单。** 这样可以立即提供完善说明，但上游新增或改名的包在 Electron 覆盖层更新前都不会出现。运行时发现配合家族兜底能在上游迭代中保持可见，并允许后续逐步改进重点文案。

**独立更新每个包。** 内置包版本作为同一源码树的组成部分发布，不能证明任意跨版本组合彼此兼容。只有 profile 依赖具备独立更新操作；内置包通过验证后的 Harness 构建一起移动。

**在后台自动安装第三方更新。** 插件包会使用自己声明的 Harness 能力执行代码，更新也可能改变组合或配置要求。插件中心会及时检查，但要求用户明确选择包并重启。

## Consequences

用户无需阅读 Cordis 配置或包源码，即可理解并搜索桌面应用实际运行的插件集合；同一 Electron 覆盖层也会继续发现上游新增内容。Loader 配置项总数与包总数分开显示，既让官方清单数量可以直接对照，也保留包级说明与更新。更新状态会说明每个包由哪条发布流负责，不会提供一项误导性的全局版本比较。外部更新获得保留元数据、回滚和明确的重启语义。

说明目录不是权限审计，家族兜底也不如专门描述精确。插件中心同时放弃了一键安装和组合修改。打包验证因此固定事实清单发现、非空 Loader 配置项投影、中文说明渲染、两个控制面板、API 传输、事件流和完全退出；它不会针对公共 registry 执行真实的外部包更新。
