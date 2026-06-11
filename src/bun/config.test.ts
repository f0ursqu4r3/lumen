import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, saveConfig, saveMcpConfig, clearConfig, saveRestoreOnStartup } from './config'

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
    expect(loadConfig()).toEqual({
      gitlabUrl: null,
      token: null,
      mcp: null,
      restoreOnStartup: true,
    })
  })

  it('imports from env on first run when no file exists', () => {
    process.env.GITLAB_URL = 'https://gl.example.com/'
    process.env.GITLAB_TOKEN = 'glpat-abc'
    expect(loadConfig()).toEqual({
      gitlabUrl: 'https://gl.example.com',
      token: 'glpat-abc',
      mcp: null,
      restoreOnStartup: true,
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
      restoreOnStartup: true,
    })
  })

  it('preserves the saved token when only the URL is changed', () => {
    saveConfig({ url: 'https://old.example.com', token: 'glpat-saved' })
    saveConfig({ url: 'https://new.example.com' })
    expect(loadConfig()).toEqual({
      gitlabUrl: 'https://new.example.com',
      token: 'glpat-saved',
      mcp: null,
      restoreOnStartup: true,
    })
  })

  it('clearConfig removes the saved file', () => {
    saveConfig({ url: 'https://x.example.com', token: 't' })
    clearConfig()
    expect(loadConfig()).toEqual({
      gitlabUrl: null,
      token: null,
      mcp: null,
      restoreOnStartup: true,
    })
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

  it('defaults restoreOnStartup to true when absent', () => {
    expect(loadConfig().restoreOnStartup).toBe(true)
  })

  it('persists restoreOnStartup and preserves url/token/mcp', () => {
    saveConfig({ url: 'https://gl.example.com', token: 'glpat-x' })
    saveRestoreOnStartup(false)
    const c = loadConfig()
    expect(c.restoreOnStartup).toBe(false)
    expect(c.gitlabUrl).toBe('https://gl.example.com')
    expect(c.token).toBe('glpat-x')
  })

  it('saveConfig preserves an existing restoreOnStartup=false', () => {
    saveConfig({ url: 'https://gl.example.com', token: 'glpat-x' })
    saveRestoreOnStartup(false)
    saveConfig({ url: 'https://gl2.example.com', token: 'glpat-y' })
    expect(loadConfig().restoreOnStartup).toBe(false)
  })
})
