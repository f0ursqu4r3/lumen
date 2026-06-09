import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppShell from './AppShell.vue'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', name: 'home', component: { template: '<div/>' } }],
})

describe('AppShell', () => {
  it('renders the rail, top bar, and slotted view content', async () => {
    await router.push('/')
    await router.isReady()
    const w = mount(AppShell, {
      slots: { default: '<p data-testid="view">the view</p>' },
      global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.find('nav[aria-label="Global navigation"]').exists()).toBe(true)
    expect(w.find('#app-topbar-slot').exists()).toBe(true)
    expect(w.find('[data-testid="view"]').text()).toBe('the view')
  })
})
