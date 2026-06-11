// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { THEMES, DEFAULT_THEME_ID } from './themes'

const themesCss = readFileSync(fileURLToPath(new URL('../../themes.css', import.meta.url)), 'utf8')
const stylesCss = readFileSync(fileURLToPath(new URL('../../styles.css', import.meta.url)), 'utf8')

const REQUIRED = [
  '--background',
  '--foreground',
  '--card',
  '--popover',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--destructive',
  '--border',
  '--input',
  '--ring',
  '--chart-1',
  '--sidebar',
  '--sidebar-primary',
  '--canvas-gradient',
]

function blockFor(id: string): string {
  const i = Math.max(
    themesCss.indexOf(`[data-theme='${id}']`),
    themesCss.indexOf(`[data-theme="${id}"]`),
  )
  if (i < 0) return ''
  const open = themesCss.indexOf('{', i)
  const close = themesCss.indexOf('}', open)
  return themesCss.slice(open, close)
}

describe('theme registry <-> CSS drift guard', () => {
  it('every non-default theme has a [data-theme] block', () => {
    for (const t of THEMES) {
      if (t.id === DEFAULT_THEME_ID) continue
      expect(blockFor(t.id), `missing block for ${t.id}`).not.toBe('')
    }
  })

  it('every theme block defines all required tokens + color-scheme', () => {
    for (const t of THEMES) {
      if (t.id === DEFAULT_THEME_ID) continue
      const block = blockFor(t.id)
      expect(block, `${t.id} missing color-scheme`).toContain('color-scheme:')
      for (const token of REQUIRED) {
        expect(block, `${t.id} missing ${token}`).toContain(token)
      }
    }
  })

  it('light themes set color-scheme light and disable the canvas gradient', () => {
    for (const t of THEMES) {
      if (t.colorScheme !== 'light') continue
      const block = blockFor(t.id)
      expect(block, `${t.id} should be color-scheme: light`).toMatch(/color-scheme:\s*light/)
      expect(block, `${t.id} should disable canvas gradient`).toMatch(/--canvas-gradient:\s*none/)
    }
  })

  it('the default theme lives in :root, not a data-theme block', () => {
    expect(themesCss).not.toMatch(/\[data-theme=['"]amber['"]\]/)
    expect(stylesCss).toMatch(/:root[\s\S]*--primary:\s*oklch\(0\.69 0\.2 42\)/)
  })

  // Regression guard: themes.css is @imported ABOVE the :root default block, so a
  // bare `[data-theme=…]` selector (specificity 0,1,0, equal to `:root`) loses on
  // source order and the theme never applies. Anchoring to `:root[data-theme=…]`
  // (0,2,0) makes theme blocks outrank the default regardless of import order.
  it('every theme selector is :root[data-theme=…] so it outranks the :root default', () => {
    for (const t of THEMES) {
      if (t.id === DEFAULT_THEME_ID) continue
      expect(themesCss, `${t.id} selector must be :root[data-theme='${t.id}']`).toMatch(
        new RegExp(`:root\\[data-theme=['"]${t.id}['"]\\]`),
      )
    }
    // and no bare (un-anchored) data-theme selector at a line start
    expect(themesCss, 'found a bare [data-theme=…] selector that :root would override').not.toMatch(
      /^\[data-theme=/m,
    )
  })
})
