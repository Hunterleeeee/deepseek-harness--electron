# DeepSeek Harness Electron

[English](README.md) | 中文

<div align="center">
  <img src="apps/web/public/favicon.svg" alt="DeepSeek Harness" width="88" />
  <h3>看懂 Agent 在做什么，在本地工作，并跟上上游更新。</h3>
  <p>面向 <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a> 的社区 Electron 桌面壳。</p>
  <p>
    <a href="https://github.com/Hunterleeeee/deepseek-harness--electron/releases"><img src="https://img.shields.io/github/v/release/Hunterleeeee/deepseek-harness--electron?display_name=tag&sort=semver" alt="最新版本" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT 许可证" /></a>
    <a href="https://www.apple.com/macos/sonoma/"><img src="https://img.shields.io/badge/platform-macOS%20arm64-black.svg" alt="macOS arm64" /></a>
  </p>
  <p><a href="README.md">English</a> · <a href="https://github.com/Hunterleeeee/deepseek-harness--electron">项目仓库</a> · <a href="https://github.com/deepseek-ai/deepseek-harness">上游项目</a></p>
</div>

> 这是一个非官方社区项目，不由 DeepSeek AI 维护、分发或背书。Agent 运行时以上游 Harness 为准。

## 这个项目增加了什么

DeepSeek Harness 负责 Agent 运行时和插件组合；本仓库增加本地桌面层，让你不必打开浏览器标签页或单独启动本地 Web 服务，也能更容易地观察和学习 Agent 的工作过程。

| 你的需求 | 桌面壳提供的体验 |
| --- | --- |
| 看懂 Agent 做了什么 | 点击任意轨迹记录或步骤，查看这次 Request、工具调用、状态变化和相关 Agent 知识的确定性解释。 |
| 查看生成的文件 | 在右侧抽屉预览 Markdown、文本和常见图片，也可以在访达或系统应用中打开真实文件。 |
| 使用本地资料 | 点击回形针添加文件或文件夹；Agent 先收到受限的名称、类型、大小和路径，再通过已有工具读取需要的内容。 |
| 看懂插件生态 | 在「设置 → 插件中心」查看插件用途、来源、影响范围、启用条目、版本和更新状态。 |
| 连接 MCP 工具 | 在「设置 → MCP 配置」中配置可信的 stdio 或 Streamable HTTP 服务器。 |
| 跟上游一起迭代 | 检查官方源码，在应用专属目录构建待验证版本，通过兼容性检查后再安装。 |

## 下载或从源码运行

已经发布的安装包会放在 [Releases](https://github.com/Hunterleeeee/deepseek-harness--electron/releases)。当前打包目标是 macOS 12 或更高版本的 Apple 芯片（arm64）。本地构建没有签名或公证，macOS 可能要求按住 Control 键点按应用并选择「打开」。

## 运行

### 从源码运行

```sh
git clone https://github.com/Hunterleeeee/deepseek-harness--electron.git
cd deepseek-harness--electron
pnpm install
pnpm electron:dev
```

环境要求：macOS 12 或更高版本的 Apple 芯片、Node.js `^22.19.0` 或 `>=24.0.0`、pnpm `11.7.0`、Git，以及足够容纳依赖和构建产物的磁盘空间。

构建并验证安装包：

```sh
pnpm electron:pack
pnpm electron:dist
pnpm electron:verify
```

构建产物写入 `apps/electron/release/`。会话、设置、凭据、导入文件和工作区保存在用户自己的 Harness home 中，不会进入安装包或仓库。

## 用轨迹学习 Agent

轨迹区域有独立的 **中文 / English** 切换。首次使用时跟随全局语言，之后单独保存；切换轨迹语言不会改变应用其他区域。

学习面板不是一套固定课程。点击 ledger 记录、Request 边界、工具调用或时间线步骤，面板就会解释当前选中的那一项：展示可见状态和标签，介绍相关 Agent 概念，并指向原始详情。它不会展示或猜测隐藏的模型推理；原始 JSON、代码、工具输出、模型名称和诊断正文保持不变。

## 上游更新是怎么工作的

更新器读取官方仓库的默认分支，在 Harness home 下的应用专属 checkout 中构建。它会叠加运行中安装包携带的 Electron 源码、安装依赖、编译 Harness、启动待验证应用，并在通过兼容性检查后才提供「安装并重启」。

更新器不会在生成当前应用的 checkout 中执行 fetch、rebase、stash、clean 或构建。首次更新可能需要数分钟和数 GB 临时空间，并且需要网络、`/usr/bin/git`、受支持的 Node.js 版本，以及用户登录 shell 可访问的 pnpm。如果上游变更需要调整 Electron 覆盖层，更新会停留在待验证状态，直到壳完成适配并通过检查。

## 安全与限制

- Renderer 不启用 `nodeIntegration`；桌面能力通过精简的 preload API 暴露。
- 只配置信任的 MCP 服务器。stdio 服务器会作为本地进程运行，HTTP 服务器会收到你配置的地址、请求头和请求。
- 导入文件会复制到应用专属目录，并把名称和路径提供给 Agent；壳不承诺 Office/PDF 解析或 OCR。
- 产物预览只支持有大小上限的 Markdown、文本和常见栅格图片；不支持或过大的文件仍可交给访达或系统应用打开。
- 当前仅提供 macOS arm64 包，不提供 Windows、Linux 或 Intel Mac 版本。
- 源码更新生成的是未签名本地构建；只有在信任源码 commit 和构建产物时才应安装。

## 项目导航

- [DeepSeek Harness 架构](docs/architecture.md) — 上游组合方式、包和扩展点。
- [许可证](LICENSE) 与 [第三方声明](THIRD_PARTY_NOTICES.md)。

## 参与贡献

欢迎提交 Issue 和 Pull Request。请让改动聚焦于桌面壳，保持与上游的集成边界，并且不要提交 API 密钥、会话、凭据或本地产物。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。DeepSeek Harness 与第三方依赖保留各自的许可证声明。
