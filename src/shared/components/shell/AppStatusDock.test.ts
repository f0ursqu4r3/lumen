import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const { sessionState } = vi.hoisted(() => ({ sessionState: { unavailable: false } }))
vi.mock('@/shared/composables/useSession', () => ({ sessionState }))

import AppStatusDock from './AppStatusDock.vue'

describe('AppStatusDock', () => {
  it('shows a healthy connection by default', () => {
    sessionState.unavailable = false
    const dot = mount(AppStatusDock).get('[data-testid="status-connection"]')
    expect(dot.text()).toContain('Connected')
    expect(dot.classes().join(' ')).toContain('text-emerald')
  })

  it('reflects an unavailable session', () => {
    sessionState.unavailable = true
    const dot = mount(AppStatusDock).get('[data-testid="status-connection"]')
    expect(dot.text()).toContain('Reconnecting')
    expect(dot.classes().join(' ')).toContain('text-amber')
    sessionState.unavailable = false
  })
})
