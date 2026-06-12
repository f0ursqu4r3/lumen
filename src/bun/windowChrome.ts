// Shared native-chrome options for every lumen window. The webview's
// ChassisBar replaces the OS titlebar; 'hiddenInset' keeps the real macOS
// traffic lights (close/minimize/zoom with all native behaviors) floating
// over the bar's reserved left zone. Drag behavior comes from electrobun's
// preload reading the app-region classes on ChassisBar — nothing to enable
// here.
//
// Deliberately NO trafficLightOffset: electrobun's custom button
// repositioning is not fullscreen-safe — after a fullscreen round-trip the
// native wrapper re-applies the offset against a wrong base and the buttons
// drift right (same bug class Electron fixed in electron#22492/#30150;
// electrobun#355 is open and the fix PR #358 was abandoned as of 1.18.1).
// Zero offset takes the stock AppKit placement path, which survives
// fullscreen transitions; the ChassisBar's padding/height adapt to the
// stock position instead.
export const WINDOW_CHROME = {
  titleBarStyle: 'hiddenInset',
  ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
} as const
