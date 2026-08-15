# DeepSeek Harness Electron

[English](README.md) | 中文

<div align="center">
  <p><strong>面向 DeepSeek Harness 的社区 Electron 桌面壳</strong></p>
  <p>将 Harness 作为专注的 macOS 应用运行，并提供轨迹学习、文件预览、插件说明、MCP 配置和上游源码更新。</p>
  <p>
    <a href="https://github.com/Hunterleeeee/deepseek-harness--electron">项目仓库</a> ·
    <a href="https://github.com/deepseek-ai/deepseek-harness">上游 Harness</a> ·
    <a href="LICENSE">MIT 许可证</a>
  </p>
</div>

**非官方社区桌面壳。** 本项目不由 DeepSeek AI 维护、分发或背书。上游 Harness 仍然是 Agent 运行时的事实来源。

## 核心能力

| 能力 | 说明 |
| --- | --- |
| Electron 桌面壳 | 本地 macOS 应用，通过精简的 Electron IPC 层承载 Harness 流量，不依赖浏览器标签页或本地 Web 服务器。 |
| 轨迹学习 | 提供轨迹中文／English 切换，并针对选中的 Request、工具调用和时间线记录进行逐步解释。 |
| 产物预览 | 在应用内预览 Markdown、文本和常见图片，并支持在访达或系统应用中打开。 |
| 文件与文件夹导入 | 将资料和文件夹导入应用专属工作区，并把路径提供给 Agent 使用。 |
| 插件中心 | 查看内置和外部插件的用途、来源、影响范围以及可更新时机。 |
| MCP 配置 | 在桌面设置中配置可信的 stdio 和 Streamable HTTP MCP 服务器。 |
| 上游更新 | 检查官方仓库，从指定源码 commit 构建并验证桌面包，安装时不会修改用户工作区。 |

## 下载

前往 [Releases](https://github.com/Hunterleeeee/deepseek-harness--electron/releases) 页面获取打包版本。当前安装包面向 macOS 12 或更高版本的 Apple 芯片（arm64）。构建产物没有签名或公证，macOS 可能需要按住 Control 键点按应用并选择「打开」。

每位使用者都需要配置自己的模型凭据，并拥有独立的 Harness 数据目录。仓库不会包含 API 密钥、会话、设置、工作区文件或构建机器数据。

## 运行

### 从源码运行

使用以下步骤从源码 checkout 运行桌面壳。

### 环境要求

- macOS 12 或更高版本，Apple 芯片
- Node.js `^22.19.0` 或 `>=24.0.0`
- pnpm `11.7.0`
- Git，以及足以容纳源码、依赖和打包产物的磁盘空间

### 常用命令

```sh
git clone https://github.com/Hunterleeeee/deepseek-harness--electron.git
cd deepseek-harness--electron
pnpm install
pnpm electron:dev
```

构建本地应用或 DMG：

```sh
pnpm electron:pack
pnpm electron:dist
```

分享前验证打包应用：

```sh
pnpm electron:verify
```

生成的文件位于 `apps/electron/release/`。应用会把会话、设置、凭据、导入文件和工作区数据保存在用户自己的 Harness home 中；重新构建不会把这些文件复制到安装包。

## 上游更新机制

桌面更新器会读取官方仓库的默认分支和 commit，然后使用应用专属 checkout 构建新版本。它会叠加当前安装包携带的 Electron 源码、安装依赖、编译 Harness、启动待安装应用执行兼容性检查，并且只有验证成功后才提供安装。

更新器不会在生成当前应用的 checkout 中执行 fetch、rebase、stash、clean 或构建。更新需要网络、`/usr/bin/git`、受支持的 Node.js 版本、用户 Bash 或 Zsh 登录 shell 可访问的 pnpm，以及数 GB 临时磁盘空间。

## 安全与限制

- Renderer 不启用 Node.js 集成；桌面能力通过精简的 preload API 暴露。
- 只配置信任的 MCP 服务器。stdio 服务器会作为本地进程运行，HTTP 服务器会收到应用中配置的请求和请求头。
- 文件导入会把名称和路径提供给 Agent；Electron 壳不承诺原生 Office/PDF 解析或 OCR。
- 当前打包目标是 macOS arm64，不提供 Windows、Linux 或 Intel Mac 版本。
- 本项目跟随上游源码变化，但不是 DeepSeek 官方发行版；上游变更可能要求先调整 Electron 覆盖层，才能安装更新。

更多实现细节见 [Electron 应用指南](apps/electron/README.md)。上游架构见 [DeepSeek Harness 架构文档](docs/architecture.md)。

## 参与贡献

欢迎提交 Issue 和 Pull Request。请让改动聚焦于桌面壳，保持与上游的集成边界，并避免提交凭据或本地产物。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。上游 DeepSeek Harness 与第三方依赖保留各自的许可证声明，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
