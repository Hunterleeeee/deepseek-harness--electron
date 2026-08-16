import { describe, expect, it } from 'vitest'
import { parseOfficialRemoteHead } from '../src/updater-remote.ts'

describe('desktop updater official remote parsing', () => {
  it('reads the default branch and commit from symbolic HEAD output', () => {
    expect(parseOfficialRemoteHead([
      'ref: refs/heads/main\tHEAD',
      '47f943859b1234567890abcdef1234567890abcd\tHEAD',
      '',
    ].join('\n'))).toEqual({
      branch: 'main',
      commit: '47f943859b1234567890abcdef1234567890abcd',
    })
  })

  it('supports default branches with a slash in their name', () => {
    expect(parseOfficialRemoteHead([
      'ref: refs/heads/release/stable HEAD',
      '47f943859b1234567890abcdef1234567890abcd HEAD',
    ].join('\n'))).toMatchObject({ branch: 'release/stable' })
  })

  it('reports a missing symbolic default branch clearly', () => {
    expect(() => parseOfficialRemoteHead(
      '47f943859b1234567890abcdef1234567890abcd\tHEAD\n',
    )).toThrow('官方仓库没有返回默认分支')
  })

  it('reports malformed default-branch commit output', () => {
    expect(() => parseOfficialRemoteHead([
      'ref: refs/heads/main HEAD',
      'not-a-commit HEAD',
    ].join('\n'))).toThrow('官方仓库没有返回 main commit')
  })
})
