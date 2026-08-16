/** Generate the macOS application icon from the official Web whale mark. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const source = readFileSync(join(appDir, '..', 'web', 'public', 'favicon.svg'), 'utf8')
const whaleSource = source.match(/<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/u)?.[1]

if (whaleSource === undefined) {
  throw new Error('Official Web favicon does not contain an SVG root element')
}

const whaleMarkup = whaleSource.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gu, '').trim()
if (!/<path\b/u.test(whaleMarkup)) {
  throw new Error('Official Web favicon does not contain the whale path')
}

const icon = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024" fill="none">
  <rect x="72" y="72" width="880" height="880" rx="200" fill="#fff"/>
  <svg x="176" y="176" width="672" height="672" viewBox="0 0 50 50" fill="none" color="#000">
    ${whaleMarkup}
  </svg>
</svg>
`

const output = join(appDir, 'dist', 'icon.svg')
mkdirSync(join(appDir, 'dist'), { recursive: true })
writeFileSync(output, icon)
