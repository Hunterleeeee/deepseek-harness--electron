# Agent Note: Electron 应用内产物预览

Status: implemented

[English](2026-08-14-electron-artifact-preview.md) | 中文

## Problem

官方产出文件交互会把解析后的路径发送给 `host.openPath`，再由系统应用打开文件。桌面用户需要在任务旁快速查看 Agent 生成的 Markdown、文本或图片，同时不能替换无关路径的官方打开操作，也不能执行生成内容。

## Decision

只有用户点击官方产出文件控件或行内文件引用时，Electron renderer 才会记录一个短时预览意图。下一次匹配的 `host.openPath` 请求会打开右侧预览，并收到官方 client 预期的相同成功 Host 响应。没有这次用户交互的请求仍使用普通系统打开流程。

Main 进程要求绝对文件路径，解析符号链接，只接受普通文件，再返回可供 renderer 显示的数据。Markdown 与常见文本格式按 UTF-8 解码，上限为 2 MiB。PNG、JPEG、GIF 和 WebP 图片会转换为 data URL，上限为 12 MiB。不支持或更大的文件只返回元数据，不返回内容。SVG 保持文本形式，不作为活动图片标记渲染。

Renderer 使用现有 Markdown 组件提供渲染视图，同时可以切换源码。抽屉还提供复制路径、在 Finder 中显示和系统打开操作。Escape 与关闭按钮都能关闭抽屉，再把焦点交还给发起预览的控件。

## Alternatives considered

**把所有 `host.openPath` 调用都替换为预览。** 不采用，因为 `host.openPath` 也服务于产出文件之外的明确系统打开操作。短时点击意图只改变用户选择的产物入口。

**在 Electron 中渲染所有文件类型。** 不采用，因为办公文档、压缩包、媒体和可执行格式需要解析器，会带来更大的依赖与安全成本。不支持的文件保留系统打开路径。

**通过 renderer 的直接文件系统访问加载文件。** 不采用，因为启用沙箱的 renderer 不会获得 Node.js 或 `ipcRenderer`。Main 进程负责有大小限制的读取，preload 只暴露有类型的产物操作。

## Consequences

用户可以留在任务中查看常见 Agent 产物，对照 Markdown 渲染与源码，并且仍能在原生应用中打开任意产物。预览流程不会执行生成内容，有大小限制的读取也避免把大文件复制到 renderer 内存。

支持格式和字节上限是明确的有限集合。产出文件预览仍会把用户选择的本地文件读入 renderer，因此应用把这项界面操作视为本地可信用户操作，而不是远程共享机制。聚焦测试覆盖解码限制、不支持文件、拦截范围、抽屉渲染和清理；打包验证会对构建后的应用重复一次产出文件打开。
