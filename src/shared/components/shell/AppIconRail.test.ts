import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'

const { openSettings } = vi.hoisted(() => ({ openSettings: vi.fn() }))
vi.mock('@/shared/composables/useSettings', () => ({ openSettings }))

const { sessionState } = vi.hoisted(() => ({ sessionState: { unavailable: false } }))
vi.mock('@/shared/composables/useSession', () => ({ sessionState }))

import AppIconRail from './AppIconRail.vue'
import { useCommandPalette } from '@/shared/composables/useCommandPalette'

function mountRail() {
  return mount(AppIconRail, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('AppIconRail', () => {
  it('links to My Work (home) and Projects', () => {
    const targets = mountRail()
      .findAllComponents(RouterLinkStub)
      .map((l) => l.props('to'))
    expect(targets).toContainEqual({ name: 'home' })
    expect(targets).toContainEqual({ name: 'projects' })
  })

  it('opens the command palette from the search button', () => {
    useCommandPalette().close()
    const w = mountRail()
    w.get('[data-testid="rail-search"]').trigger('click')
    expect(useCommandPalette().isOpen.value).toBe(true)
  })

  it('opens settings from the settings button', () => {
    openSettings.mockClear()
    mountRail().get('[data-testid="rail-settings"]').trigger('click')
    expect(openSettings).toHaveBeenCalledOnce()
  })

  it('reflects an unavailable session on the connection dot', async () => {
    sessionState.unavailable = true
    const w = mountRail()
    expect(w.get('[data-testid="rail-connection"]').classes().join(' ')).toContain('text-amber')
    sessionState.unavailable = false
  })
})
