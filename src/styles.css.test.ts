// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8')

describe('styles.css chassis tokens', () => {
  it('does not hardcode the orange accent inside keyframes/shadows', () => {
    const lines = css.split('\n')
    const canonicalDef = /^\s*--(primary|ring):\s*oklch\(/
    // trailing-zero tolerant (0.69/0.690, 0.2/0.20)
    const orangeLiteral = /oklch\(\s*0\.690?\s+0\.20?\s+42/
    const violations = lines.filter((l) => orangeLiteral.test(l) && !canonicalDef.test(l))
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

  it('puts the chassis default theme on :root with color-scheme dark', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('@theme inline'))
    expect(root).toMatch(/color-scheme:\s*dark/)
    expect(root).toMatch(/--primary:\s*oklch\(0\.69 0\.2 42\)/)
    expect(root).toMatch(/--background:\s*oklch\(0\.195/)
    expect(root).toMatch(/--radius:\s*0\.25rem/)
    expect(root).toMatch(/--border:\s*oklch\(0\.33/)
  })

  it('defines the terminal idiom block', () => {
    expect(css).toMatch(/:root\[data-idiom='terminal'\]/)
  })

  it('no longer defines a .dark theme selector or the dark custom-variant', () => {
    expect(css).not.toMatch(/@custom-variant dark/)
    expect(css).not.toMatch(/\.dark\s*\{/)
  })

  it('routes shadow utilities through themable elevation vars', () => {
    const theme = css.slice(css.indexOf('@theme inline'))
    for (const t of ['card', 'pop', 'float', 'key', 'key-hover']) {
      expect(theme).toMatch(new RegExp(`--shadow-${t}:\\s*var\\(--elev-${t}\\)`))
    }
    const root = css.slice(css.indexOf(':root'), css.indexOf('@theme inline'))
    expect(root).toMatch(/--elev-card:/)
  })
})
