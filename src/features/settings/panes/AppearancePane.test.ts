import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const setTheme = vi.fn().mockResolvedValue(undefined)
const setOverride = vi.fn().mockResolvedValue(undefined)
const reset = vi.fn().mockResolvedValue(undefined)
const themeId = { value: 'chassis' }
const overrides = { value: {} as Record<string, unknown> }
vi.mock('@/shared/theme/useTheme', () => ({
  useTheme: () => ({ themeId, overrides, setTheme, setOverride, reset }),
}))

import AppearancePane from './AppearancePane.vue'

beforeEach(() => {
  vi.clearAllMocks()
  themeId.value = 'chassis'
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
    themeId.value = 'chassis'
    const w = mount(AppearancePane)
    const chassis = w.get('[data-test="theme-card"][data-theme-id="chassis"]')
    expect(chassis.attributes('aria-pressed')).toBe('true')
  })

  it('clicking a theme card calls setTheme', async () => {
    const w = mount(AppearancePane)
    await w.get('[data-test="theme-card"][data-theme-id="nocturne"]').trigger('click')
    expect(setTheme).toHaveBeenCalledWith('nocturne')
  })

  it('accent swatches call setOverride with an accent', async () => {
    const w = mount(AppearancePane)
    await w.get('[data-test="customize-toggle"]').trigger('click')
    await w.findAll('[data-test="accent-swatch"]')[1].trigger('click')
    expect(setOverride).toHaveBeenCalledWith(
      expect.objectContaining({ accent: expect.any(String) }),
    )
  })

  it('radius/density/font segmented controls call setOverride', async () => {
    const w = mount(AppearancePane)
    await w.get('[data-test="customize-toggle"]').trigger('click')
    await w.get('[data-test="radius-round"]').trigger('click')
    expect(setOverride).toHaveBeenCalledWith({ radius: 'round' })
    await w.get('[data-test="density-compact"]').trigger('click')
    expect(setOverride).toHaveBeenCalledWith({ density: 'compact' })
    await w.get('[data-test="font-system"]').trigger('click')
    expect(setOverride).toHaveBeenCalledWith({ font: 'system' })
  })

  it('reset button calls reset', async () => {
    const w = mount(AppearancePane)
    await w.get('[data-test="customize-toggle"]').trigger('click')
    await w.get('[data-test="reset-overrides"]').trigger('click')
    expect(reset).toHaveBeenCalled()
  })
})
