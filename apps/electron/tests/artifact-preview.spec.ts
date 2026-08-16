import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, realpath, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readArtifactPreview } from '../src/artifact-preview.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('desktop artifact preview', () => {
  it('returns Markdown as bounded renderer-safe text', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'report.md')
    await writeFile(path, '# Report\n\n<script>alert(1)</script>\n', 'utf8')

    const preview = await readArtifactPreview(path)

    expect(preview).toMatchObject({
      path: await realpath(path),
      name: 'report.md',
      kind: 'markdown',
      mimeType: 'text/markdown',
      tooLarge: false,
    })
    expect(preview.content).toContain('<script>alert(1)</script>')
    expect(preview.dataUrl).toBeUndefined()
  })

  it('encodes supported images without exposing a file URL', async () => {
    const directory = await temporaryDirectory()
    const path = join(directory, 'pixel.png')
    await writeFile(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const preview = await readArtifactPreview(path)

    expect(preview.kind).toBe('image')
    expect(preview.dataUrl).toBe('data:image/png;base64,iVBORw==')
  })

  it('reports unsupported and oversized files without reading their contents', async () => {
    const directory = await temporaryDirectory()
    const archive = join(directory, 'bundle.zip')
    const largeMarkdown = join(directory, 'large.md')
    await writeFile(archive, 'zip')
    await writeFile(largeMarkdown, '')
    await truncate(largeMarkdown, 2 * 1024 * 1024 + 1)

    await expect(readArtifactPreview(archive)).resolves.toMatchObject({
      kind: 'unsupported', content: undefined, dataUrl: undefined, tooLarge: false,
    })
    await expect(readArtifactPreview(largeMarkdown)).resolves.toMatchObject({
      kind: 'markdown', content: undefined, dataUrl: undefined, tooLarge: true,
    })
  })

  it('rejects relative paths and directories', async () => {
    const directory = await temporaryDirectory()
    await expect(readArtifactPreview('report.md')).rejects.toThrow('absolute file path')
    await expect(readArtifactPreview(directory)).rejects.toThrow('files only')
  })
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-artifact-preview-'))
  temporaryDirectories.push(directory)
  return directory
}
