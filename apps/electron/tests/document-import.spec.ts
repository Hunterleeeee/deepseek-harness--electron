import { afterEach, describe, expect, it } from 'vitest'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  MAX_IMPORT_FILE_BYTES,
  importDocumentSelections,
} from '../src/document-import.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('desktop document import', () => {
  it('copies files and preserves folder-relative paths without following links', async () => {
    const root = await temporaryDirectory('dsh-document-source-')
    const home = await temporaryDirectory('dsh-document-home-')
    await mkdir(join(root, 'nested'), { recursive: true })
    await writeFile(join(root, 'nested', 'notes.md'), '# notes')

    const [folder] = await importDocumentSelections(home, [root], 'folder')

    expect(folder).toMatchObject({ kind: 'folder', name: root.split('/').pop(), fileCount: 1 })
    expect(await readFile(join(folder?.path ?? '', 'nested', 'notes.md'), 'utf8')).toBe('# notes')
    expect((await lstat(folder?.path ?? '')).isDirectory()).toBe(true)

    const link = join(root, 'link.md')
    await symlink(join(root, 'nested', 'notes.md'), link)
    await expect(importDocumentSelections(home, [root], 'folder')).rejects.toThrow('symbolic link')
  })

  it('rejects an individual file over the safety limit before creating an import', async () => {
    const root = await temporaryDirectory('dsh-document-large-')
    const home = await temporaryDirectory('dsh-document-home-')
    const file = join(root, 'large.pdf')
    await writeFile(file, Buffer.alloc(MAX_IMPORT_FILE_BYTES + 1))

    await expect(importDocumentSelections(home, [file], 'files')).rejects.toThrow('larger than')
  })
})

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}
