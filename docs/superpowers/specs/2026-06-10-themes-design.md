# Themes — design

**Date:** 2026-06-10
**Status:** Approved, ready for implementation plan

## Goal

Ship a large, curated set of self-contained themes (16) with the current
refined-dark amber look as the unchanging default, plus a light user-override
layer (accent + a few knobs). Add an **Appearance** pane to the settings window
to pick themes and tune overrides, applying live across every open window.

## Decisions (locked during brainstorming)

- **Theme = full aesthetic.** A theme may change colors, accent, radius, the
  shadow family, font, and density — not just a recolor.
- **Each theme is self-contained.** No global light/dark toggle. Some themes are
  dark, some light, some bold; if you want light, you pick a light theme. The
  hardcoded `<html class="dark">` is replaced by a per-theme `data-theme` +
  `color-scheme`.
- **Default is `Amber`** — today's exact refined-dark palette, untouched.
- **Override layer is small:** accent, radius, density, font — stored as a delta
  on top of the chosen preset. No full token editor.
- **~16 themes, curated.** 8 dark / 5 light / 3 bold.

## Architecture

### 1. Token model & CSS restructure

`src/styles.css` + new `src/themes.css` (imported from `styles.css`).

- **`:root` becomes the default theme.** Today's `.dark` token block (slate hue
  256 + amber accent) moves into `:root` verbatim, with `color-scheme: dark`. So
  with no `data-theme` attribute — and even if JS never runs — the app looks
  exactly as it does now. Zero flash, zero FOUC.
- The dead stock-shadcn light `:root` block is **deleted** (it was never used;
  the app shipped hardcoded dark).
- The `.dark` selector and the `@custom-variant dark` are retired. The ambient
  canvas gradient currently under `.dark body` is driven by a new
  `--canvas-gradient` token: defined in `:root` (the current slate radial),
  re-defined per theme block, and set to `none` by light themes that want a flat
  fill. `body` references `background-image: var(--canvas-gradient)`.
- Each **non-default theme** is a `[data-theme="id"]` block in `themes.css`
  defining the full token set **plus** the full-aesthetic tokens it varies:
  `--radius`, `--font-sans`, the `--shadow-*` family, `--density`, and
  `color-scheme`. Most themes vary color only; the three **bold** themes also
  nudge radius/shadow/font for personality.

**Baked-in amber fix (prerequisite for theming glows).** ~15 keyframes/shadows
in `styles.css` hardcode `oklch(0.82 0.142 81 / α)` (the amber, e.g.
`lamp-breathe`, `flash-in`, `note-in`, `drop-in`, `eyebrow-tick::before`,
`--shadow-key*`). Each is rewritten to
`color-mix(in oklch, var(--primary) <α*100>%, transparent)` so every glow, lamp,
and flash re-tints with the active theme's accent. `color-mix` is well-supported
in the WKWebView/Chromium targets and has no animating-custom-property quirks
(the keyframe resolves `--primary` at used-value time).

### 2. Theme registry & runtime — `src/shared/theme/`

- **`themes.ts`** — the registry. CSS owns token *values*; the registry owns
  picker metadata:
  ```ts
  interface ThemeMeta {
    id: string            // matches the [data-theme] block (and :root for default)
    name: string
    group: 'dark' | 'light' | 'bold'
    colorScheme: 'dark' | 'light'
    swatch: { bg: string; surface: string; fg: string; accent: string } // preview chips
  }
  export const THEMES: ThemeMeta[]
  export const DEFAULT_THEME_ID = 'amber'
  ```
  `swatch` holds 4 representative colors used only to render preview cards
  without reading computed styles. Minor, accepted duplication.

- **`overrides.ts`** — the override delta type + token mapping:
  ```ts
  interface ThemeOverrides {
    accent?: string   // -> --primary, --ring
    radius?: string   // -> --radius   ('sharp' | 'default' | 'round' -> rem)
    density?: string  // -> --density  ('comfortable' | 'compact')
    font?: string     // -> --font-sans
  }
  ```
  A pure `overridesToVars(o): Record<string,string>` maps the delta to inline
  custom properties. **Density is scoped narrow:** `--density` only feeds
  list-row vertical padding and control-height tokens (enumerated in the plan),
  so it cannot ripple through every component.

- **`applyTheme.ts`** — pure DOM application, shared by runtime + the anti-flash
  inline script's logic:
  - `applyStoredTheme(doc, storage)` — read `lumen:theme` + `lumen:theme-overrides`
    from storage, set `doc.documentElement.dataset.theme` (omit for default) +
    `style.colorScheme`, and set each override var as an inline custom property.
    Unit-testable in isolation.
  - The default theme sets **no** `data-theme` attribute (it's `:root`).
  - Overrides are inline custom properties on `documentElement` → inline style
    outranks the stylesheet, so the delta cleanly wins over the preset block.

- **`useTheme.ts`** — reactive `{ themeId, overrides }` composable:
  - `setTheme(id)`, `setOverride(partial)`, `reset()` (clears the delta).
  - Each mutation: writes localStorage, applies via `applyTheme`, and fires
    `rpc.broadcastTheme({ themeId, overrides })`.

### 3. Persistence & cross-window sync

Mirrors the proven `installServerHealth` / `installMcpCacheSync` pattern.

- **Durable store: localStorage** — `lumen:theme` (id) + `lumen:theme-overrides`
  (JSON). `persist.ts` already treats localStorage as durable/disk-backed across
  windows, so a newly opened window boots with the correct theme.
- **Anti-flash: inline script in `index.html`** — a tiny synchronous script runs
  *before the bundle loads*, reading the two keys and applying `data-theme` +
  override vars. Same logic as `applyStoredTheme` (kept in sync; the shared
  helper is the tested source of truth). New windows boot correct, no flash.
- **Live cross-window: `broadcastTheme` RPC** — a window's theme change calls the
  host, which `broadcast`s a `lumen:theme-changed` CustomEvent (carrying
  `{ themeId, overrides }`) to every *other* window.
- **`installThemeSync(): () => void`** — installed once per window from `main.ts`
  alongside `installServerHealth`. Listens for `lumen:theme-changed`, applies it,
  and writes its localStorage mirror. Never torn down in production.

### 4. Settings — Appearance pane

`src/features/settings/panes/AppearancePane.vue`, registered in
`SETTINGS_PANES` **before Data & cache** (where the existing nav TODO says
*"Plan 2 inserts Appearance…"*). Icon: lucide `Palette`. Uses `PaneHeader`.

Top to bottom:

1. **Theme gallery** — swatch-card grid, grouped by `group` with quiet section
   labels (Dark / Light / Bold). Each card renders a mini preview from the
   registry's 4 swatch colors (bg + surface tile + sample text + accent dot),
   the theme name, and a selected ring. Click applies **instantly and globally** —
   no Save, no confirm.
2. **Customize** (collapsible, collapsed by default) — the override delta:
   - **Accent** — preset accent swatches + a custom hue slider → `--primary`/`--ring`.
   - **Radius** — segmented Sharp / Default / Round → `--radius`.
   - **Density** — segmented Comfortable / Compact → `--density` (narrow scope).
   - **Font** — Default (Hanken Grotesk) / System / one alt → `--font-sans`.
   - **Reset to theme defaults** — clears the delta, keeps the chosen preset.
3. **Preview tile** — a compact fake issue row + button + chip, so a theme/accent
   can be judged without leaving Settings (the whole app is also a live preview).

## The 16 themes

**Dark (8)**
1. **Amber** *(default)* — today's slate-256 + amber. Untouched.
2. **Nocturne** — deep blue-slate, indigo accent (Nord-ish, no cyan).
3. **Graphite** — pure neutral gray, near-white accent (mono).
4. **Evergreen** — warm charcoal, forest-green accent.
5. **Crimson** — cool dark slate, rose-red accent.
6. **Viola** — cool neutral, violet accent.
7. **Teal** — deep blue-green base, aqua accent.
8. **Sepia Night** — warm tobacco-brown dark, tan accent.

**Light (5)**
9. **Paper** — warm off-white, ink text, amber accent.
10. **Daylight** — clean cool white, blue accent.
11. **Solarized** — classic solarized-light.
12. **Linen** — cream, terracotta accent.
13. **Frost** — cool near-white, steel-slate accent.

**Bold (3)** — also nudge radius/shadow/font, not just color.
14. **Dracula** — neon purple/pink on dark indigo, brighter glow.
15. **Gruvbox** — retro ochre/orange on warm brown, softer radius.
16. **Tokyo Night** — deep navy, blue/magenta accents.

## Testing

- **`themes.test.ts`** — ids unique; required fields present; `amber` exists and
  equals `DEFAULT_THEME_ID`; every `group`/`colorScheme` value valid.
- **`applyTheme.test.ts`** — `applyStoredTheme` sets `data-theme` (omits it for
  default), sets `color-scheme`, applies/clears override vars; `overridesToVars`
  maps each knob to the right custom property.
- **`useTheme.test.ts`** — `setTheme`/`setOverride`/`reset` persist to
  localStorage, apply to the DOM, and call `rpc.broadcastTheme`.
- **`installThemeSync` test** — applies on `lumen:theme-changed`, writes the
  localStorage mirror, cleanup removes the listener.
- **`broadcastTheme` RPC host handler test** — calls `broadcast` with the theme
  event JS for the given payload.
- **Drift guard** — reads `themes.css`, asserts every registry id (except the
  default) has a matching `[data-theme="id"]` block, and the default tokens live
  in `:root`. Kills registry/CSS divergence.
- **`AppearancePane.test.ts`** — renders all themes grouped; clicking a card
  calls `setTheme(id)`; each override control mutates the delta; reset clears it.

## Out of scope

- Full per-token custom editor (only the 4-knob delta now).
- Light/dark mode toggle (themes are self-contained).
- Exposing theme control via the MCP app-control surface (could come later).
- Importing/sharing custom theme files.
