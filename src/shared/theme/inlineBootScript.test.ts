// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RADIUS_PRESETS, DENSITY_PRESETS, FONT_PRESETS } from './overrides'
import { THEMES } from './themes'

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
})
