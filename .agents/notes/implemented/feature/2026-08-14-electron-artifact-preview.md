# Agent Note: Electron in-application artifact preview

Status: implemented

English | [中文](2026-08-14-electron-artifact-preview.zh.md)

## Problem

The official produced-files interaction sends a resolved path to `host.openPath`, which hands the file to a system application. A desktop user who reads Agent-created Markdown, text, or images alongside the task needs a fast inspection path that does not replace the official open operation for unrelated paths or execute generated content.

## Decision

The Electron renderer records a short-lived preview intent only when the user clicks an official produced-file control or inline file reference. The next matching `host.openPath` request opens a right-side preview and receives the same successful Host response expected by the official client. Requests without that user interaction retain the normal system-open transport.

The main process requires an absolute file path, resolves symlinks, accepts regular files only, and returns a renderer-safe presentation. Markdown and common text formats are decoded as UTF-8 up to 2 MiB. PNG, JPEG, GIF, and WebP images become data URLs up to 12 MiB. Unsupported or larger files return metadata without content. SVG remains text instead of active image markup.

The renderer uses the existing Markdown component for rendered Markdown and offers a source view. The drawer also exposes copy-path, Finder reveal, and system-open actions. Escape and the close button dismiss it, then focus returns to the control that initiated the preview.

## Alternatives considered

**Replace every `host.openPath` call with preview.** Rejected because `host.openPath` also serves deliberate system-open actions outside produced files. The short-lived click intent limits the behavior change to the artifact affordances the user selected.

**Render every file type in Electron.** Rejected because office documents, archives, media, and executable formats require parsers with larger dependency and security costs. Unsupported files keep the system-open path.

**Load files in the renderer through direct filesystem access.** Rejected because the sandboxed renderer does not receive Node.js or `ipcRenderer`. The main process owns bounded reads, and preload exposes only typed artifact operations.

## Consequences

Users can inspect common Agent outputs without leaving the task, compare Markdown rendering with its source, and still open any artifact in its native application. Generated content is never executed by the preview path, and bounded reads prevent large files from being copied into renderer memory.

The supported-format list and byte limits are deliberately finite. A produced-file preview still reads the selected local file into the renderer, so the application treats this UI as a local trusted-user action rather than a remote sharing mechanism. Focused tests cover decoding limits, unsupported files, interception scope, drawer rendering, and cleanup; packaged verification repeats a produced-file open against the built application.
