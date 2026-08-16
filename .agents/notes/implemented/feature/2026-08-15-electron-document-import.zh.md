# Agent Note: Electron 本地资料导入

Status: implemented

[English](2026-08-15-electron-document-import.md) | 中文

## Problem

官方浏览器提示协议只接受位图图片，但桌面用户需要向 Agent 提供 Word、Excel、PowerPoint、PDF、图片、文本、代码、Markdown 和文件夹资料。如果由 Electron carrier 扩展上游附件协议，就会产生第二套持久化附件系统，并且可能在没有大小限制的情况下把大文件送入模型上下文。

## Decision

Electron 壳在官方命令按钮旁提供本地导入入口。系统文件和文件夹选择器选中的内容会复制到应用 Harness home 下随机生成的目录。Main 进程拒绝符号链接，只接受普通文件，保留文件夹的相对路径，并限制每次最多 200 个文件、单文件 100 MiB、单次导入 500 MiB。

Renderer 使用待发送卡片保存导入资料描述。官方 `session.prompt` 请求通过 IPC 前，壳层会在提示前加入一个文本块，列出资料名称、类型、大小和绝对路径。这段文本沿用官方 session prompt 路径，因此由官方 session runtime 记录。Agent 通过现有文件或 shell 工具按需读取内容；carrier 不嵌入完整文件字节，也不伪造新的附件块。提示被接受后清空待发送卡片；移除卡片后续提示不再包含它。

导入存储不解析 Office/PDF，也不执行 OCR。系统应用和现有 Agent 工具继续负责读取；不支持的导入会明确报告失败，不会静默当作文本。

## Alternatives considered

**扩展官方附件协议。** 该方案被放弃，因为当前 wire 和持久化附件服务只针对图片；增加二进制文档块需要上游 session schema、持久化、模型内容和 client renderer 同步改动，Electron 壳不应独自承担这些职责。

**每次提示都嵌入解析后的文档文本。** 该方案被放弃，因为解析和 OCR 依赖格式，长文档会带来 token 成本，也可能绕过 session log 对模型可见输入的大小约束。

**保留用户原始路径。** 该方案被放弃，因为用户改名或权限变化会让卡片失效。复制到应用专属随机目录可以得到稳定的 Agent 读取路径，部分复制失败时也只需删除一个导入目录即可恢复。

## Consequences

第一版为所需文件类型和文件夹提供统一的本地流程，同时沿用现有 session 与工具协议。文件内容在 Agent 主动读取前留在本机；提示中加入的名称和路径仍会被配置的模型提供方看到。导入资料会保留在 Harness home 中，直到用户移除或清理该目录。原生 Office/PDF 预览、文本提取、OCR、导入历史和按 session 回收导入目录仍属于后续工作。

聚焦测试覆盖文件夹相对路径复制、符号链接拒绝、大小拒绝、提示引用注入和提示接受后的清理。Electron typecheck、Main/renderer 构建及聚焦 Vitest 套件均通过。
