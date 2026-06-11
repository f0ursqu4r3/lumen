import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getStartupPrefs = vi.fn(async () => ({ restoreOnStartup: true }))
const setRestoreOnStartup = vi.fn(async (_a: { enabled: boolean }) => ({ ok: true as const }))
vi.mock('@/shared/lib/rpc', () => ({
  rpc: {
    getStartupPrefs: () => getStartupPrefs(),
    setRestoreOnStartup: (a: { enabled: boolean }) => setRestoreOnStartup(a),
  },
}))

import GeneralPane from './GeneralPane.vue'

beforeEach(() => {
  vi.clearAllMocks()
  getStartupPrefs.mockResolvedValue({ restoreOnStartup: true })
})

describe('GeneralPane', () => {
  it('reads the current preference on mount', async () => {
    const w = mount(GeneralPane)
    await flushPromises()
    expect(getStartupPrefs).toHaveBeenCalledTimes(1)
    expect(w.get('[data-test="restore-toggle"]').attributes('aria-pressed')).toBe('true')
  })

  it('renders the toggle off when the preference is false', async () => {
    getStartupPrefs.mockResolvedValue({ restoreOnStartup: false })
    const w = mount(GeneralPane)
    await flushPromises()
    expect(w.get('[data-test="restore-toggle"]').attributes('aria-pressed')).toBe('false')
  })

  it('writes the flipped preference when toggled', async () => {
    const w = mount(GeneralPane)
    await flushPromises()
    await w.get('[data-test="restore-toggle"]').trigger('click')
    await flushPromises()
    expect(setRestoreOnStartup).toHaveBeenCalledWith({ enabled: false })
    expect(w.get('[data-test="restore-toggle"]').attributes('aria-pressed')).toBe('false')
  })
})
