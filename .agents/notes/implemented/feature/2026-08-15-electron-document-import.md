# Agent Note: Electron local document import

Status: implemented

English | [中文](2026-08-15-electron-document-import.zh.md)

## Problem

The official browser prompt wire accepts raster images only, while desktop users need to give an Agent Word, Excel, PowerPoint, PDF, image, text, code, Markdown, and folder materials. Extending the upstream attachment protocol from the Electron carrier would create a second durable attachment system and would send large files into model context without a bounded read decision.

## Decision

The Electron shell owns a local import affordance beside the official command button. Native file and folder dialogs copy selections into a random directory below the application Harness home. The main process rejects symbolic links, requires regular files, preserves folder-relative paths, and enforces 200 files per selection, 100 MiB per file, and 500 MiB per import.

The renderer keeps imported descriptors as pending cards. Before an official `session.prompt` request crosses IPC, it prepends one text block containing the imported names, types, sizes, and absolute paths. That text uses the existing session prompt path and is therefore logged by the official session runtime. The Agent reads content through existing filesystem or shell tools on demand; the carrier never embeds complete document bytes or invents a new attachment block. Accepted prompts clear the pending cards; removing a card excludes it from later prompts.

The import store does not parse Office/PDF formats or perform OCR. System applications and existing Agent tools remain the readers, and the UI reports a failed import instead of silently treating an unsupported file as text.

## Alternatives considered

**Extending the official attachment protocol.** This was rejected because the current wire and durable attachment service are image-specific; adding binary document blocks would require upstream session schema, persistence, model-content, and client-renderer changes that the Electron shell cannot safely own.

**Embedding extracted document text into every prompt.** This was rejected because extraction and OCR have format-specific dependencies, large-document token costs, and a risk of bypassing the session log's bounded model-visible input discipline.

**Keeping the original user paths.** This was rejected because a later rename or permission change would invalidate the card. Copying into an application-owned random directory gives the Agent a stable read path and keeps partial copies recoverable by deleting one import directory.

## Consequences

The first version supports a uniform local workflow for the requested file types and folders while following the existing session and tool protocols. File contents stay local until the Agent deliberately reads them; the names and paths included in the prompt are still visible to the configured model provider. Imported data remains under the Harness home until the user removes it or cleans that directory. Native Office/PDF rendering, text extraction, OCR, import history, and per-session import garbage collection remain future work.

Focused tests cover folder-relative copying, link rejection, size rejection, prompt reference injection, and accepted-prompt cleanup. Electron typecheck, main/renderer builds, and the focused Vitest suite pass.
