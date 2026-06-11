export type ThemeGroup = 'dark' | 'light' | 'bold'
export type ColorScheme = 'dark' | 'light'

export interface ThemeMeta {
  /** Matches the [data-theme="id"] CSS block (the default maps to :root). */
  id: string
  name: string
  group: ThemeGroup
  colorScheme: ColorScheme
  /** Representative colors for the picker preview card (no computed-style reads). */
  swatch: { bg: string; surface: string; fg: string; accent: string }
}

export const DEFAULT_THEME_ID = 'chassis'

export const THEMES: ThemeMeta[] = [
  // Dark
  {
    id: 'chassis',
    name: 'Chassis',
    group: 'dark',
    colorScheme: 'dark',
    swatch: {
      bg: 'oklch(0.195 0.006 240)',
      surface: 'oklch(0.235 0.008 240)',
      fg: 'oklch(0.93 0.005 240)',
      accent: 'oklch(0.69 0.2 42)',
    },
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    group: 'dark',
    colorScheme: 'dark',
    swatch: {
      bg: 'oklch(0.2 0.03 264)',
      surface: 'oklch(0.245 0.032 264)',
      fg: 'oklch(0.93 0.02 264)',
      accent: 'oklch(0.7 0.13 264)',
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    group: 'dark',
    colorScheme: 'dark',
    swatch: {
      bg: 'oklch(0.19 0 0)',
      surface: 'oklch(0.23 0 0)',
      fg: 'oklch(0.95 0 0)',
      accent: 'oklch(0.9 0 0)',
    },
  },
  {
    id: 'evergreen',
    name: 'Evergreen',
    group: 'dark',
    colorScheme: 'dark',
    swatch: {
      bg: 'oklch(0.19 0.012 150)',
      surface: 'oklch(0.23 0.014 150)',
      fg: 'oklch(0.94 0.01 150)',
      accent: 'oklch(0.72 0.15 150)',
    },
  },
  {
    id: 'crimson',
    name: 'Crimson',
    group: 'dark',
    colorScheme: 'dark',
    swatch: {
      bg: 'oklch(0.19 0.01 20)',
      surface: 'oklch(0.23 0.012 20)',
      fg: 'oklch(0.94 0.008 20)',
      accent: 'oklch(0.62 0.2 22)',
    },
  },
  {
    id: 'viola',
    name: 'Viola',
    group: 'dark',
    colorScheme: 'dark',
    swatch: {
      bg: 'oklch(0.195 0.014 300)',
      surface: 'oklch(0.235 0.016 300)',
      fg: 'oklch(0.94 0.01 300)',
      accent: 'oklch(0.68 0.16 300)',
    },
  },
  {
    id: 'teal',
    name: 'Teal',
    group: 'dark',
    colorScheme: 'dark',
    swatch: {
      bg: 'oklch(0.19 0.018 200)',
      surface: 'oklch(0.23 0.02 200)',
      fg: 'oklch(0.94 0.012 200)',
      accent: 'oklch(0.72 0.12 195)',
    },
  },
  {
    id: 'sepia-night',
    name: 'Sepia Night',
    group: 'dark',
    colorScheme: 'dark',
    swatch: {
      bg: 'oklch(0.2 0.018 60)',
      surface: 'oklch(0.24 0.02 60)',
      fg: 'oklch(0.93 0.014 70)',
      accent: 'oklch(0.78 0.09 70)',
    },
  },
  // Light
  {
    id: 'paper',
    name: 'Paper',
    group: 'light',
    colorScheme: 'light',
    swatch: {
      bg: 'oklch(0.98 0.006 80)',
      surface: 'oklch(1 0 0)',
      fg: 'oklch(0.24 0.01 60)',
      accent: 'oklch(0.66 0.14 70)',
    },
  },
  {
    id: 'daylight',
    name: 'Daylight',
    group: 'light',
    colorScheme: 'light',
    swatch: {
      bg: 'oklch(0.985 0.002 250)',
      surface: 'oklch(1 0 0)',
      fg: 'oklch(0.22 0.01 256)',
      accent: 'oklch(0.58 0.16 256)',
    },
  },
  {
    id: 'solarized',
    name: 'Solarized',
    group: 'light',
    colorScheme: 'light',
    swatch: {
      bg: 'oklch(0.96 0.02 95)',
      surface: 'oklch(0.98 0.015 95)',
      fg: 'oklch(0.45 0.03 200)',
      accent: 'oklch(0.6 0.13 60)',
    },
  },
  {
    id: 'linen',
    name: 'Linen',
    group: 'light',
    colorScheme: 'light',
    swatch: {
      bg: 'oklch(0.96 0.014 70)',
      surface: 'oklch(0.99 0.008 70)',
      fg: 'oklch(0.28 0.012 50)',
      accent: 'oklch(0.62 0.15 40)',
    },
  },
  {
    id: 'frost',
    name: 'Frost',
    group: 'light',
    colorScheme: 'light',
    swatch: {
      bg: 'oklch(0.98 0.004 230)',
      surface: 'oklch(1 0 0)',
      fg: 'oklch(0.26 0.012 240)',
      accent: 'oklch(0.55 0.08 240)',
    },
  },
  // Bold
  {
    id: 'dracula',
    name: 'Dracula',
    group: 'bold',
    colorScheme: 'dark',
    swatch: {
      bg: 'oklch(0.24 0.03 290)',
      surface: 'oklch(0.29 0.035 290)',
      fg: 'oklch(0.95 0.02 300)',
      accent: 'oklch(0.74 0.16 320)',
    },
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    group: 'bold',
    colorScheme: 'dark',
    swatch: {
      bg: 'oklch(0.24 0.02 70)',
      surface: 'oklch(0.28 0.022 70)',
      fg: 'oklch(0.9 0.03 90)',
      accent: 'oklch(0.74 0.15 60)',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    group: 'bold',
    colorScheme: 'dark',
    swatch: {
      bg: 'oklch(0.22 0.03 270)',
      surface: 'oklch(0.26 0.032 270)',
      fg: 'oklch(0.9 0.025 265)',
      accent: 'oklch(0.7 0.13 250)',
    },
  },
]

const BY_ID = new Map(THEMES.map((t) => [t.id, t]))
export function themeById(id: string): ThemeMeta | undefined {
  return BY_ID.get(id)
}
