export interface ThemeOverrides {
  accent?: string // raw oklch/hex string -> --primary, --ring, Phosphor effect
  radius?: keyof typeof RADIUS_PRESETS
  density?: keyof typeof DENSITY_PRESETS
  font?: keyof typeof FONT_PRESETS
}

export const RADIUS_PRESETS = {
  sharp: '0px',
  default: '0.25rem',
  round: '0.625rem',
} as const

// --density scales list-row vertical padding + control heights ONLY (see styles.css).
// The inline anti-flash script in index.html mirrors these maps — keep them in sync.
export const DENSITY_PRESETS = {
  comfortable: '1',
  compact: '0.8',
} as const

export const FONT_PRESETS = {
  default: "'Hanken Grotesk Variable', ui-sans-serif, system-ui, sans-serif",
  system: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
  geist: "'Geist Mono Variable', ui-monospace, monospace",
} as const

export function overridesToVars(o: ThemeOverrides): Record<string, string> {
  const vars: Record<string, string> = {}
  if (o.accent) {
    vars['--primary'] = o.accent
    vars['--ring'] = o.accent
    vars['--phosphor-effect'] = o.accent
  }
  if (o.radius && o.radius in RADIUS_PRESETS) vars['--radius'] = RADIUS_PRESETS[o.radius]
  if (o.density && o.density in DENSITY_PRESETS) vars['--density'] = DENSITY_PRESETS[o.density]
  if (o.font && o.font in FONT_PRESETS) vars['--font-sans'] = FONT_PRESETS[o.font]
  return vars
}
