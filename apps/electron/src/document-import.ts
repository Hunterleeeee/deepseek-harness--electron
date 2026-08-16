/** Local document and folder import for the Electron carrier. */

import { randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import type { DesktopImportedDocument } from './protocol.ts'

/** Keep accidental selections from consuming the whole application disk. */
export const MAX_IMPORT_FILES = 200
export const MAX_IMPORT_FILE_BYTES = 100 * 1024 * 1024
export const MAX_IMPORT_TOTAL_BYTES = 500 * 1024 * 1024

type ImportSelection = 'files' | 'folder'

interface SourceFile {
  source: string
  relativePath: string
  size: number
}

interface CollectState {
  count: number
  totalBytes: number
}

/**
 * Copy native-dialog selections into a private, random import directory.
 * Symlinks are rejected rather than followed, and all limits are checked
 * before the first destination file is published.
 * @param dshHome - application-owned Harness home.
 * @param selections - absolute paths returned by Electron's native dialog.
 * @param selection - whether the paths represent files or one folder.
 * @returns one durable descriptor per selected file or folder.
 */
export async function importDocumentSelections(
  dshHome: string,
  selections: readonly string[],
  selection: ImportSelection,
): Promise<DesktopImportedDocument[]> {
  if (selections.length === 0) return []
  const sources: SourceFile[] = []
  const roots: Array<{ source: string; files: SourceFile[] }> = []
  if (selection === 'files') {
    for (const source of selections) {
      const canonical = await regularSource(source, false)
      const file: SourceFile = { source: canonical, relativePath: basename(canonical), size: (await stat(canonical)).size }
      sources.push(file)
      roots.push({ source: canonical, files: [file] })
    }
  } else {
    if (selections.length !== 1) throw new Error('desktop import accepts one folder at a time')
    const source = await regularSource(selections[0] as string, true)
    const files = await collectFiles(source, source, { count: 0, totalBytes: 0 })
    sources.push(...files)
    roots.push({ source, files })
  }
  validateImportLimits(sources)

  const importId = randomUUID()
  const importRoot = join(dshHome, 'imports', importId)
  try {
    await mkdir(importRoot, { recursive: true, mode: 0o700 })
    if (selection === 'folder') {
      const root = roots[0] as { source: string; files: SourceFile[] }
      const targetRoot = join(importRoot, basename(root.source))
      await mkdir(targetRoot, { recursive: true, mode: 0o700 })
      for (const file of root.files) await copyInto(file, targetRoot)
      return [{
        id: importId,
        name: basename(root.source),
        path: targetRoot,
        kind: 'folder',
        size: root.files.reduce((sum, file) => sum + file.size, 0),
        fileCount: root.files.length,
      }]
    }
    const result: DesktopImportedDocument[] = []
    for (const file of sources) {
      const target = await uniqueFileTarget(importRoot, basename(file.source))
      await copyFile(file.source, target)
      result.push({
        id: randomUUID(),
        name: basename(file.source),
        path: target,
        kind: documentKind(file.source),
        size: file.size,
      })
    }
    return result
  } catch (error) {
    await rm(importRoot, { recursive: true, force: true })
    throw error
  }
}

async function regularSource(input: string, directory: boolean): Promise<string> {
  if (typeof input !== 'string' || input.length === 0 || input.includes('\0')) {
    throw new Error('desktop import path is invalid')
  }
  const source = resolve(input)
  const info = await lstat(source)
  if (info.isSymbolicLink()) throw new Error(`desktop import refuses symbolic link: ${source}`)
  if (directory ? !info.isDirectory() : !info.isFile()) {
    throw new Error(`desktop import expected ${directory ? 'a folder' : 'a file'}: ${source}`)
  }
  return source
}

async function collectFiles(root: string, current: string, state: CollectState, depth = 0): Promise<SourceFile[]> {
  if (depth > 32) throw new Error('desktop import folder is deeper than 32 levels')
  const entries = await readdir(current, { withFileTypes: true })
  const files: SourceFile[] = []
  for (const entry of entries) {
    const source = join(current, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`desktop import refuses symbolic link: ${source}`)
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, source, state, depth + 1))
      continue
    }
    if (!entry.isFile()) throw new Error(`desktop import found unsupported directory entry: ${source}`)
    if (state.count >= MAX_IMPORT_FILES) {
      throw new Error(`desktop import accepts at most ${String(MAX_IMPORT_FILES)} files`)
    }
    const size = (await stat(source)).size
    if (size > MAX_IMPORT_FILE_BYTES) {
      throw new Error(`desktop import rejects files larger than ${String(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB`)
    }
    state.count++
    state.totalBytes += size
    if (state.totalBytes > MAX_IMPORT_TOTAL_BYTES) {
      throw new Error(`desktop import accepts at most ${String(MAX_IMPORT_TOTAL_BYTES / (1024 * 1024))} MB per import`)
    }
    files.push({
      source,
      relativePath: relative(root, source),
      size,
    })
  }
  return files
}

function validateImportLimits(files: readonly SourceFile[]): void {
  if (files.length === 0) throw new Error('desktop import folder is empty')
  if (files.length > MAX_IMPORT_FILES) {
    throw new Error(`desktop import accepts at most ${String(MAX_IMPORT_FILES)} files`)
  }
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (files.some(file => file.size > MAX_IMPORT_FILE_BYTES)) {
    throw new Error(`desktop import rejects files larger than ${String(MAX_IMPORT_FILE_BYTES / (1024 * 1024))} MB`)
  }
  if (total > MAX_IMPORT_TOTAL_BYTES) {
    throw new Error(`desktop import accepts at most ${String(MAX_IMPORT_TOTAL_BYTES / (1024 * 1024))} MB per import`)
  }
}

async function copyInto(file: SourceFile, targetRoot: string): Promise<void> {
  const target = resolve(targetRoot, file.relativePath)
  const rel = relative(targetRoot, target)
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(targetRoot, rel) !== target) {
    throw new Error('desktop import rejected a path outside its destination')
  }
  await mkdir(join(target, '..'), { recursive: true, mode: 0o700 })
  await copyFile(file.source, target)
}

async function uniqueFileTarget(root: string, name: string): Promise<string> {
  const first = join(root, name)
  try {
    await lstat(first)
  } catch {
    return first
  }
  const extension = extname(name)
  const stem = extension === '' ? name : name.slice(0, -extension.length)
  for (let index = 2; index < MAX_IMPORT_FILES + 2; index++) {
    const candidate = join(root, `${stem}-${String(index)}${extension}`)
    try {
      await lstat(candidate)
    } catch {
      return candidate
    }
  }
  throw new Error('desktop import could not allocate a unique destination name')
}

function documentKind(path: string): DesktopImportedDocument['kind'] {
  const extension = extname(path).toLocaleLowerCase()
  if (extension === '.pdf') return 'pdf'
  if (['.doc', '.docx', '.docm', '.odt', '.rtf'].includes(extension)) return 'word'
  if (['.xls', '.xlsx', '.xlsm', '.ods', '.csv'].includes(extension)) return 'excel'
  if (['.ppt', '.pptx', '.pptm', '.odp'].includes(extension)) return 'powerpoint'
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.heic'].includes(extension)) return 'image'
  if (['.md', '.markdown', '.mdown'].includes(extension)) return 'markdown'
  if (['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.css', '.html', '.json', '.yaml', '.yml', '.sql', '.sh', '.bash', '.zsh'].includes(extension)) return 'code'
  if (['.txt', '.log', '.ini', '.conf', '.toml', '.xml'].includes(extension)) return 'text'
  return 'other'
}
