# Agent Note: Electron plugin center and split update ownership

Status: implemented

English | [中文](2026-08-14-electron-plugin-center.zh.md)

## Problem

The Electron application runs more than one hundred Cordis entries, but the upstream inventory page exposes only module names, enablement, and Fiber phases. Those facts diagnose loading and do not explain what a plugin does, when it participates, what disabling it removes, where its code came from, or which update stream owns it. Treating every entry as an independently updatable package would also be incorrect: the built-in packages form one source-commit-compatible Harness distribution, while a profile dependency may have an independent registry lifecycle.

The desktop shell must keep this explanation and update behavior when its managed source updater builds a later upstream commit. A change made only under upstream `packages/` is absent from that managed checkout because the updater overlays `apps/electron` onto the fetched source.

## Decision

The Electron overlay owns one plugin center mounted from the official General settings page instead of a fixed control over task content. The main process reads the active Host Loader, groups non-group entries by package name, resolves their installed `package.json` from the Electron profile, and adds inactive dependencies declared by that profile. The sandboxed preload validates this factual snapshot before the renderer receives it. The renderer displays the non-group Loader-entry total used by the official Plugins list separately from the grouped package-card total, adds Chinese product explanations, and classifies packages as feature, system, interface, adapter, or developer/internal plugins without changing the Loader tree.

The explanation catalog is family-based rather than a closed inventory. Known core packages receive specific copy; role prefixes such as `tool-`, `client-ui-`, `command-`, and `llm-` provide useful timing and disable-impact fallbacks. A newly discovered package therefore remains searchable and understandable enough to inspect even before it gains specialized copy. Capability labels are orientation hints inferred from package roles; the UI states that Harness permission and plugin configuration remain authoritative for actual access.

The center is read-only for composition. It does not enable, disable, install, or remove a plugin. Those actions can alter dependency topology, configuration, permissions, and startup viability, so they remain with the profile management path defined by the [profile plugin bundles decision](../architecture/2026-08-05-profile-plugin-bundles.md).

## Update ownership

Built-in packages have one update owner: the Harness source commit. They display “Follows Harness” and delegate to the [managed desktop source updater](2026-08-14-electron-managed-source-updates.md); the center does not compare their independently published npm versions.

Profile dependencies have an independent update owner. Registry-backed specifications are checked through pnpm and update only after the user selects an exact installed package. Local, linked, URL, workspace, and Git specifications remain manual because a registry latest version cannot describe their source. Successful updates reconcile whether the dependency contributes a `dsh.bundle` layer and require an application restart before the new code runs.

## Update safety

Each external update retains the profile manifest, lockfile when present, and an update record in the application user-data directory before pnpm changes the profile. Subprocesses receive the same credential-name scrubbing and restricted npm user configuration as the desktop source updater. Package names are selected from the current profile dependency snapshot and reach `spawn` as an argument, never through a shell.

An update failure restores the retained manifest and lockfile, then asks pnpm for an offline frozen install so the installed tree again matches them. A rollback failure is a distinct visible error. Application shutdown sends `SIGTERM` to the owned pnpm child and awaits its settlement before clearing plugin-manager subscribers.

## Alternatives considered

**Extend the upstream plugin-inventory packages.** This would reuse the Web settings tab directly, but the managed desktop updater fetches a clean upstream tree and overlays only `apps/electron`; local `packages/` changes would disappear on the first successful desktop update. Carrying package patches in the overlay would create a growing, conflict-prone fork of upstream UI and Remote contracts.

**Hardcode the complete current plugin list.** This could provide polished descriptions immediately, but every upstream-added or renamed package would be absent until the Electron overlay changed. Runtime discovery plus family fallbacks preserves visibility across upstream iterations while allowing focused copy to improve over time.

**Update every package independently.** Built-in package versions are published as parts of one source tree and are not evidence that arbitrary cross-version combinations are compatible. Only profile dependencies have an independent update operation; built-ins move together through the verified Harness build.

**Automatically install third-party updates in the background.** Plugin packages execute code with their declared Harness capabilities, and an update may change composition or configuration requirements. The center checks promptly but requires an explicit package selection and a restart.

## Consequences

Users can understand and search the actual desktop plugin population without reading Cordis configuration or package source, and the same Electron overlay continues to discover upstream additions. Separating Loader-entry and package totals keeps the official inventory count comparable while preserving package-level explanations and updates. Update status states which release stream owns each package instead of presenting one misleading global version comparison. External updates gain retained metadata, rollback, and explicit restart semantics.

The explanation catalog is not a permission audit, and family fallbacks are less precise than curated descriptions. The center also gives up one-click installation and composition mutation. Packaged verification therefore pins factual inventory discovery, a non-empty Loader-entry projection, Chinese explanation rendering, both control panels, API transport, event streaming, and clean teardown; it does not execute a real external package update against a public registry.
