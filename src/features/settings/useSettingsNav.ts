import { ref, type Component } from 'vue'
import { Settings2, Plug, Bot, Palette, Database, Info } from '@lucide/vue'
import GeneralPane from './panes/GeneralPane.vue'
import ConnectionPane from './panes/ConnectionPane.vue'
import AgentAccessPane from './panes/AgentAccessPane.vue'
import AppearancePane from './panes/AppearancePane.vue'
import DataCachePane from './panes/DataCachePane.vue'
import AboutPane from './panes/AboutPane.vue'

export interface SettingsPane {
  id: string
  label: string
  icon: Component
  component: Component
}

/** The settings categories, in sidebar order. Plan 2 will further insert
 *  Shortcuts and Notifications before Data & cache. */
export const SETTINGS_PANES: SettingsPane[] = [
  { id: 'general', label: 'General', icon: Settings2, component: GeneralPane },
  { id: 'connection', label: 'Connection', icon: Plug, component: ConnectionPane },
  { id: 'agent', label: 'Agent access', icon: Bot, component: AgentAccessPane },
  { id: 'appearance', label: 'Appearance', icon: Palette, component: AppearancePane },
  { id: 'data', label: 'Data & cache', icon: Database, component: DataCachePane },
  { id: 'about', label: 'About', icon: Info, component: AboutPane },
]

export function useSettingsNav() {
  const selected = ref<string>(SETTINGS_PANES[0].id)
  const select = (id: string) => {
    selected.value = id
  }
  return { selected, select }
}
