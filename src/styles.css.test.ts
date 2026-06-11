// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8')

describe('styles.css amber de-hardcoding', () => {
  it('does not hardcode the amber accent inside keyframes/shadows', () => {
    const lines = css.split('\n')
    const canonicalDef = /^\s*--(primary|ring):\s*oklch\(/
    // trailing-zero tolerant (0.82 or 0.820)
    const amberLiteral = /oklch\(\s*0\.820?\s+0\.142\s+81/
    const violations = lines.filter((l) => amberLiteral.test(l) && !canonicalDef.test(l))
    expect(violations).toEqual([])
  })

  it('drives the canvas gradient through a token', () => {
    expect(css).toMatch(/--canvas-gradient/)
    expect(css).toMatch(/background-image:\s*var\(--canvas-gradient\)/)
  })

  it('defines the canvas gradient token inside :root', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('@theme inline'))
    expect(root).toMatch(/--canvas-gradient/)
  })

  it('puts the default theme on :root with color-scheme dark', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('@theme inline'))
    expect(root).toMatch(/color-scheme:\s*dark/)
    expect(root).toMatch(/--primary:\s*oklch\(0\.82 0\.142 81\)/)
    expect(root).toMatch(/--background:\s*oklch\(0\.178/)
  })

  it('no longer defines a .dark theme selector or the dark custom-variant', () => {
    expect(css).not.toMatch(/@custom-variant dark/)
    expect(css).not.toMatch(/\.dark\s*\{/)
  })
})
