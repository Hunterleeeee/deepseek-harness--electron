import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vite'
import webConfig from '../web/vite.config.ts'

/** Reuse the official Web shell build while giving Electron its own entry and relative assets. */
export default mergeConfig(webConfig, defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
}))
