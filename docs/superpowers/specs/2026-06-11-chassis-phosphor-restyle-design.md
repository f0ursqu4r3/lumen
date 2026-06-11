# lumen restyle — Chassis identity + Phosphor terminal mode

**Date:** 2026-06-11
**Status:** approved design, pre-implementation
**Scope:** new visual identity (skin only — layouts and interaction patterns unchanged),
plus custom window chrome and a switchable terminal idiom.

## Decision summary

- **Chassis** replaces the current refined-dark/Linear-class skin as the default
  identity: lumen as a physical instrument. Inert things (surfaces, labels, seams)
  read as machined graphite hardware; live things (status, sync, priority) read as
  LEDs and indicators.
- **Phosphor** ships as a selectable theme that flips both palette *and* rendering
  idiom to a single-hue CRT terminal readout. Full terminal mode, not a recolor.
- **Window chrome:** the chassis header replaces the default OS titlebar in every
  window, keeping native macOS traffic-light controls.
- Constraints from brainstorm: dark stays (only sacred element); amber accent,
  fonts, and density were negotiable. Boldness target: *distinct at a glance*,
  with work-tool restraint. Layouts, routes, and interaction patterns (lists,
  board, drawer, filters, click-to-filter facets) are untouched.

## 1. Chassis token system (new `:root` in `src/styles.css`)

### Palette (OKLCH, hue ~240 steel — cooler/more neutral than today's 256 slate)

| token | value | role |
|---|---|---|
| `--background` | `oklch(0.195 0.006 240)` | chassis surface |
| `--card` | `oklch(0.235 0.008 240)` | raised module plates |
| `--border` | `oklch(0.33 0.012 240)` | hardware seams — deliberately *more* visible than today |
| `--foreground` | `oklch(0.93 0.005 240)` | primary text |
| `--primary` | `oklch(0.69 0.2 42)` | safety orange — replaces amber: primary action, focus ring, lamp, eyebrow tick |
| `--muted-foreground` | steel gray ~`oklch(0.64 0.015 240)` | engraved labels |

Secondary/accent/popover/input/sidebar tokens re-derived from the same steel ramp.
Semantic label/status/priority colors (in `src/lib/labels.ts` brightening logic)
survive fully — rendered as LEDs (see §2).

### Geometry, depth, type

- `--radius`: 0.625rem → **0.25rem (4px)**. Near-square plates and keycap buttons.
- Soft ambient shadows retire on resting surfaces: `shadow-card` and `shadow-pop`
  reduce to crisp 1px seams + the existing top inner-highlight (the lit-edge idiom
  keeps). `shadow-float` alone retains a dark halo — transient bars hovering over
  scrolling content still need lift. No soft "elevation blur" anywhere else.
- `--canvas-gradient`: flattens to plain chassis with a faint top light (keep the
  token so themes can re-tint).
- **Type unchanged in face:** Hanken Grotesk (UI) + Geist Mono (data) stay
  (self-hosted, internal-CA constraint; sans titles preserve scan speed). The type
  scale tokens are untouched. Identity shift comes from usage: engraved uppercase
  mono micro-labels with wider tracking (`.field-label` evolved, tracking ≥0.14em)
  wherever chrome speaks.
- **LED idiom:** status/priority/type dots become small saturated LEDs with a tiny
  literal glow (generalizing the header-lamp idiom). Glow remains banned for
  decoration; LEDs and the lamp are the sanctioned emitters.

## 2. Chassis component idioms

- **Header → `ChassisBar.vue`** (new, shared): engraved `LUMEN` wordmark (mono,
  wide tracking), seam border below, orange signal lamp keeping its
  breathe-while-fetching behavior. Doubles as the window titlebar (§4).
- **`IssueRow` / `IssueCard` / pipeline rows:** module plates — raised on seam
  borders, 4px corners, leading status LED, mono id, sans title. Stretched-link and
  facet-click patterns untouched.
- **`LabelChip`:** two-tone pills become printed device labels — squared, mono,
  uppercase, 1px border in the label color, tinted fill. `readableText` WCAG
  contrast logic stays.
- **Buttons:** primary = backlit orange key (`shadow-key`/`shadow-key-hover`
  retuned for orange); secondary = plain machined key. Pressed = 1px translate
  down (the one new micro-interaction).
- **`Odometer` hero count:** mechanics unchanged; restyled as a counter window —
  inset bezel plate behind the digits.
- **Empty states:** keep the `Standby` idiom (already chassis-native).
- **Motion:** all existing tokens/cadences survive unchanged — row-in stagger,
  drop-in settle, facet springs, View Transitions, status settle, bell-listen.

## 3. Phosphor terminal mode

### Architecture: a theme with an idiom, not a setting

- `phosphor` joins the theme registry (`src/shared/theme/`); the registry type
  gains an optional `idiom?: 'terminal'` field. **No new Settings UI** — it
  appears in Appearance ▸ theme picker with a phosphor swatch.
- Selecting it sets `[data-theme="phosphor"]` (palette) **and**
  `[data-idiom="terminal"]` on the root element. The idiom attribute is derived
  from theme metadata; switching back removes it. Cross-window theme broadcast
  (`src/bun/themeBroadcast.ts`) carries the idiom with the theme as today.

### Palette

Green-black CRT: background near-black green; **three phosphor brightness tiers**
(bright / mid / dim — e.g. `#b6f7c1` / `#6ee07f` / `#45704e` re-expressed in OKLCH)
carry all hierarchy. Phosphor text glow (`text-shadow`) is sanctioned *in this
theme only*.

### CSS does most of it (`[data-idiom="terminal"]` rules)

- mono font everywhere (`--font-sans` remapped to the mono stack)
- radius → 0
- plates flatten to ruled rows (1px dim-phosphor rules, no raised fills)
- LEDs lose chroma → phosphor brightness dots

### Components do the rest (`useIdiom()` composable)

- `StateBadge` / workflow status → bracketed text: `[IN-PROG]`, `[ON-DECK]`, `[REVIEW]`
- priority → `▲` glyphs (count = severity), brightness-tiered
- `LabelChip` → bracketed dim-phosphor text
- Label *semantics* (parsing, filtering, grouping, board columns) untouched —
  only rendering collapses to brightness.

## 4. Window chrome (desktop, electrobun)

- Every `BrowserWindow` (main, issue popout, multi-issue, settings) is created
  with `titleBarStyle: 'hiddenInset'` — OS titlebar gone, **native macOS traffic
  lights remain** with all default behaviors (close/minimize/zoom, hover glyphs,
  option-click, fullscreen). `trafficLightOffset` centers them vertically in the
  chassis bar.
- `ChassisBar.vue` is the titlebar: full-width, left padding reserving the
  traffic-light zone (~78px), whole bar a drag region via electrobun's preload
  drag-region support (`app-region: drag` inline style / class). Interactive
  children — `#app-topbar-slot` teleported actions, refresh, lamp — marked no-drag.
- Settings/popout windows render their own slimmer `ChassisBar` variant in their
  isolated JS contexts — no cross-window bridging needed for chrome.
- Window geometry/session restore (`src/bun/session.ts`, `restore.ts`) untouched —
  only creation options change. macOS-first; custom-drawn controls for other
  platforms are out of scope.
- Verify during implementation: double-click-titlebar-to-zoom behavior on the
  custom drag region; if electrobun's drag region doesn't provide it natively,
  wire a double-click handler to zoom via the host bridge.

## 5. Migration

- Chassis tokens replace `:root` in `src/styles.css`. The existing 15 alternate
  themes in `themes.css` keep working as palettes over the new geometry (they
  render squarer — acceptable).
- User Appearance overrides (accent/radius/density/font) still layer on top.
- `.impeccable.md` rewritten: Chassis documented as the system; Phosphor as the
  sanctioned alternate idiom; the "no AI tells" bans stay (no gradients, no
  glassmorphism, no side-stripes); glow rules updated (LEDs + lamp in Chassis,
  text glow in Phosphor only).

## 6. Testing

- `styles.css.test.ts` token assertions updated to chassis values.
- Theme-registry test: `idiom` field round-trips; selecting phosphor sets/clears
  `data-idiom`.
- Component tests: `StateBadge` brackets, priority glyphs, `LabelChip` bracketed
  rendering under terminal idiom; default idiom unchanged snapshots.
- Window creation tests (`src/bun/*.test.ts`): assert `titleBarStyle` +
  `trafficLightOffset` on all four window types; drag/no-drag classes on
  `ChassisBar`.
- Existing view tests should pass untouched (layout/interaction unchanged).

## Out of scope

- Light theme, layout/navigation changes, new views.
- Non-macOS window controls.
- CRT gimmicks (scanlines, curvature, flicker) — banned.
- Changing the shipped font families.
