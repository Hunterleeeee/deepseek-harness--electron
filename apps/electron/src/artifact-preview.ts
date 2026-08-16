/** Bounded, non-executable file decoding for the Electron artifact preview. */

import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute } from 'node:path'
import type { DesktopArtifactPreview } from './protocol.ts'

const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set(['.md', '.markdown', '.mdown'])
const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  '', '.bash', '.c', '.cc', '.conf', '.cpp', '.css', '.csv', '.env', '.go', '.h', '.hpp', '.html',
  '.ini', '.java', '.js', '.json', '.jsx', '.log', '.mjs', '.py', '.rs', '.scss', '.sh', '.sql',
  '.svg', '.toml', '.ts', '.tsv', '.tsx', '.txt', '.xml', '.yaml', '.yml', '.zsh',
])
const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/**
 * Read one absolute file path for renderer presentation without executing its contents.
 * @param input - Host-resolved absolute path supplied by the official open-file flow.
 * @returns Bounded text, a bounded image data URL, or metadata for an unsupported/oversized file.
 */
export async function readArtifactPreview(input: string): Promise<DesktopArtifactPreview> {
  if (!isAbsolute(input) || input.includes('\0')) {
    throw new Error('artifact preview requires an absolute file path')
  }
  const path = await realpath(input)
  const metadata = await stat(path)
  if (!metadata.isFile()) throw new Error('artifact preview supports files only')

  const extension = extname(path).toLocaleLowerCase()
  const base = {
    path,
    name: basename(path),
    size: metadata.size,
  }
  const imageMimeType = IMAGE_MIME_TYPES[extension]
  if (imageMimeType !== undefined) {
    if (metadata.size > MAX_IMAGE_BYTES) {
      return {
        ...base,
        kind: 'image',
        mimeType: imageMimeType,
        content: undefined,
        dataUrl: undefined,
        tooLarge: true,
      }
    }
    const bytes = await readFile(path)
    return {
      ...base,
      kind: 'image',
      mimeType: imageMimeType,
      content: undefined,
      dataUrl: `data:${imageMimeType};base64,${bytes.toString('base64')}`,
      tooLarge: false,
    }
  }

  const kind = MARKDOWN_EXTENSIONS.has(extension)
    ? 'markdown'
    : TEXT_EXTENSIONS.has(extension) ? 'text' : 'unsupported'
  if (kind === 'unsupported') {
    return {
      ...base,
      kind,
      mimeType: undefined,
      content: undefined,
      dataUrl: undefined,
      tooLarge: false,
    }
  }
  if (metadata.size > MAX_TEXT_BYTES) {
    return {
      ...base,
      kind,
      mimeType: kind === 'markdown' ? 'text/markdown' : 'text/plain',
      content: undefined,
      dataUrl: undefined,
      tooLarge: true,
    }
  }
  return {
    ...base,
    kind,
    mimeType: kind === 'markdown' ? 'text/markdown' : 'text/plain',
    content: await readFile(path, 'utf8'),
    dataUrl: undefined,
    tooLarge: false,
  }
}
