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

  it('defines the canvas gradient token inside .dark', () => {
    const darkBlock = css.match(/\.dark\s*\{[^}]*\}/s)?.[0] ?? ''
    expect(darkBlock).toMatch(/--canvas-gradient/)
  })
})
