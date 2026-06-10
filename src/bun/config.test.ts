import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, saveConfig, saveMcpConfig, clearConfig } from './config'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lumen-cfg-'))
  process.env.LUMEN_CONFIG_DIR = dir
  delete process.env.GITLAB_URL
  delete process.env.GITLAB_TOKEN
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.LUMEN_CONFIG_DIR
})

describe('config', () => {
  it('reports unconfigured when no file and no env', () => {
    expect(loadConfig()).toEqual({ gitlabUrl: null, token: null, mcp: null })
  })

  it('imports from env on first run when no file exists', () => {
    process.env.GITLAB_URL = 'https://gl.example.com/'
    process.env.GITLAB_TOKEN = 'glpat-abc'
    expect(loadConfig()).toEqual({
      gitlabUrl: 'https://gl.example.com',
      token: 'glpat-abc',
      mcp: null,
    })
  })

  it('round-trips saved config and prefers file over env', () => {
    process.env.GITLAB_URL = 'https://env.example.com'
    process.env.GITLAB_TOKEN = 'glpat-env'
    saveConfig({ url: 'https://saved.example.com/', token: 'glpat-saved' })
    expect(loadConfig()).toEqual({
      gitlabUrl: 'https://saved.example.com',
      token: 'glpat-saved',
      mcp: null,
    })
  })

  it('preserves the saved token when only the URL is changed', () => {
    saveConfig({ url: 'https://old.example.com', token: 'glpat-saved' })
    saveConfig({ url: 'https://new.example.com' })
    expect(loadConfig()).toEqual({
      gitlabUrl: 'https://new.example.com',
      token: 'glpat-saved',
      mcp: null,
    })
  })

  it('clearConfig removes the saved file', () => {
    saveConfig({ url: 'https://x.example.com', token: 't' })
    clearConfig()
    expect(loadConfig()).toEqual({ gitlabUrl: null, token: null, mcp: null })
  })

  it('defaults mcp to null when absent', () => {
    expect(loadConfig().mcp).toBeNull()
  })

  it('saveMcpConfig persists mcp and preserves the gitlab token', () => {
    saveConfig({ url: 'https://gl.example.com', token: 'glpat-abc' })
    saveMcpConfig({ enabled: true, port: 7437, token: 'lmcp_xyz' })
    const cfg = loadConfig()
    expect(cfg.mcp).toEqual({ enabled: true, port: 7437, token: 'lmcp_xyz' })
    expect(cfg.token).toBe('glpat-abc')
  })

  it('saveConfig preserves an existing mcp block', () => {
    saveMcpConfig({ enabled: true, port: 7437, token: 'lmcp_xyz' })
    saveConfig({ url: 'https://gl.example.com', token: 'glpat-abc' })
    expect(loadConfig().mcp).toEqual({ enabled: true, port: 7437, token: 'lmcp_xyz' })
  })
})
