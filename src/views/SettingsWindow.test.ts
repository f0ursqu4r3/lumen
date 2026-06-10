import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsWindow from './SettingsWindow.vue'

describe('SettingsWindow', () => {
  it('renders a nav item per pane and shows the connection pane first', () => {
    const w = mount(SettingsWindow, {
      global: {
        stubs: {
          ConnectionPane: true,
          AgentAccessPane: true,
          DataCachePane: true,
          AboutPane: true,
        },
      },
    })
    const items = w.findAll('[data-testid="settings-nav-item"]')
    expect(items).toHaveLength(4)
    expect(w.find('connection-pane-stub').exists()).toBe(true)
  })

  it('switches the active pane on nav click', async () => {
    const w = mount(SettingsWindow, {
      global: {
        stubs: {
          ConnectionPane: true,
          AgentAccessPane: true,
          DataCachePane: true,
          AboutPane: true,
        },
      },
    })
    await w.findAll('[data-testid="settings-nav-item"]')[1].trigger('click')
    expect(w.find('agent-access-pane-stub').exists()).toBe(true)
  })
})
