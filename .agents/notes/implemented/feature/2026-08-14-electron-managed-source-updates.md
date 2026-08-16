# Agent Note: Managed source updates for the Electron desktop application

Status: implemented

English | [中文](2026-08-14-electron-managed-source-updates.zh.md)

## Problem

The local Electron application must follow changes on the official `master` branch without requiring its user to operate a Web application or CLI. The official project does not publish this Electron application or a compatible update feed, so a conventional binary updater has no artifact to install. Rebasing, stashing, cleaning, or building in the user's working checkout would risk uncommitted work and make update success depend on an unrelated branch state.

## Decision

The packaged application exposes an Electron-owned update panel from the official General settings page instead of placing a fixed control over task content. The panel compares its embedded upstream commit with `https://github.com/deepseek-ai/deepseek-harness.git` by `git ls-remote`. An update uses only the application-managed checkout under `~/Library/Application Support/DeepSeek Harness/updates/source`; it never runs Git or build mutations in the checkout that produced the installed application.

Each desktop package carries its `apps/electron` source as an update overlay. The updater checks out the selected official commit in detached state, replaces that checkout's `apps/electron` directory with the packaged overlay, adds the Electron dependency build permissions to the checkout's pnpm configuration, installs dependencies, compiles Harness, and builds the macOS application and disk image. A marker file and the exact official remote identify the only existing directory the updater may reuse.

The user's Bash or Zsh login shell resolves the pnpm executable before any official source runs. Git, pnpm, build, validation, and replacement subprocesses receive an environment with credential-named variables removed; official build output therefore cannot print Harness credentials inherited by the Electron process.

The staged application must pass the packaged compatibility check before the panel enables installation. The check launches the real staged executable and verifies its dependency closure, native PTY binary, client plugin graph, Host API and event stream, update control, embedded commits, and clean shutdown. A build or validation failure leaves the running application and its data unchanged and exposes bounded, copyable logs for diagnosis and retry.

Installation is available only when the running `.app` has a writable parent directory and is not under `/Volumes`. A detached helper waits for the main process to finish, removes the previous updater-owned backup, renames the current application into the backup location, renames the staged application into place, rolls back a failed replacement, and opens the installed version. Read-only and disk-image launches reveal the verified artifact for manual copying instead of attempting privilege escalation.

## Alternatives considered

**Use `electron-updater` with a release feed.** The official repository does not publish this local shell, signed desktop artifacts, or update metadata. A binary updater would require an independently operated release channel and would not follow upstream source directly.

**Fetch and rebase the user's local branch.** That approach can conflict with local changes, requires a clean or stashed checkout, and grants the application ownership of developer work that it did not create.

**Install a newly built application without launching it.** Compilation and packaging do not prove that the official client plugin graph, IPC carrier, native dependencies, and persisted runtime still boot together. Installation therefore remains unavailable until the staged executable passes the compatibility check.

**Elevate privileges for `/Applications` or install from a mounted disk image.** The local unsigned application does not request administrator authority. It performs an in-place replacement only where the current user already has write permission and otherwise exposes the artifact for a deliberate manual install.

## Consequences

Upstream Harness changes can enter the desktop application through one visible workflow while the user's checkout and Harness home remain untouched. Verification precedes replacement, and the prior installed application remains available as one updater-owned backup.

The application assumes a local Apple Silicon macOS toolchain with Git, a supported Node.js version, pnpm, network access, and enough disk space for a source tree, dependencies, build output, an application, and a disk image. The first update is slow and consumes multiple gigabytes. An upstream change that breaks the packaged Electron overlay fails visibly and requires a manually rebuilt overlay; the installed updater cannot update its own overlay independently. Source builds and replacements remain unsigned local artifacts, and only the most recent successful backup is retained.
