import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ app: { relaunch: vi.fn(), exit: vi.fn() } }))

import { mcpPatches, readMcpServers, writeMcpServers } from '../src/mcp-config.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('Electron MCP configuration', () => {
  it('round-trips server definitions and only activates enabled rows', async () => {
    const home = await temporaryDirectory('dsh-mcp-home-')
    const servers = [
      { enabled: true, serverName: 'filesystem', transport: 'stdio' as const, command: 'npx', args: ['-y', 'server'], env: { ROOT: '/tmp' } },
      { enabled: false, serverName: 'remote', transport: 'streamable-http' as const, url: 'https://example.test/mcp', headers: { Authorization: 'Bearer x' } },
    ]

    await writeMcpServers(home, servers)
    expect(await readMcpServers(home)).toEqual(servers)
    expect(mcpPatches(servers)).toEqual([{
      insert: [{
        id: 'electron-mcp-filesystem',
        name: '@deepseek-ai/dsh-mcp-client',
        config: {
          serverName: 'filesystem', transport: 'stdio', command: 'npx', args: ['-y', 'server'], env: { ROOT: '/tmp' }, cwd: '',
          toolCallTimeoutMs: 60_000, failOnStartupError: false,
        },
      }],
    }])
    const stored: unknown = JSON.parse(await readFile(join(home, 'mcp-servers.json'), 'utf8'))
    expect(stored).toMatchObject({ version: 1 })
  })

  it('rejects duplicate names and invalid HTTP URLs', async () => {
    const home = await temporaryDirectory('dsh-mcp-invalid-')
    await expect(writeMcpServers(home, [
      { enabled: true, serverName: 'same', transport: 'stdio', command: 'one' },
      { enabled: true, serverName: 'same', transport: 'stdio', command: 'two' },
    ])).rejects.toThrow('重复')
    await expect(writeMcpServers(home, [
      { enabled: true, serverName: 'remote', transport: 'streamable-http', url: 'file:///tmp/mcp' },
    ])).rejects.toThrow('http(s)')
    expect(await readMcpServers(home)).toEqual([])
  })
})

async function temporaryDirectory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(path)
  await mkdir(path, { recursive: true })
  return path
}
