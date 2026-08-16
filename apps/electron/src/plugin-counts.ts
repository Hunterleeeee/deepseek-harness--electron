/** Count desktop plugins without conflating Loader entries with npm packages. */

import type { DesktopPluginPackage } from './protocol.ts'

/** Explicit count units shown by the desktop plugin center. */
export interface DesktopPluginCounts {
  loaderEntries: number
  packages: number
  runningPackages: number
  externalPackages: number
}

/**
 * Summarize one package-grouped inventory while retaining the official Loader-entry total.
 * @param plugins - package cards and their configured Loader entries.
 * @returns Counts whose names identify whether they measure entries or packages.
 */
export function summarizePluginCounts(plugins: readonly DesktopPluginPackage[]): DesktopPluginCounts {
  return {
    loaderEntries: plugins.reduce((total, plugin) => total + plugin.entries.length, 0),
    packages: plugins.length,
    runningPackages: plugins.filter(plugin => (
      plugin.entries.some(entry => entry.enabled && entry.fiberPhase === 'active')
    )).length,
    externalPackages: plugins.filter(plugin => plugin.source === 'profile').length,
  }
}
