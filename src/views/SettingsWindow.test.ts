import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsWindow from './SettingsWindow.vue'

describe('SettingsWindow', () => {
  it('renders a nav item per pane and shows the general pane first', () => {
    const w = mount(SettingsWindow, {
      global: {
        stubs: {
          GeneralPane: true,
          ConnectionPane: true,
          AgentAccessPane: true,
          AppearancePane: true,
          DataCachePane: true,
          AboutPane: true,
        },
      },
    })
    const items = w.findAll('[data-testid="settings-nav-item"]')
    expect(items.map((i) => i.text())).toEqual([
      'General',
      'Connection',
      'Agent access',
      'Appearance',
      'Data & cache',
      'About',
    ])
    expect(w.find('general-pane-stub').exists()).toBe(true)
  })

  it('switches the active pane on nav click', async () => {
    const w = mount(SettingsWindow, {
      global: {
        stubs: {
          GeneralPane: true,
          ConnectionPane: true,
          AgentAccessPane: true,
          AppearancePane: true,
          DataCachePane: true,
          AboutPane: true,
        },
      },
    })
    await w.findAll('[data-testid="settings-nav-item"]')[1].trigger('click')
    expect(w.find('connection-pane-stub').exists()).toBe(true)
  })
})
