import type { DesktopBootGraph, DesktopBridge } from './protocol.ts'

declare global {
  interface Window {
    readonly dshDesktop: DesktopBridge
    __DSH_BOOT__?: DesktopBootGraph
  }
}

export {}
