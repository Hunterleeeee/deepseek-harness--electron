# Agent Note: Electron 轨迹语言呈现层

Status: implemented

[English](2026-08-14-electron-trajectory-localization.md) | 中文

## Problem

官方 Trajectory 插件已经注册中文标签页和少量工具栏文案，但记录表、时间线、详情检查器、状态与无障碍文案大多仍是硬编码英文。本地 Electron 应用需要可读的中文视图和仅作用于 Trajectory 的语言选择，同时不能分叉上游插件包、改变应用语言，也不能翻译排错时必须保持原样的工具名、模型名、JSON 载荷和诊断文本。

## Decision

Electron renderer 在 `AppWebEntry` 完成后安装仅负责呈现的观察器。它会在 Trajectory 明确提供的 `data-conversation-composer-overlay` 根节点内插入 **中文 / English** 选择器。首次选择跟随工具栏反映的应用语言；用户后续选择会保存在 renderer 本地存储中，并与应用语言保持独立。英文模式会恢复 Electron 翻译的值，并把官方字典提供的少量中文标签统一为英文。

翻译器维护明确的界面词表，并以有限模式处理回合、步骤、请求、上下文压缩、内容块和折叠概览标签。它翻译文本以及 `aria-label`、`title`、`placeholder`、`data-label` 等界面属性；`pre`、`code`、可编辑内容和 JSON 树会被排除，因此原始载荷、工具输出、模型标识与错误正文保持不变。每个 DOM 节点的原值都会被保留，应用切换到英文时会恢复。

呈现层源码位于 `apps/electron`，现有托管源码更新覆盖层会在每次更新中携带它。上游新增加的标签在 Electron 词表更新前仍以英文显示；缺少翻译不会隐藏事件，也不会阻止交互。

## Alternatives considered

**直接修改本地的上游 `ui-trajectory` 包。** 不采用，因为托管更新器会在每次官方更新时替换 Harness 源码树。携带包分叉或精确源码补丁会持续产生冲突，并把变更扩展到本次需求之外的官方 Web 组合。

**改写已编译的 Trajectory 客户端 bundle。** 不采用，因为同一字符串字面量还可能用于英文字典和内部显示标记。依赖 bundle 格式的改写可能改变行为，或者破坏真实的英文语言模式。

**翻译 renderer 下的全部英文文本。** 不采用，因为助手内容、工具输出、模型名称、JSON 和可搜索错误必须保持精确。明确的 Trajectory 根节点和原始内容排除规则使这项操作只影响呈现。

**只使用应用全局语言设置。** 不采用，因为 Trajectory 是技术学习视图，其语言可能需要与应用其他部分不同。本地选择器只改变 Trajectory 呈现文案。

## Consequences

Electron 用户可以在不改变应用其他部分的情况下切换 Trajectory 的中英文，同时原始机器数据保持不变。选择会在应用重启后保留，切换可以恢复原文，上游客户端包也没有被修改，因此托管更新器仍能跟随官方源码变化。

观察器依赖 Trajectory 的明确根节点标记和已知可见短语。上游重命名只会留下一个中英混合标签，不会破坏数据或阻止启动。聚焦测试固定静态与动态标签以及语言隔离；打包验证会挂载一个合成 Trajectory 根节点，证明安装包中的控件可以切换文本和无障碍属性，同时不会改变应用语言。独立的[基于证据的学习模式](2026-08-14-electron-trajectory-learning.md)使用同一个有限根节点，不会改变这里的语言归属。
