// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RADIUS_PRESETS, DENSITY_PRESETS, FONT_PRESETS } from './overrides'
import { THEMES, DEFAULT_THEME_ID, themeById } from './themes'

const html = readFileSync(fileURLToPath(new URL('../../../index.html', import.meta.url)), 'utf8')

// Grab `var <name> = { ... }` from the anti-flash IIFE and eval the object
// literal. The values contain no nested braces, so a non-greedy match to the
// first `}` captures the whole literal.
function objLiteral(varName: string): Record<string, unknown> {
  const m = html.match(new RegExp(`var ${varName}\\s*=\\s*(\\{[\\s\\S]*?\\})`))
  if (!m) throw new Error(`inline ${varName} not found in index.html`)
  // eslint-disable-next-line no-eval
  return eval(`(${m[1]})`) as Record<string, unknown>
}

describe('index.html inline boot script stays in sync with source', () => {
  it('RAD matches RADIUS_PRESETS', () => {
    expect(objLiteral('RAD')).toEqual({ ...RADIUS_PRESETS })
  })

  it('DEN matches DENSITY_PRESETS', () => {
    expect(objLiteral('DEN')).toEqual({ ...DENSITY_PRESETS })
  })

  it('FONT matches FONT_PRESETS', () => {
    expect(objLiteral('FONT')).toEqual({ ...FONT_PRESETS })
  })

  it('LIGHT id set matches the light themes in the registry', () => {
    const light = THEMES.filter((t) => t.colorScheme === 'light')
      .map((t) => t.id)
      .sort()
    const inlineLight = Object.keys(objLiteral('LIGHT')).sort()
    expect(inlineLight).toEqual(light)
  })

  it('TERMINAL id set matches the idiom-carrying themes in the registry', () => {
    const terminal = THEMES.filter((t) => t.idiom)
      .map((t) => t.id)
      .sort()
    const inlineTerminal = Object.keys(objLiteral('TERMINAL')).sort()
    expect(inlineTerminal).toEqual(terminal)
  })

  it('inline DEFAULT matches DEFAULT_THEME_ID', () => {
    const m = html.match(/var DEFAULT\s*=\s*'([^']+)'/)
    if (!m) throw new Error('inline DEFAULT not found in index.html')
    expect(m[1]).toBe(DEFAULT_THEME_ID)
  })

  it('flash-guard background matches the default theme swatch bg', () => {
    const m = html.match(/html\s*\{\s*background:\s*([^;]+);/)
    if (!m) throw new Error('flash-guard background not found in index.html')
    expect(m[1].trim()).toBe(themeById(DEFAULT_THEME_ID)!.swatch.bg)
  })
})
