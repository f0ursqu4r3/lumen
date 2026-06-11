import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  loadSession,
  sessionSnapshot,
  saveSessionNow,
  initMain,
  setMainSize,
  setMainPosition,
  setMainRoute,
  registerPopout,
  setPopoutSize,
  setPopoutPosition,
  removePopout,
  clearPopouts,
  __resetSessionForTest,
} from './session'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lumen-sess-'))
  process.env.LUMEN_CONFIG_DIR = dir
  __resetSessionForTest()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.LUMEN_CONFIG_DIR
})

describe('session', () => {
  it('starts empty when no file exists', () => {
    expect(loadSession()).toEqual({
      main: { frame: null, route: null, view: null },
      popouts: [],
    })
  })

  it('round-trips the main window frame and route', () => {
    initMain({ x: 10, y: 20, width: 800, height: 600 }, '/issues', 'issues')
    saveSessionNow()
    __resetSessionForTest()
    expect(loadSession().main).toEqual({
      frame: { x: 10, y: 20, width: 800, height: 600 },
      route: '/issues',
      view: 'issues',
    })
  })

  it('merges main move (x/y) and resize (x/y/w/h)', () => {
    initMain({ x: 0, y: 0, width: 800, height: 600 }, null, null)
    setMainPosition(50, 60)
    expect(sessionSnapshot().main.frame).toEqual({ x: 50, y: 60, width: 800, height: 600 })
    setMainSize(70, 80, 900, 700)
    expect(sessionSnapshot().main.frame).toEqual({ x: 70, y: 80, width: 900, height: 700 })
  })

  it('setMainPosition is a no-op before initMain seeds a frame', () => {
    setMainPosition(50, 60)
    expect(sessionSnapshot().main.frame).toBeNull()
  })

  it('upserts, updates, and removes popouts by id', () => {
    registerPopout({
      id: 'a/b#3',
      kind: 'issue',
      fullPath: 'a/b',
      iid: '3',
      frame: { x: 1, y: 2, width: 720, height: 900 },
    })
    registerPopout({
      id: 'issues:1',
      kind: 'issues',
      fullPath: 'a/b',
      iids: ['3', '4'],
      frame: { x: 5, y: 6, width: 760, height: 920 },
    })
    setPopoutPosition('a/b#3', 11, 12)
    setPopoutSize('issues:1', 7, 8, 765, 925)
    const popouts = sessionSnapshot().popouts
    expect(popouts).toHaveLength(2)
    expect(popouts.find((p) => p.id === 'a/b#3')!.frame).toEqual({
      x: 11,
      y: 12,
      width: 720,
      height: 900,
    })
    expect(popouts.find((p) => p.id === 'issues:1')!.frame).toEqual({
      x: 7,
      y: 8,
      width: 765,
      height: 925,
    })
    removePopout('a/b#3')
    expect(sessionSnapshot().popouts.map((p) => p.id)).toEqual(['issues:1'])
  })

  it('re-registering the same id replaces rather than duplicates', () => {
    registerPopout({
      id: 'a/b#3',
      kind: 'issue',
      fullPath: 'a/b',
      iid: '3',
      frame: { x: 1, y: 2, width: 720, height: 900 },
    })
    registerPopout({
      id: 'a/b#3',
      kind: 'issue',
      fullPath: 'a/b',
      iid: '3',
      frame: { x: 9, y: 9, width: 720, height: 900 },
    })
    expect(sessionSnapshot().popouts).toHaveLength(1)
    expect(sessionSnapshot().popouts[0].frame.x).toBe(9)
  })

  it('updates main route via setMainRoute', () => {
    initMain({ x: 0, y: 0, width: 800, height: 600 }, null, null)
    setMainRoute('/projects/a/b/issues', 'issues')
    expect(sessionSnapshot().main).toMatchObject({ route: '/projects/a/b/issues', view: 'issues' })
  })

  it('clearPopouts empties the popout list but keeps main', () => {
    initMain({ x: 0, y: 0, width: 800, height: 600 }, '/issues', 'issues')
    registerPopout({
      id: 'a/b#3',
      kind: 'issue',
      fullPath: 'a/b',
      iid: '3',
      frame: { x: 1, y: 2, width: 720, height: 900 },
    })
    clearPopouts()
    const snap = sessionSnapshot()
    expect(snap.popouts).toEqual([])
    expect(snap.main.route).toBe('/issues')
  })

  it('falls back to empty on a corrupt file', () => {
    initMain({ x: 1, y: 1, width: 1, height: 1 }, null, null)
    saveSessionNow()
    writeFileSync(join(dir, 'session.json'), '{ not json')
    __resetSessionForTest()
    expect(loadSession()).toEqual({ main: { frame: null, route: null, view: null }, popouts: [] })
  })

  it('saveSessionNow writes session.json into the config dir', () => {
    initMain({ x: 3, y: 4, width: 5, height: 6 }, null, null)
    saveSessionNow()
    expect(existsSync(join(dir, 'session.json'))).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')).main.frame).toEqual({
      x: 3,
      y: 4,
      width: 5,
      height: 6,
    })
  })
})
