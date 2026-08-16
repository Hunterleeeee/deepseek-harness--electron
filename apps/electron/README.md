# Electron desktop application

English | [中文](README.zh.md)

This workspace application packages DeepSeek Harness as a local macOS desktop app. It reuses the official Web profile, React shell, and client plugin graph, but carries API calls, plugin bundles, and event streams over Electron IPC instead of listening on a local HTTP port. The owning [GUI layering decision](../../.agents/notes/implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md) describes the shared Host/Client architecture.

## Architecture

| Process | Responsibility | Security properties |
|---|---|---|
| Main | Boots `dsh-base` + `dsh-web-app`, replaces the listening Web server with an in-memory registration service, dispatches the official API Proxy, reads plugin package metadata, and owns update subprocesses | Owns Node.js, filesystem, credentials, sessions, profile dependencies, and Cordis lifecycle |
| Preload | Exposes the narrow `window.dshDesktop` API for bootstrap, bundle reads, unary fetches, cancellation, Host/Mux streams, desktop/plugin updates, and bounded artifact reads | Sandboxed with context isolation; validates main-process snapshots and does not expose `ipcRenderer` or Node.js |
| Renderer | Runs the official `AppWebEntry`, installs `fetch` and receive-only `WebSocket` compatibility adapters, loads every client plugin from the Host-authored graph, and adds Electron settings, Trajectory learning, and artifact preview presentation | `nodeIntegration: false`; CSP denies network connections and navigation stays inside the packaged page |

The CSP keeps `unsafe-eval` because the vendored Cordis Loader evaluates the dynamic expressions used by Harness configuration. `connect-src 'none'` still prevents the renderer from opening network connections; all Harness traffic crosses the explicit preload API.

## Local use

The packaged application runs on macOS 12 or later on Apple Silicon. Ordinary use does not require the repository, Node.js, or pnpm; those tools are required only to build from source or use the source updater.

The DMG may be copied to another Apple Silicon Mac. It contains application code, dependencies, and the upstream MIT license notice, but no sessions, settings, workspace data, or credentials from the machine that built it. Each recipient gets an independent Harness home and must configure their own `DEEPSEEK_API_KEY`. This local build is neither Developer ID signed nor notarized, so macOS may require Control-clicking the app and choosing Open, or allowing it in System Settings → Privacy & Security. It does not run on Intel Macs, Windows, or Linux.

Building from source requires the repository's supported Node.js version, pnpm, and a completed `pnpm install` at the repository root.

Run from source:

```sh
pnpm electron:dev
```

Build a local `.app` or disk image:

```sh
pnpm electron:pack
pnpm electron:dist
```

The outputs are `apps/electron/release/mac-arm64/DeepSeek Harness.app` and `apps/electron/release/DeepSeek Harness-0.1.0-local.1-arm64.dmg`. They are unsigned local builds. On first launch, macOS may require Control-clicking the app and choosing Open, or allowing it in System Settings → Privacy & Security.

Each desktop build generates its application icon from the official black whale in `apps/web/public/favicon.svg`, so an upstream logo update enters the next package without a second maintained asset.

Open the model settings in the application and store `DEEPSEEK_API_KEY` before starting a model turn. The writable credential provider saves it under the application Harness home; do not put a key in the repository.

The application Harness home is `~/Library/Application Support/DeepSeek Harness/harness`. Sessions, workspaces, settings, credentials, and the generated `electron` profile remain there when the application is rebuilt. Remove or back up that directory only when you intentionally want a fresh desktop state.

## Trajectory language and learning

The Trajectory view has its own **中文 / English** selector. Its first selection follows the active application locale, then persists independently; changing Trajectory language does not change the rest of the application. Chinese mode translates the visible toolbar, ledger, timeline, status, summary, inspector, and accessibility copy inside the explicit Trajectory root. Raw JSON, code, tool output, model names, and diagnostic bodies remain unchanged. The [Trajectory language decision](../../.agents/notes/implemented/feature/2026-08-14-electron-trajectory-localization.md) records why this remains an Electron presentation layer instead of a fork of the upstream package.

**Step-by-step learning** marks each selectable ledger record, Request boundary, and timeline step. Clicking or focusing one of them updates the panel with that exact record's visible index, state, label, and tool name, then explains what happened, the relevant Agent concept, and where to verify it in the original details. It is not a fixed lesson: selecting `Tool: bash` and a model Request produces different explanations. The catalog never presents or guesses hidden model reasoning. The [Trajectory learning decision](../../.agents/notes/implemented/feature/2026-08-14-electron-trajectory-learning.md) records this evidence limit and the deterministic teaching catalog.

## Artifact preview

Clicking a file in the official produced-files row, or an inline file reference emitted through the same open-path flow, opens a right-side preview inside the application. Markdown supports rendered and source views; common text files and PNG, JPEG, GIF, and WebP images open directly. The drawer can copy the resolved path, reveal the file in Finder, or hand it to the system application.

The main process resolves the real file and reads it without executing its contents. Text and Markdown previews are limited to 2 MiB and images to 12 MiB; larger or unsupported files show metadata and retain Finder/system-open actions. An ordinary `host.openPath` request that does not follow a produced-file click keeps the official system-open behavior. The [artifact preview decision](../../.agents/notes/implemented/feature/2026-08-14-electron-artifact-preview.md) records the interception and size limits.

## Document import

The paperclip button beside the official command button offers **Add files** and **Add folder**. It accepts PDF, Word, Excel, PowerPoint, images, Markdown, code, text, and other files; a folder is copied as one directory with its relative tree. The main process copies selections into a random application-owned directory under the Harness home, refuses symbolic links, and enforces a 200-file, 100 MiB-per-file, and 500 MiB-per-import limit.

Imported documents are local references, not a second browser attachment protocol. When the next `session.prompt` is sent, the Electron carrier adds the imported names, types, sizes, and absolute paths to the logged user text. The model can then use the existing file or directory tools to read only what it needs; full document bytes are not placed into the prompt automatically. Removing a card drops it from later prompts, and an accepted prompt clears the cards. The model provider still receives the names and paths included in the prompt, and tool output is subject to the normal model-provider policy.

The first version does not promise native Office or PDF rendering or OCR. The imported copy remains available for the existing tools and for system applications, while unsupported parsing errors stay visible rather than being silently treated as plain text. The [document import decision](../../.agents/notes/implemented/feature/2026-08-15-electron-document-import.md) records this ownership boundary and its safety limits.

## Plugin center

Open **Settings → General settings → Desktop → Plugin center**. The official Plugins list counts every non-group Loader entry, while the center groups entries from the same npm package into one explanatory and updatable card. The center displays the Loader-entry total and grouped package total separately, so its first count matches the official list even when one package contributes several entries. It separates feature, system, interface, adapter, and developer/internal packages. Every card answers what the package does, when it runs, what disabling it removes, which broad capabilities it involves, whether its entries are active, where its code came from, how it updates, and which Harness packages it depends on. Package name, version, repository, dependency list, configured entries, enablement, and Fiber phase come from the running Loader and installed `package.json`; Chinese explanations use a curated family catalog with a readable fallback for new package names, so an upstream-added package still appears before the catalog learns a specialized description.

Built-in packages display **Follows Harness** and use the desktop source updater below. The plugin center does not compare their npm versions because the running source commit, rather than independently published package versions, defines the compatible built-in set.

Dependencies installed in the `electron` profile display **External**. Opening the center checks registry-backed dependencies through pnpm; local, linked, URL, and Git specifications remain manual because no registry version can represent their source. An external update runs only for the exact dependency selected by the user, uses a credential-scrubbed subprocess environment, retains the previous profile manifest and lockfile under `~/Library/Application Support/DeepSeek Harness/plugin-backups`, reconciles its bundle-layer membership, and requires an application restart. A failed update restores the retained files and performs an offline frozen install; a rollback failure remains visible instead of treating the update as successful.

The plugin center intentionally does not enable, disable, install, or remove plugins. Those operations change the profile composition and require configuration and permission design beyond a version update; the existing `dsh plugin --profile electron ...` path remains available for manual profile management. The [desktop plugin center decision](../../.agents/notes/implemented/feature/2026-08-14-electron-plugin-center.md) records this ownership split.

## MCP configuration

Open **Settings → General settings → Desktop → MCP configuration**. The editor supports the official MCP client's `stdio` and Streamable HTTP transports. Stdio rows accept a command, one argument per line, environment variables, and an optional working directory; HTTP rows accept a URL and request headers. Each row has a unique `serverName`, and discovered tools use the `mcp__<serverName>__<tool>` namespace.

The configuration is stored as `mcp-servers.json` in the application Harness home with owner-only permissions. Environment variables and headers are stored as entered, so do not put long-lived secrets in a shared account or untrusted machine. Enabling stdio starts the executable outside the Harness sandbox; enabling HTTP sends MCP requests to the supplied address. Electron does not download, audit, or isolate the server for you.

Saving requires an application restart. On boot, Electron converts the file into official `@deepseek-ai/dsh-mcp-client` Loader entries; after a successful connection, the server's tools are available to the Agent. Disabling a row takes effect at the next boot. Connection failures remain visible in Harness diagnostics. The [MCP configuration decision](../../.agents/notes/implemented/feature/2026-08-15-electron-mcp-config.md) records the file and runtime-composition responsibilities.

## Following upstream

Keep the desktop changes on a local branch; no remote push is required. The application imports Harness workspaces and boots the shipped `dsh-base` and `dsh-web-app` bundles instead of copying the Web UI or maintaining a second plugin list. Most upstream feature changes therefore enter the next desktop build without Electron-specific edits.

Open **Settings → General settings → Desktop → Desktop updates**. “Check for updates” reads the official `master` commit without changing the repository that produced the running application. When a new commit exists, “Download and build” performs these operations in the application-owned checkout at `~/Library/Application Support/DeepSeek Harness/updates/source`:

1. Synchronize the official source and overlay the Electron application carried by the current package.
2. Install dependencies, compile Harness, and create a new `.app` and disk image.
3. Launch the staged application and run the packaged compatibility check.

The updater requires network access, `/usr/bin/git`, the repository's supported Node.js version, and pnpm available from the user's Bash or Zsh login shell. The first update downloads a full dependency and build tree, so it can take several minutes and use multiple gigabytes of disk space. Build output and the last 300 log lines remain visible in the panel; a failed build leaves the running application unchanged and can be retried.

After validation, an application running from a writable location offers “Install and restart.” A detached helper waits for the current process to exit, moves the installed application to `~/Library/Application Support/DeepSeek Harness/updates/backup/DeepSeek Harness.app`, replaces it with the staged build, rolls back if replacement fails, and launches the new version. Each successful installation replaces the previous backup. An application running from a disk image under `/Volumes` or another non-writable location offers “Show in Finder” instead; copy the new application to Applications manually.

This source-update design and its trade-offs are recorded in the [managed desktop updates decision](../../.agents/notes/implemented/feature/2026-08-14-electron-managed-source-updates.md). The local working checkout is never fetched, rebased, stashed, cleaned, or used as the managed build directory.

The manual maintenance path remains available for adapting the overlay when an upstream change breaks compatibility:

```sh
git fetch origin
git rebase origin/master
pnpm install
pnpm electron:verify
pnpm electron:dist
```

`electron:verify` rebuilds the repository and `.app`, checks the packaged peer dependency closure, native `node-pty` binary, and update overlay, starts the real packaged executable with a temporary user-data directory, and verifies the client plugin graph, `host.describe`, `session.list`, the Host event stream, all three settings-owned Electron panels, the non-empty package/Loader inventory, the Chinese explanation layer, produced-file preview, selected-record Trajectory learning, the embedded Harness and upstream commits, and clean application shutdown. A failure identifies the layer that needs adapting after an upstream change. `dist/build-info.json` records the desktop version, Harness version, source commit, upstream commit, and build time in every build.

## Current limitations

- Packaging targets macOS arm64 only.
- Builds and source updates are unsigned local artifacts; the updater does not provide code-signing or notarization trust.
- Updates build from source because the official project does not publish this local Electron shell. The first build is slow, and an incompatible upstream change requires a manual overlay update before it can install.
- `asar` is disabled, so the app is larger than an optimized distribution and keeps the plugin/profile files directly inspectable.
- The plugin center updates existing registry-backed profile dependencies only; install/remove and local/Git source updates remain manual profile operations.
- Artifact preview supports bounded Markdown, text, and common raster images; other formats still require a system application.
- Document import stores files locally and supplies paths to the model; it does not yet extract Office/PDF text or perform OCR in the Electron shell.
- MCP configuration only connects tool servers; MCP resources and prompts are not exposed, and server installation, upgrades, authentication, and isolation remain the user's responsibility.
- Imported files are retained under the application Harness home until the user removes them or cleans that directory; the UI does not yet provide an import-history manager.
- The compatibility check is keyless. It covers desktop boot, API transport, plugin loading, event streaming, and teardown, but not a real model turn, approval, or question interaction.
