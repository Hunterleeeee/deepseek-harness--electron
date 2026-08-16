# DeepSeek Harness Electron

English | [中文](README.zh.md)

<div align="center">
  <p><strong>A community Electron desktop shell for DeepSeek Harness</strong></p>
  <p>Run the Harness locally as a focused macOS app with trajectory learning, file previews, plugin explanations, MCP configuration, and upstream source updates.</p>
  <p>
    <a href="https://github.com/Hunterleeeee/deepseek-harness--electron">Repository</a> ·
    <a href="https://github.com/deepseek-ai/deepseek-harness">Upstream Harness</a> ·
    <a href="LICENSE">MIT License</a>
  </p>
</div>

**Unofficial community shell.** This project is not maintained, distributed, or endorsed by DeepSeek AI. The upstream Harness remains the source of truth for the agent runtime.

## Highlights

| Capability | What it provides |
| --- | --- |
| Electron desktop shell | A local macOS application that carries Harness traffic through a narrow Electron IPC layer instead of a browser tab or local Web server. |
| Trajectory learning | Chinese / English trajectory controls and step-by-step explanations for selected requests, tool calls, and timeline records. |
| Artifact preview | In-app Markdown, text, and common image previews with Finder and system-app fallbacks. |
| File and folder import | Import documents and folders into an application-owned workspace and make their paths available to the agent. |
| Plugin center | See what built-in and external plugins do, where they come from, what they affect, and when they can be updated. |
| MCP configuration | Configure trusted stdio and Streamable HTTP MCP servers from the desktop settings. |
| Upstream updates | Check the official repository, build a verified desktop package from the selected source commit, and install it without touching a user checkout. |

## Download

Open the [Releases](https://github.com/Hunterleeeee/deepseek-harness--electron/releases) page for packaged builds. The current package targets macOS 12 or later on Apple Silicon (arm64). Builds are unsigned and not notarized, so macOS may require Control-clicking the app and choosing **Open**.

Every user configures their own model credentials and receives an independent Harness data directory. The repository does not contain API keys, sessions, settings, workspace files, or build-machine data.

## Run

### Run from source

Use the following setup to run the desktop shell from a checkout.

### Requirements

- macOS 12 or later on Apple Silicon
- Node.js `^22.19.0` or `>=24.0.0`
- pnpm `11.7.0`
- Git and enough disk space for the source tree, dependencies, and packaged artifacts

### Commands

```sh
git clone https://github.com/Hunterleeeee/deepseek-harness--electron.git
cd deepseek-harness--electron
pnpm install
pnpm electron:dev
```

Build a local application or DMG:

```sh
pnpm electron:pack
pnpm electron:dist
```

Verify the packaged application before sharing it:

```sh
pnpm electron:verify
```

The generated files are placed under `apps/electron/release/`. The application stores sessions, settings, credentials, imported files, and workspace data under the user-specific Harness home; rebuilding the app does not copy those files into the package.

## How upstream updates work

The desktop updater reads the official repository's default branch and commit, then uses an application-owned checkout to build a new package. It overlays the Electron sources carried by the running package, installs dependencies, builds Harness, launches the staged app for compatibility checks, and offers installation only after verification succeeds.

The updater never fetches, rebases, stashes, cleans, or builds in the checkout that produced the running application. Updates require network access, `/usr/bin/git`, a supported Node.js version, pnpm available from the user's Bash or Zsh login shell, and several gigabytes of temporary disk space.

## Security and limitations

- The renderer runs without Node.js integration; desktop capabilities are exposed through a narrow preload API.
- Configure only MCP servers you trust. Stdio servers run as local processes and HTTP servers receive the requests and headers configured in the app.
- File import supplies names and paths to the agent; the Electron shell does not promise native Office/PDF parsing or OCR.
- The packaged target is macOS arm64. Windows, Linux, and Intel Mac builds are not included.
- This project follows upstream source changes but is not an official DeepSeek distribution. Upstream changes can require a new Electron overlay before an update can be installed.

More implementation detail is available in the [Electron application guide](apps/electron/README.md). The upstream architecture is documented in [DeepSeek Harness architecture](docs/architecture.md).

## Contributing

Issues and pull requests are welcome. Keep changes focused on the desktop shell, preserve the upstream integration boundary, and avoid committing credentials or generated local data.

## License

This project is released under the [MIT License](LICENSE). Upstream DeepSeek Harness and third-party dependencies retain their respective notices; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
