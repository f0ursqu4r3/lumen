import { reactive } from 'vue'

/** Window event the native menu dispatches into the webview to open settings. */
export const OPEN_SETTINGS_EVENT = 'lumen:open-settings'

// Module-level singleton so the native menu bridge (or any caller) can open the
// one mounted <SettingsDialog/>. Mirrors useConfirm's shared-state approach.
export const settingsState = reactive<{ open: boolean }>({ open: false })

export function openSettings(): void {
  settingsState.open = true
}

export function closeSettings(): void {
  settingsState.open = false
}

/**
 * Listen for the native menu's open-settings event. Call once from the mounted
 * dialog's setup; returns a cleanup to remove the listener on unmount.
 */
export function registerSettingsShortcut(): () => void {
  const onEvent = () => openSettings()
  window.addEventListener(OPEN_SETTINGS_EVENT, onEvent)
  return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onEvent)
}
