// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8')

describe('styles.css amber de-hardcoding', () => {
  it('does not hardcode the amber accent inside keyframes/shadows', () => {
    // The default amber may appear ONLY as a token definition (--primary / --ring).
    const body = css
      .split('\n')
      .filter((l) => !l.includes('--primary') && !l.includes('--ring'))
      .join('\n')
    expect(body).not.toMatch(/oklch\(\s*0\.82\s+0\.142\s+81/)
  })

  it('drives the canvas gradient through a token', () => {
    expect(css).toMatch(/--canvas-gradient/)
    expect(css).toMatch(/background-image:\s*var\(--canvas-gradient\)/)
  })
})
