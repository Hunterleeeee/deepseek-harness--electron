/** Official repository metadata used by the desktop source updater. */

/** The upstream repository that supplies Harness source updates. */
export const OFFICIAL_REPOSITORY = 'https://github.com/deepseek-ai/deepseek-harness.git'

/** A repository's symbolic HEAD and the commit it currently names. */
export interface OfficialRemoteHead {
  branch: string
  commit: string
}

/**
 * Parse the output of `git ls-remote --symref <repository> HEAD`.
 * @param output - stdout emitted by Git.
 * @returns the upstream default branch and its commit.
 */
export function parseOfficialRemoteHead(output: string): OfficialRemoteHead {
  const branch = /^ref:\s+refs\/heads\/([^\s]+)\s+HEAD$/mu.exec(output)?.[1]
  if (branch === undefined) {
    throw new Error('官方仓库没有返回默认分支')
  }
  const commit = /^([0-9a-f]{40})\s+HEAD$/mu.exec(output)?.[1]
  if (commit === undefined) {
    throw new Error(`官方仓库没有返回 ${branch} commit`)
  }
  return { branch, commit }
}
