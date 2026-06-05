import type { ApplicationMenuItemConfig } from 'electrobun/bun'

// Action id for the "Toggle Developer Tools" menu item; handled in index.ts by
// calling win.webview.toggleDevTools().
export const DEVTOOLS_ACTION = 'toggle-devtools'

const sep: ApplicationMenuItemConfig = { type: 'separator' }

/**
 * The macOS application menu. A native webview app has NO clipboard support
 * unless the app provides an Edit menu whose items carry the standard roles
 * (cut/copy/paste/selectAll) AND key accelerators — the OS dispatches ⌘C/⌘V/⌘X/⌘A
 * through these menu items to the focused webview. Electrobun does not auto-assign
 * accelerators for roles, so each one is set explicitly. A Develop menu adds a
 * devtools toggle so developer mode can be opened from the running app.
 */
export function buildAppMenu(appName: string): ApplicationMenuItemConfig[] {
  return [
    {
      label: appName,
      submenu: [
        { role: 'about' },
        sep,
        { role: 'hide', accelerator: 'CommandOrControl+H' },
        { role: 'hideOthers', accelerator: 'Alt+CommandOrControl+H' },
        { role: 'showAll' },
        sep,
        { role: 'quit', accelerator: 'CommandOrControl+Q' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', accelerator: 'CommandOrControl+Z' },
        { role: 'redo', accelerator: 'Shift+CommandOrControl+Z' },
        sep,
        { role: 'cut', accelerator: 'CommandOrControl+X' },
        { role: 'copy', accelerator: 'CommandOrControl+C' },
        { role: 'paste', accelerator: 'CommandOrControl+V' },
        { role: 'selectAll', accelerator: 'CommandOrControl+A' },
      ],
    },
    {
      label: 'Develop',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          action: DEVTOOLS_ACTION,
          accelerator: 'Alt+CommandOrControl+I',
        },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize', accelerator: 'CommandOrControl+M' },
        { role: 'zoom' },
        { role: 'toggleFullScreen', accelerator: 'Control+CommandOrControl+F' },
        sep,
        { role: 'close', accelerator: 'CommandOrControl+W' },
      ],
    },
  ]
}
