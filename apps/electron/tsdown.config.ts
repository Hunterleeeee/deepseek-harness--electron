import { defineConfig } from 'tsdown'

/** Build the Electron main process as ESM and the sandboxed preload as CJS. */
export default defineConfig([
  {
    entry: { main: 'src/main.ts', 'update-helper': 'src/update-helper.ts' },
    outDir: 'dist/main',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    deps: { neverBundle: ['electron'] },
    fixedExtension: false,
    dts: false,
    clean: true,
  },
  {
    entry: { preload: 'src/preload.ts' },
    outDir: 'dist/preload',
    format: ['cjs'],
    platform: 'node',
    target: 'es2024',
    deps: { neverBundle: ['electron'] },
    fixedExtension: false,
    dts: false,
    clean: true,
  },
])
