# Agent Note: Electron MCP 配置

Status: implemented

[English](2026-08-15-electron-mcp-config.md) | 中文

## Problem

Harness 已提供 `@deepseek-ai/dsh-mcp-client`，但它的原生配置是面向 profile 作者的 Cordis patch 层。Electron 壳需要让用户在不手写 Loader YAML 的情况下连接可信的本机或 HTTP MCP 服务器。

## Decision

Electron 在 Harness home 数据旁保存经过校验的 `mcp-servers.json`。设置编辑器为每个服务器提供一行，支持 `stdio` 和 Streamable HTTP、启用状态、命令参数、环境变量、工作目录、URL 和请求头。文件使用原子写入和仅限当前用户的权限保存，不会经 renderer 或模型 session API 发送。

启动时，Electron runtime 将启用的行转换为官方 `@deepseek-ai/dsh-mcp-client` Loader 条目，并使用稳定的 `electron-mcp-<serverName>` id。现有 MCP 客户端继续负责传输生命周期、工具发现、命名空间、重连和错误；编辑器保存后标记应用需要重启，运行中的 Loader 树不会被直接修改。

界面会提示 stdio 命令在 Harness 沙箱之外运行，HTTP 请求会离开本机。Electron 不负责安装、审核、认证或隔离 MCP 服务器。当前 Harness 的 MCP seam 只暴露工具，因此资源和提示词不在本次接入范围内。

## Alternatives considered

**直接编辑 `cordis.patch.yml`。** 该方案被放弃，因为它会把界面生成状态与任意用户 overlay 混在一起，并要求用户理解 Cordis patch 语法。

**每次保存都热重载 Loader 树。** 该方案被放弃，因为命令、环境或传输变化可能启动或终止外部进程；显式重启让激活边界清晰且确定。

**静默读取全局 MCP 配置。** 该方案被放弃，因为全局文件可能包含无关服务器、隐式凭据和超出 Electron profile 所有权的命令。

## Consequences

用户可以直接在桌面应用中配置现有 MCP 客户端，生成的工具继续遵循上游 `mcp__<serverName>__<tool>` 命名约定。配置中的环境变量和请求头是明文，只由本机文件权限保护。服务器安装、更新、信任决策、资源、提示词和逐服务器健康界面仍不属于第一版集成。

聚焦测试覆盖原子往返、启用行的 patch 生成、重复名称拒绝和 HTTP URL 校验。Electron 类型检查、Main/renderer 构建及聚焦 Vitest 测试均通过。
