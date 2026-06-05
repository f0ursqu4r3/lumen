import { describe, it, expect } from 'vitest'
import { buildAppMenu, DEVTOOLS_ACTION } from './menu'

// Loose shape for asserting against the menu tree without importing the
// electrobun runtime type.
type Item = {
  label?: string
  role?: string
  action?: string
  accelerator?: string
  submenu?: Item[]
}

const menu = buildAppMenu('Lumen') as Item[]
const submenuOf = (label: string) => menu.find((m) => m.label === label)?.submenu ?? []
const byRole = (items: Item[], role: string) => items.find((i) => i.role === role)

describe('buildAppMenu', () => {
  it('gives macOS an Edit menu with clipboard roles bound to ⌘ accelerators', () => {
    // Without these, the native webview has no responder for ⌘C/⌘V/⌘X/⌘A.
    const edit = submenuOf('Edit')
    for (const role of ['cut', 'copy', 'paste', 'selectAll']) {
      const item = byRole(edit, role)
      expect(item, `Edit > ${role} missing`).toBeTruthy()
      expect(item!.accelerator, `${role} has no accelerator`).toBeTruthy()
    }
  })

  it('exposes a Toggle Developer Tools action with a shortcut', () => {
    const items = menu.flatMap((m) => m.submenu ?? [])
    const devtools = items.find((i) => i.action === DEVTOOLS_ACTION)
    expect(devtools, 'no devtools menu item').toBeTruthy()
    expect(devtools!.accelerator).toBeTruthy()
  })

  it('includes quit in the app menu', () => {
    expect(byRole(submenuOf('Lumen'), 'quit')).toBeTruthy()
  })
})
