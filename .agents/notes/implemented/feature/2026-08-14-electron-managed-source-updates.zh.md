# Agent Note: Electron 桌面应用的托管源码更新

Status: implemented

[English](2026-08-14-electron-managed-source-updates.md) | 中文

## Problem

本地 Electron 应用需要跟随官方 `master` 分支的变更，同时不要求用户操作 Web 应用或 CLI（命令行界面）。官方项目不发布此 Electron 应用，也不提供兼容的更新源，因此传统二进制更新器没有可安装的产物。对用户工作 checkout 执行 rebase、stash、clean 或构建会威胁未提交工作，并使更新能否成功取决于无关的分支状态。

## Decision

打包应用从官方「通用设置」页面提供 Electron 自有的更新面板，不把固定控件覆盖在任务内容之上。面板通过 `git ls-remote` 将内嵌的上游 commit 与 `https://github.com/deepseek-ai/deepseek-harness.git` 比较。更新只使用 `~/Library/Application Support/DeepSeek Harness/updates/source` 下的应用托管 checkout；它绝不在生成已安装应用的 checkout 中执行 Git 或构建写操作。

每个桌面安装包都携带自身的 `apps/electron` 源码作为更新覆盖层。更新器在 detached 状态下检出选定的官方 commit，用安装包携带的覆盖层替换该 checkout 的 `apps/electron` 目录，为 checkout 的 pnpm 配置补充 Electron 依赖构建权限，然后安装依赖、编译 Harness，并构建 macOS 应用与磁盘映像。更新器只会复用同时具有标记文件和准确官方 remote 的现有目录。

在任何官方源码运行前，用户的 Bash 或 Zsh 登录 shell 只负责解析 pnpm 可执行文件。Git、pnpm、构建、验证与替换子进程接收的环境会移除名称表示凭据的变量，因此官方构建输出无法打印 Electron 进程继承的 Harness 凭据。

面板只有在待安装应用通过打包兼容性检查后才会启用安装。检查会启动真实的待安装可执行文件，并验证依赖闭包、原生 PTY 二进制文件、client 插件图、Host API 与事件流、更新控件、内嵌 commit，以及应用完全退出。构建或验证失败不会改动当前运行的应用及其数据，并会提供有长度限制、可复制的日志，以便诊断和重试。

只有当运行中的 `.app` 具有可写父目录且不位于 `/Volumes` 下时，才可以安装。独立 helper 会等待主进程退出，移除上一次由更新器管理的备份，把当前应用重命名到备份位置，再把待安装应用重命名到原位置；替换失败时会回滚，成功时会打开已安装版本。从只读位置或磁盘映像启动时，更新器不会尝试升权，而是显示已验证产物供用户手动复制。

## Alternatives considered

**通过发布源使用 `electron-updater`。** 官方仓库不发布此本地壳、已签名桌面产物或更新元数据。二进制更新器需要独立运营的发布渠道，也无法直接跟随上游源码。

**fetch 并 rebase 用户的本地分支。** 这种做法可能与本地改动冲突，需要干净的 checkout 或 stash，并会让应用接管并非由它创建的开发者工作。

**不启动就安装刚构建的应用。** 编译和打包不能证明官方 client 插件图、IPC 载体、原生依赖与持久化运行时仍能共同启动。因此，待安装可执行文件通过兼容性检查之前，安装功能保持不可用。

**为 `/Applications` 升权，或直接从已挂载磁盘映像安装。** 这个未签名的本地应用不会请求管理员权限。它只会在当前用户已有写入权限的位置执行原位替换，否则会显示产物，由用户明确执行手动安装。

## Consequences

上游 Harness 变更可以通过一个可见工作流进入桌面应用，同时用户 checkout 与 Harness home 保持不变。替换前必须完成验证，之前安装的应用会保留为一份由更新器管理的备份。

应用依赖本地 Apple 芯片 macOS 工具链，包括 Git、受支持的 Node.js 版本、pnpm、网络，以及足以容纳源码树、依赖、构建输出、应用与磁盘映像的空间。首次更新耗时较长，并会占用数 GB。若上游变更破坏安装包携带的 Electron 覆盖层，更新会明确失败，并需要手动重新构建覆盖层；已安装的更新器无法独立更新自身覆盖层。源码构建与替换仍是未签名的本地产物，并且只保留最近一次成功安装的备份。
