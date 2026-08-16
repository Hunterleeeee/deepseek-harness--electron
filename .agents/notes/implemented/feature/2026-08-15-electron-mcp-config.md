# Agent Note: Electron MCP configuration

Status: implemented

English | [中文](2026-08-15-electron-mcp-config.zh.md)

## Problem

Harness already provides `@deepseek-ai/dsh-mcp-client`, but its native configuration is a Cordis patch layer intended for profile authors. The Electron shell needs a user-facing way to connect trusted local or HTTP MCP servers without asking users to hand-edit loader YAML.

## Decision

Electron stores a validated `mcp-servers.json` beside the Harness home data. The settings editor supports one row per server, `stdio` and Streamable HTTP transports, enablement, command arguments, environment variables, working directories, URLs, and request headers. The file is written atomically with owner-only permissions and is never sent through the renderer or model session APIs.

At boot, the Electron runtime converts enabled rows into official `@deepseek-ai/dsh-mcp-client` Loader entries with stable `electron-mcp-<serverName>` ids. The existing MCP client owns transport lifecycle, tool discovery, namespacing, reconnect behavior, and errors. Saving marks the application restart-required; the running Loader tree is not mutated by the editor.

The UI warns that stdio commands run outside the Harness sandbox and HTTP requests leave the machine. Electron does not install, audit, authenticate, or isolate an MCP server. Resources and prompts remain outside this integration because the current Harness MCP seam exposes tools only.

## Alternatives considered

**Editing `cordis.patch.yml` directly.** This was rejected because it mixes generated UI state with arbitrary user overlays and requires users to understand Cordis patch syntax.

**Reloading the live Loader tree after every save.** This was rejected because a changed command, environment, or transport can spawn or terminate external processes; an explicit restart keeps the activation boundary visible and deterministic.

**Silently importing a global MCP client configuration.** This was rejected because global files can contain unrelated servers, implicit credentials, and commands outside the Electron profile's ownership.

## Consequences

Users can configure the existing MCP client without leaving the desktop app, and the resulting tools retain the upstream `mcp__<serverName>__<tool>` naming contract. The configuration contains cleartext environment variables and headers protected only by local file permissions. Server installation, updates, trust decisions, resources, prompts, and per-server health UI remain outside this first integration.

Focused tests cover atomic round-tripping, enabled-row patch generation, duplicate-name rejection, and HTTP URL validation. Electron typecheck, Main/renderer builds, and focused Vitest tests pass.
