import { describe, expect, it } from 'vitest'
import { summarizePluginCounts } from '../src/plugin-counts.ts'
import type { DesktopPluginPackage } from '../src/protocol.ts'

describe('desktop plugin count units', () => {
  it('keeps Loader entries distinct from package-grouped cards', () => {
    const counts = summarizePluginCounts([
      plugin('@deepseek-ai/dsh-one', 'harness', [
        entry('one', 'active'),
        entry('one-client', 'active'),
      ]),
      plugin('@deepseek-ai/dsh-two', 'harness', [entry('two', null)]),
      plugin('@example/external', 'profile', []),
    ])

    expect(counts).toEqual({
      loaderEntries: 3,
      packages: 3,
      runningPackages: 1,
      externalPackages: 1,
    })
  })
})

function plugin(
  packageName: string,
  source: DesktopPluginPackage['source'],
  entries: DesktopPluginPackage['entries'],
): DesktopPluginPackage {
  return {
    packageName,
    version: '1.0.0',
    description: undefined,
    repositoryUrl: undefined,
    source,
    dependencySpec: source === 'profile' ? '^1.0.0' : undefined,
    updateKind: source === 'profile' ? 'registry' : 'harness',
    latestVersion: undefined,
    dependencies: [],
    entries,
  }
}

function entry(
  entryId: string,
  fiberPhase: DesktopPluginPackage['entries'][number]['fiberPhase'],
): DesktopPluginPackage['entries'][number] {
  return {
    entryId,
    moduleName: `@deepseek-ai/dsh-${entryId}`,
    enabled: true,
    fiberPhase,
  }
}
