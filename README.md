# DeepSeek Harness Electron

English | [中文](README.zh.md)

<div align="center">
  <img src="apps/web/public/favicon.svg" alt="DeepSeek Harness" width="88" />
  <h3>Understand your agent. Work locally. Keep up with upstream.</h3>
  <p>A community-maintained Electron desktop shell for <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>.</p>
  <p>
    <a href="https://github.com/Hunterleeeee/deepseek-harness--electron/releases"><img src="https://img.shields.io/github/v/release/Hunterleeeee/deepseek-harness--electron?display_name=tag&sort=semver" alt="Latest release" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
    <a href="https://www.apple.com/macos/sonoma/"><img src="https://img.shields.io/badge/platform-macOS%20arm64-black.svg" alt="macOS arm64" /></a>
  </p>
  <p><a href="README.zh.md">中文说明</a> · <a href="https://github.com/Hunterleeeee/deepseek-harness--electron">Repository</a> · <a href="https://github.com/deepseek-ai/deepseek-harness">Upstream</a></p>
</div>

> This is an unofficial community project. It is not maintained, distributed, or endorsed by DeepSeek AI. The upstream Harness remains the source of truth for the agent runtime.

## What this project adds

DeepSeek Harness provides the agent runtime and plugin composition. This repository adds a local desktop layer so you can use that runtime without a browser tab or a separate local web server, while making the agent's work easier to inspect and learn from.

| Need | Desktop experience |
| --- | --- |
| See what the agent did | Select any Trajectory record or step and get a deterministic explanation of the request, tool call, state, and relevant Agent concept. |
| Read generated files | Preview Markdown, text, and common images in a right-side drawer, or open the real file in Finder or a system application. |
| Work with local material | Add files or folders from the paperclip button; the agent receives bounded metadata and paths, then reads what it needs through its existing tools. |
| Understand the plugin graph | Browse package purpose, source, affected capabilities, active entries, versions, and update status in Settings → Plugin center. |
| Connect MCP tools | Configure trusted stdio or Streamable HTTP servers in Settings → MCP configuration. |
| Follow upstream changes | Check the official source, build a staged package in an app-owned checkout, run compatibility checks, and install only after validation. |

## Download or build

Packaged builds, when published, are listed on [Releases](https://github.com/Hunterleeeee/deepseek-harness--electron/releases). The current packaging target is macOS 12 or later on Apple Silicon (arm64). Local builds are unsigned and not notarized; macOS may require Control-clicking the app and choosing **Open**.

## Run

### Run from source

```sh
git clone https://github.com/Hunterleeeee/deepseek-harness--electron.git
cd deepseek-harness--electron
pnpm install
pnpm electron:dev
```

Requirements: macOS 12 or later on Apple Silicon, Node.js `^22.19.0` or `>=24.0.0`, pnpm `11.7.0`, Git, and enough disk space for dependencies and build output.

Build and verify a package:

```sh
pnpm electron:pack
pnpm electron:dist
pnpm electron:verify
```

Build output is written to `apps/electron/release/`. Sessions, settings, credentials, imported files, and workspaces live in the user's Harness home, not in the application bundle or repository.

## Learn from the Trajectory

Trajectory has its own **中文 / English** selector. It follows the application locale on first use and then persists independently, so changing it does not change the rest of the application.

The learning panel is not a fixed lesson. Click a ledger record, Request boundary, tool call, or timeline step to explain that exact item. The panel shows the visible state and labels, introduces the related Agent concept, and points back to the original details. It never presents or guesses hidden model reasoning; raw JSON, code, tool output, model names, and diagnostic bodies remain unchanged.

## How upstream updates work

The updater reads the official repository's default branch and builds in an application-owned checkout under the Harness home. It overlays the Electron sources carried by the running package, installs dependencies, builds Harness, launches the staged app, and runs compatibility checks before offering **Install and restart**.

The updater never fetches, rebases, stashes, cleans, or builds in the checkout that produced the running app. A first update can take several minutes and several gigabytes of temporary disk space. Network access, `/usr/bin/git`, a supported Node.js version, and pnpm available from the user's login shell are required. If upstream changes require an Electron adaptation, the update remains staged until the desktop overlay is updated and verification passes.

## Security and limitations

- The renderer has `nodeIntegration: false`; desktop capabilities cross a narrow preload API.
- Configure only MCP servers you trust. Stdio servers run as local processes, and HTTP servers receive the URL, headers, and requests you configure.
- Imported files are copied into an application-owned directory and exposed as names and paths. The shell does not promise Office/PDF parsing or OCR.
- Artifact previews are bounded to Markdown, text, and common raster images; unsupported or oversized files can still be opened in Finder or a system application.
- The package targets macOS arm64 only. Windows, Linux, and Intel Mac builds are not included.
- Source updates are unsigned local builds. Install them only when you trust the source commit and the resulting package.

## Project map

- [DeepSeek Harness architecture](docs/architecture.md) — upstream composition, packages, and extension points.
- [License](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).

## Contributing

Issues and pull requests are welcome. Keep changes focused on the desktop shell, preserve the upstream integration boundary, and never commit API keys, sessions, credentials, or generated local artifacts.

## License

This project is released under the [MIT License](LICENSE). DeepSeek Harness and third-party dependencies retain their respective notices.
