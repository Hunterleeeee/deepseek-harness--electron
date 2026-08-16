# Agent Note: Electron Trajectory language presentation layer

Status: implemented

English | [中文](2026-08-14-electron-trajectory-localization.zh.md)

## Problem

The official Trajectory plugin registers a Chinese tab and a few toolbar labels, but most of its ledger, timeline, inspector, status, and accessibility copy remains hardcoded English. The local Electron application needs a readable Chinese view and a Trajectory-only language choice without forking the upstream plugin package, changing the application locale, or translating tool names, model names, JSON payloads, and diagnostic text that users need verbatim for debugging.

## Decision

The Electron renderer installs a presentation-only observer after `AppWebEntry` settles. It inserts a **中文 / English** selector inside Trajectory's explicit `data-conversation-composer-overlay` root. The first selection follows the toolbar's application locale; a subsequent choice persists in renderer-local storage and remains independent of the application locale. English mode restores Electron-translated values and normalizes the few labels supplied in Chinese by the official dictionary.

The translator owns an exact interface vocabulary plus bounded patterns for Turn, Step, Request, compaction, block, and collapsed-summary labels. It translates text and interface attributes such as `aria-label`, `title`, `placeholder`, and `data-label`. It skips `pre`, `code`, editable content, and JSON trees, so raw payloads, tool output, model identifiers, and error bodies remain unchanged. Original values are retained per DOM node and restored when the application switches to English.

The presentation source lives under `apps/electron`, which is already copied into every managed source-update overlay. Newly introduced upstream labels remain visible in English until the Electron vocabulary learns them; missing copy never hides an event or blocks interaction.

## Alternatives considered

**Modify the upstream `ui-trajectory` package locally.** Rejected because the managed updater replaces the Harness source tree on every official update. Carrying a package fork or an exact source patch would create recurring conflicts and would change the official Web composition outside the requested Electron application.

**Rewrite the compiled Trajectory client bundle.** Rejected because the same string literals also participate in English dictionaries and internal display sentinels. A bundle-format-dependent rewrite could change behavior or remove the real English locale.

**Translate all English text under the renderer.** Rejected because assistant content, tool output, model names, JSON, and searchable errors must remain exact. The explicit Trajectory root and raw-content exclusions keep the operation presentation-only.

**Use only the application-wide language setting.** Rejected because Trajectory is a technical learning view whose language may need to differ from the surrounding application. The local selector changes only Trajectory presentation copy.

## Consequences

Electron users can switch Trajectory between Chinese and English without changing the surrounding application, while the original machine data remains intact. The selection survives application restarts, switching remains reversible, and the upstream client package remains untouched, so the managed updater continues to follow official source changes.

The observer depends on Trajectory's explicit root marker and known visible phrases. An upstream rename produces a mixed-language label rather than corrupting data or preventing startup. Focused tests pin static and dynamic labels plus language isolation, and packaged verification mounts a synthetic Trajectory root to prove that the shipped control switches both text and accessibility attributes without changing the application locale. The separate [evidence-based learning mode](2026-08-14-electron-trajectory-learning.md) consumes the same bounded root without changing this language ownership.
