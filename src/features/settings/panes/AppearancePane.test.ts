import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const setTheme = vi.fn().mockResolvedValue(undefined)
const setOverride = vi.fn().mockResolvedValue(undefined)
const reset = vi.fn().mockResolvedValue(undefined)
const themeId = { value: 'amber' }
const overrides = { value: {} as Record<string, unknown> }
vi.mock('@/shared/theme/useTheme', () => ({
  useTheme: () => ({ themeId, overrides, setTheme, setOverride, reset }),
}))

import AppearancePane from './AppearancePane.vue'

beforeEach(() => {
  vi.clearAllMocks()
  themeId.value = 'amber'
  overrides.value = {}
})

describe('AppearancePane', () => {
  it('renders all 16 themes grouped', () => {
    const w = mount(AppearancePane)
    expect(w.findAll('[data-test="theme-card"]')).toHaveLength(16)
    expect(w.text()).toContain('Dark')
    expect(w.text()).toContain('Light')
    expect(w.text()).toContain('Bold')
  })

  it('marks the active theme selected', () => {
    themeId.value = 'amber'
    const w = mount(AppearancePane)
    const amber = w.get('[data-test="theme-card"][data-theme-id="amber"]')
    expect(amber.attributes('aria-pressed')).toBe('true')
  })

  it('clicking a theme card calls setTheme', async () => {
    const w = mount(AppearancePane)
    await w.get('[data-test="theme-card"][data-theme-id="nocturne"]').trigger('click')
    expect(setTheme).toHaveBeenCalledWith('nocturne')
  })
})
