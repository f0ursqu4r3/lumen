// Shared native-chrome options for every lumen window. The webview's
// ChassisBar replaces the OS titlebar; 'hiddenInset' keeps the real macOS
// traffic lights (close/minimize/zoom with all native behaviors) floating
// over the bar's reserved left zone. The offset centers the ~12px controls
// in the 36px (h-9) bar. Drag behavior comes from electrobun's preload
// reading the app-region classes on ChassisBar — nothing to enable here.
export const WINDOW_CHROME = {
  titleBarStyle: 'hiddenInset',
  trafficLightOffset: { x: 14, y: 12 },
} as const
