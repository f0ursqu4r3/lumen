# Chassis + Phosphor Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace lumen's refined-dark skin with the Chassis hardware-instrument identity, add Phosphor as a switchable terminal theme+idiom, and make the chassis bar the window titlebar (native traffic lights kept).

**Architecture:** Token-level reskin in `src/styles.css` `:root` (the default theme), a renamed default registry entry (`amber` → `chassis`) with legacy-id coercion, a new `phosphor` theme whose registry entry carries `idiom: 'terminal'` — applied as a `data-idiom` attribute that CSS and a `useIdiom()` composable both consume — and `titleBarStyle: 'hiddenInset'` on all four `BrowserWindow` call sites with a new `ChassisBar.vue` as the drag-region titlebar.

**Tech Stack:** Vue 3 + TS, Tailwind v4 (`@theme inline` tokens), electrobun, vitest (jsdom for components, node for host/CSS tests). Run tests with `bunx vitest run` (NEVER `bun test` or `bun run test`). Run `bun run format` after edits in every task. Spec: `docs/superpowers/specs/2026-06-11-chassis-phosphor-restyle-design.md`.

**Conventions you must know:**
- Component tests: `@vue/test-utils` `mount()`, colocated `*.test.ts`, `describe/it/expect` from vitest globals.
- Host/CSS tests start with `// @vitest-environment node`.
- The default theme lives on `:root` in `src/styles.css`; the other themes are `:root[data-theme='id']` blocks in `src/themes.css`. `src/shared/theme/themes.drift.test.ts` enforces every registry theme has a complete CSS block.
- Theme state persists to localStorage keys `lumen:theme` / `lumen:theme-overrides`; cross-window sync via `lumen:theme-changed` CustomEvent (see `src/shared/theme/`).

---

### Task 1: Chassis tokens (`:root` reskin)

**Files:**
- Modify: `src/styles.css` (`:root` block lines ~19–75, shadows in `@theme inline` lines ~152–167, `.field-label` letter-spacing)
- Modify: `src/styles.css.test.ts`
- Modify: `src/features/labels/lib/labels.ts:111` (`CHIP_SURFACE`)

- [ ] **Step 1: Update the CSS token tests to expect Chassis values**

In `src/styles.css.test.ts`, replace the amber-literal assertions with safety-orange ones. The whole file becomes:

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8')

describe('styles.css chassis tokens', () => {
  it('does not hardcode the orange accent inside keyframes/shadows', () => {
    const lines = css.split('\n')
    const canonicalDef = /^\s*--(primary|ring):\s*oklch\(/
    // trailing-zero tolerant (0.69/0.690, 0.2/0.20)
    const orangeLiteral = /oklch\(\s*0\.690?\s+0\.20?\s+42/
    const violations = lines.filter((l) => orangeLiteral.test(l) && !canonicalDef.test(l))
    expect(violations).toEqual([])
  })

  it('drives the canvas gradient through a token', () => {
    expect(css).toMatch(/--canvas-gradient/)
    expect(css).toMatch(/background-image:\s*var\(--canvas-gradient\)/)
  })

  it('defines the canvas gradient token inside :root', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('@theme inline'))
    expect(root).toMatch(/--canvas-gradient/)
  })

  it('puts the chassis default theme on :root with color-scheme dark', () => {
    const root = css.slice(css.indexOf(':root'), css.indexOf('@theme inline'))
    expect(root).toMatch(/color-scheme:\s*dark/)
    expect(root).toMatch(/--primary:\s*oklch\(0\.69 0\.2 42\)/)
    expect(root).toMatch(/--background:\s*oklch\(0\.195/)
    expect(root).toMatch(/--radius:\s*0\.25rem/)
    expect(root).toMatch(/--border:\s*oklch\(0\.33/)
  })

  it('no longer defines a .dark theme selector or the dark custom-variant', () => {
    expect(css).not.toMatch(/@custom-variant dark/)
    expect(css).not.toMatch(/\.dark\s*\{/)
  })

  it('defines the terminal idiom block', () => {
    expect(css).toMatch(/:root\[data-idiom='terminal'\]/)
  })
})
```

(The terminal-idiom assertion will stay red until Task 8 — that is fine; it documents the destination. If you prefer strict TDD per task, add that final `it` in Task 8 instead.)

- [ ] **Step 2: Run to verify the new expectations fail**

Run: `bunx vitest run src/styles.css.test.ts`
Expected: FAIL — `--primary: oklch(0.69 0.2 42)` not found (still amber).

- [ ] **Step 3: Replace the `:root` block in `src/styles.css`**

Replace the entire `:root { … }` block (currently amber/slate, lines ~19–75) with:

```css
/* Chassis — lumen as a machined graphite instrument. Steel neutrals (hue 240,
   lower chroma than the old 256 slate), crisp 1px seam borders instead of soft
   elevation, near-square geometry, and a single safety-orange signal accent.
   Inert things are hardware; live things (LEDs, the lamp) emit. This is the
   default theme on :root; the other palettes live in themes.css. */
:root {
  color-scheme: dark;

  --radius: 0.25rem;
  --density: 1;

  --background: oklch(0.195 0.006 240);
  --foreground: oklch(0.93 0.005 240);
  --card: oklch(0.235 0.008 240);
  --card-foreground: oklch(0.93 0.005 240);
  --popover: oklch(0.235 0.008 240);
  --popover-foreground: oklch(0.93 0.005 240);

  /* Safety orange — the one signal hue: primary action, focus ring, lamp. */
  --primary: oklch(0.69 0.2 42);
  --primary-foreground: oklch(0.18 0.04 42);

  --secondary: oklch(0.27 0.01 240);
  --secondary-foreground: oklch(0.93 0.005 240);
  --muted: oklch(0.27 0.01 240);
  --muted-foreground: oklch(0.64 0.015 240);
  --accent: oklch(0.29 0.012 240);
  --accent-foreground: oklch(0.95 0.005 240);
  --destructive: oklch(0.62 0.2 25);
  --destructive-foreground: oklch(0.96 0.02 25);

  /* Hardware seams — deliberately more visible than the old soft slate. */
  --border: oklch(0.33 0.012 240);
  --input: oklch(0.34 0.012 240);
  --ring: oklch(0.69 0.2 42);

  --chart-1: var(--primary);
  --chart-2: oklch(0.7 0.13 162);
  --chart-3: oklch(0.66 0.15 240);
  --chart-4: oklch(0.7 0.16 25);
  --chart-5: oklch(0.72 0.13 300);

  --sidebar: oklch(0.235 0.008 240);
  --sidebar-foreground: oklch(0.93 0.005 240);
  --sidebar-primary: var(--primary);
  --sidebar-primary-foreground: oklch(0.18 0.04 42);
  --sidebar-accent: oklch(0.29 0.012 240);
  --sidebar-accent-foreground: oklch(0.95 0.005 240);
  --sidebar-border: oklch(0.33 0.012 240);
  --sidebar-ring: var(--ring);

  /* Flat chassis surface with a faint top light — no sculpted radial dome. */
  --canvas-gradient: linear-gradient(
    180deg,
    oklch(0.215 0.007 240) 0%,
    oklch(0.195 0.006 240) 18rem
  );
}
```

- [ ] **Step 4: Retune the shadow tokens in `@theme inline`**

Replace the five `--shadow-*` definitions (lines ~152–167) with:

```css
  /* Chassis depth: resting surfaces get a seam + lit top edge, not blur.
     Only transient layers (menus/toasts = pop, hovering bars = float) cast. */
  --shadow-card: inset 0 1px 0 oklch(1 0 0 / 0.05);
  --shadow-pop: 0 2px 8px -2px oklch(0 0 0 / 0.4), inset 0 1px 0 oklch(1 0 0 / 0.06);
  --shadow-float:
    0 4px 10px -2px oklch(0 0 0 / 0.5), 0 24px 60px -14px oklch(0 0 0 / 0.72),
    inset 0 1px 0 oklch(1 0 0 / 0.08);
  /* The orange primary reads as a backlit physical key. Fixed warm lit edge;
     only the hover bloom uses var(--primary). */
  --shadow-key: 0 1px 2px oklch(0.18 0.05 42 / 0.5), inset 0 1px 0 oklch(1 0.04 60 / 0.3);
  --shadow-key-hover:
    0 6px 18px -4px color-mix(in oklch, var(--primary) 42%, transparent),
    inset 0 1px 0 oklch(1 0.04 60 / 0.34);
```

- [ ] **Step 5: Widen the engraved-label tracking**

In `.field-label` (src/styles.css), change `letter-spacing: 0.08em;` → `letter-spacing: 0.14em;`.

- [ ] **Step 6: Add the counter-bezel utility** (consumed in Task 4; an inset counter window behind the hero digits — the one sanctioned inset shadow):

```css
/* Counter window — an inset bezel plate behind the hero Odometer digits. */
.counter-bezel {
  display: inline-block;
  padding: 0.125rem 0.625rem;
  border-radius: var(--radius-sm);
  background: oklch(0.165 0.006 240);
  box-shadow:
    inset 0 1px 2px oklch(0 0 0 / 0.5),
    inset 0 -1px 0 oklch(1 0 0 / 0.04);
}
```

- [ ] **Step 7: Retune the chip surface constant**

In `src/features/labels/lib/labels.ts:111`, the chip palette mixes toward the card surface. New `--card` ≈ `#26292d`:

```typescript
// The graphite plate surface chips sit on (matches --card). Each chip's two-tone
// palette is mixed toward it so saturated label colors read calm instead of neon.
const CHIP_SURFACE = '#26292d'
```

- [ ] **Step 8: Run the CSS + label tests**

Run: `bunx vitest run src/styles.css.test.ts src/features/labels`
Expected: styles tests PASS except the `terminal idiom block` case (red until Task 8 — acceptable, or defer that `it` to Task 8). Label tests PASS (CHIP_SURFACE is an internal mixing target; if a labels.test.ts asserts exact derived hexes, update those expected values to the re-derived outputs the failure message prints).

- [ ] **Step 9: Run the theme drift test (must still pass)**

Run: `bunx vitest run src/shared/theme/themes.drift.test.ts`
Expected: PASS — alternate themes are untouched; default is still on `:root`.

- [ ] **Step 10: Format + commit**

```bash
bun run format
git add -A
git commit -m "feat(restyle): chassis token system — steel palette, orange accent, seam shadows"
```

---

### Task 2: Rename the default theme `amber` → `chassis` (with legacy coercion)

**Files:**
- Modify: `src/shared/theme/themes.ts` (DEFAULT_THEME_ID + the default entry)
- Modify: `src/shared/theme/applyTheme.ts` (`readStored` coerces unknown ids)
- Test: `src/shared/theme/themes.test.ts`, `src/shared/theme/applyTheme.test.ts`

- [ ] **Step 1: Write failing tests**

In `themes.test.ts`, update the default-theme assertions: default id is `'chassis'`, name `'Chassis'`, group `'dark'` (mirror the existing assertion style — change expected strings only). Add:

```typescript
it('no longer registers the legacy amber id', () => {
  expect(themeById('amber')).toBeUndefined()
})
```

In `applyTheme.test.ts`, add:

```typescript
it('coerces a stored legacy/unknown theme id to the default', () => {
  const storage = makeStorage() // use the same storage stub the file already uses
  storage.setItem('lumen:theme', 'amber')
  expect(readStored(storage).themeId).toBe(DEFAULT_THEME_ID)
})
```

(Match the file's existing storage-stub helper; import `DEFAULT_THEME_ID` from `./themes`.)

- [ ] **Step 2: Run to verify failure**

Run: `bunx vitest run src/shared/theme/themes.test.ts src/shared/theme/applyTheme.test.ts`
Expected: FAIL — default is still `amber`; coercion not implemented.

- [ ] **Step 3: Implement**

In `themes.ts`: change `export const DEFAULT_THEME_ID = 'amber'` → `'chassis'`, and the first registry entry to:

```typescript
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
```

In `applyTheme.ts` `readStored`, coerce before returning (a user upgrading keeps a stored `'amber'`):

```typescript
const storedId = storage.getItem(THEME_KEY) ?? DEFAULT_THEME_ID
const themeId = themeById(storedId) ? storedId : DEFAULT_THEME_ID
```

(Adapt identifier names to the file's actual locals; the behavior is: unknown id → `DEFAULT_THEME_ID`.)

- [ ] **Step 4: Run the full theme + settings suites**

Run: `bunx vitest run src/shared/theme src/features/settings`
Expected: PASS. If `AppearancePane.test.ts` or `themes.drift.test.ts` reference the `amber` id or count, update those literals (`'amber'` → `'chassis'`; counts unchanged at 16).

- [ ] **Step 5: Format + commit**

```bash
bun run format
git add -A
git commit -m "feat(theme): rename default theme to chassis, coerce legacy stored ids"
```

---

### Task 3: Retune radius presets around the squarer default

**Files:**
- Modify: `src/shared/theme/overrides.ts`
- Test: `src/shared/theme/overrides.test.ts`

- [ ] **Step 1: Write failing test** — update the radius-preset expectations in `overrides.test.ts` to:

```typescript
expect(overridesToVars({ radius: 'sharp' })['--radius']).toBe('0px')
expect(overridesToVars({ radius: 'default' })['--radius']).toBe('0.25rem')
expect(overridesToVars({ radius: 'round' })['--radius']).toBe('0.625rem')
```

(Match the file's existing assertion shape — it may assert the whole vars object; change values only.)

- [ ] **Step 2: Run to verify failure** — `bunx vitest run src/shared/theme/overrides.test.ts` → FAIL.

- [ ] **Step 3: Implement** in `overrides.ts`:

```typescript
const RADIUS_PRESETS = {
  sharp: '0px',
  default: '0.25rem',
  round: '0.625rem',
} as const
```

- [ ] **Step 4: Run** — `bunx vitest run src/shared/theme` → PASS (fix any AppearancePane label assertions if they encode old rem values).

- [ ] **Step 5: Commit**

```bash
bun run format && git add -A && git commit -m "feat(theme): radius presets follow the squarer chassis default"
```

---

### Task 4: Chassis component dialect (chips, badges, buttons)

**Files:**
- Modify: `src/features/labels/components/LabelChip.vue`
- Modify: `src/features/issues/components/StateBadge.vue`
- Modify: `src/features/issues/components/IssueRow.vue` (status button class)
- Modify: `src/features/issues/components/IssueCard.vue` (status button class — same string)
- Modify: `src/shared/ui/button/index.ts`
- Test: `src/features/labels/components/LabelChip.test.ts` (extend if present, else create)

- [ ] **Step 1: Write/extend the LabelChip test**

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LabelChip from './LabelChip.vue'

describe('LabelChip (chassis dialect)', () => {
  it('renders a squared mono printed-label, not a rounded pill', () => {
    const w = mount(LabelChip, { props: { title: 'scope::value', color: '#1f75cb' } })
    const root = w.find('span')
    expect(root.classes()).toContain('rounded-[3px]')
    expect(root.classes()).toContain('font-mono')
    expect(root.classes()).toContain('uppercase')
    expect(root.classes()).not.toContain('rounded-full')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `bunx vitest run src/features/labels` → FAIL.

- [ ] **Step 3: Implement the dialect**

`LabelChip.vue` outer span class — replace:

```
class="inline-flex h-5 items-center overflow-hidden rounded-full text-2xs leading-none font-medium whitespace-nowrap"
```

with:

```
class="inline-flex h-5 items-center overflow-hidden rounded-[3px] font-mono text-micro leading-none font-medium tracking-[0.06em] uppercase whitespace-nowrap"
```

`StateBadge.vue` full-pill variant — replace `rounded-full border px-2.5 py-0.5 text-xs font-medium` with `rounded-[3px] border px-2.5 py-0.5 font-mono text-2xs font-medium tracking-[0.06em] uppercase` (compact LED dot variant unchanged).

`IssueRow.vue` status button (lines ~177–191) and the matching status button in `IssueCard.vue` — in the class string, replace `rounded-full px-2 py-0.5 text-2xs font-medium` with `rounded-[3px] px-2 py-0.5 font-mono text-micro font-medium tracking-[0.06em] uppercase`.

`src/shared/ui/button/index.ts` default variant — replace `active:translate-y-0` with `active:translate-y-px` (key presses *in*, not just settles back).

- [ ] **Step 4: Rows become module plates**

`IssueRow.vue` root div (the `data-testid="issue-row"` element) — replace:

```
class="group relative flex items-center gap-3 px-4 transition-colors duration-150 hover:bg-accent/70 focus-within:bg-accent/70"
```

with:

```
class="group relative flex items-center gap-3 rounded-md border border-border/80 bg-card px-4 shadow-card transition-colors duration-150 hover:bg-accent/70 focus-within:bg-accent/70"
```

Then open `src/views/IssueList.vue`, find the list container that renders the `IssueRow` loop, and give the rows breathing room as separated plates: add `flex flex-col gap-1.5` to that container (and remove any `divide-y`/border-between-rows classes on it — plates carry their own seams now). Apply the same treatment to the merge-request list if `MergeRequestList.vue` uses a parallel row component: same plate class set on the row root, same `gap-1.5` on its list container. `PipelineRow.vue` already renders bordered expandable rows — only confirm its container uses `border-border` (not a softer alpha) so it reads as the same seam family; adjust if needed.

- [ ] **Step 5: Bezel the hero count**

Grep for `text-hero` consumers (`grep -rn "text-hero" src/`). On each element that hosts the hero `<Odometer>` count (IssueList, ProjectPicker, etc.), add the `counter-bezel` class from Task 1 alongside the existing type classes. The Odometer inherits font/color through the bezel unchanged.

- [ ] **Step 6: Run component suites**

Run: `bunx vitest run src/features/labels src/features/issues src/shared/ui src/views`
Expected: PASS (update any snapshot/class assertions the failures point at — the only intended diffs are the class strings above).

- [ ] **Step 7: Commit**

```bash
bun run format && git add -A && git commit -m "feat(restyle): chassis dialect — plates, printed-label chips, squared badges, key-press buttons"
```

---

### Task 5: `ChassisBar.vue` titlebar component + shell integration

**Files:**
- Create: `src/shared/components/shell/ChassisBar.vue`
- Create: `src/shared/components/shell/ChassisBar.test.ts`
- Modify: `src/shared/components/shell/AppShell.vue`
- Modify: `src/App.vue` (windowed branch)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const fetching = ref(0)
vi.mock('@tanstack/vue-query', () => ({ useIsFetching: () => fetching }))

import ChassisBar from './ChassisBar.vue'

describe('ChassisBar', () => {
  it('is a window drag region with a no-drag lamp', () => {
    const w = mount(ChassisBar)
    expect(w.classes()).toContain('electrobun-webkit-app-region-drag')
    const lamp = w.get('[data-testid="chassis-lamp"]')
    expect(lamp.classes()).toContain('electrobun-webkit-app-region-no-drag')
  })

  it('reserves the macOS traffic-light zone', () => {
    const w = mount(ChassisBar)
    expect(w.classes()).toContain('pl-[78px]')
  })

  it('shows the engraved wordmark by default and a window title when given', () => {
    expect(mount(ChassisBar).text()).toContain('Lumen')
    expect(mount(ChassisBar, { props: { title: 'Settings' } }).text()).toContain('Settings')
  })

  it('breathes the lamp only while queries are in flight', async () => {
    const w = mount(ChassisBar)
    expect(w.get('[data-testid="chassis-lamp"]').classes()).not.toContain('lamp-busy')
    fetching.value = 2
    await w.vm.$nextTick()
    expect(w.get('[data-testid="chassis-lamp"]').classes()).toContain('lamp-busy')
    fetching.value = 0
  })
})
```

- [ ] **Step 2: Run to verify failure** — `bunx vitest run src/shared/components/shell/ChassisBar.test.ts` → FAIL (component missing).

- [ ] **Step 3: Implement `ChassisBar.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useIsFetching } from '@tanstack/vue-query'

// The chassis bar IS the window titlebar: the OS titlebar is hidden
// (titleBarStyle: 'hiddenInset' in src/bun), the native traffic lights float
// over the reserved left zone, and electrobun's preload turns the app-region
// classes into real window-drag behavior. Interactive children must opt out
// with the no-drag class.
defineProps<{ title?: string }>()

const fetching = useIsFetching()
const busy = computed(() => fetching.value > 0)
</script>

<template>
  <div
    data-testid="chassis-bar"
    class="electrobun-webkit-app-region-drag relative flex h-9 shrink-0 items-center gap-3 pr-4 pl-[78px] select-none"
  >
    <span class="font-mono text-2xs font-medium tracking-[0.22em] text-muted-foreground uppercase">
      {{ title ?? 'Lumen' }}
    </span>
    <span class="flex-1" />
    <!-- Liveness lamp: steady orange when idle, breathes while fetching. -->
    <span
      data-testid="chassis-lamp"
      class="electrobun-webkit-app-region-no-drag size-1.5 rounded-full bg-primary"
      :class="busy && 'lamp-busy'"
      :title="busy ? 'Syncing…' : 'Connected'"
    />
  </div>
</template>
```

- [ ] **Step 4: Run** — `bunx vitest run src/shared/components/shell/ChassisBar.test.ts` → PASS.

- [ ] **Step 5: Mount it in the main shell**

`AppShell.vue` — restructure to a column with the bar on top (the bar spans the full window width, above rail + panel):

```vue
<template>
  <div class="flex h-screen flex-col overflow-hidden bg-background text-foreground">
    <ChassisBar />
    <div class="flex min-h-0 flex-1 gap-1.5 p-1.5 pt-0">
      <AppIconRail />
      <div
        class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
      >
        <AppTopBar />
        <div class="flex-1 overflow-y-auto overflow-x-clip">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>
```

(Add `import ChassisBar from './ChassisBar.vue'` to the script block. `rounded-xl` now derives from the smaller `--radius` token — no class change needed.)

- [ ] **Step 6: Mount it in the windowed branch of `App.vue`**

Replace the windowed wrapper:

```vue
<div
  v-else-if="windowed"
  class="flex h-screen flex-col overflow-hidden bg-background p-1.5 text-foreground"
>
```

with:

```vue
<div v-else-if="windowed" class="flex h-screen flex-col overflow-hidden bg-background text-foreground">
  <ChassisBar />
  <div class="flex min-h-0 flex-1 flex-col px-1.5 pb-1.5">
```

…and close the new inner `</div>` just before `<IssueSavebarSlot />` (the panel + savebar slot move inside it). Add the `ChassisBar` import to `App.vue`'s script. The third branch (`v-else`, plain-browser fallback) stays untouched.

- [ ] **Step 7: Run the shell + App suites**

Run: `bunx vitest run src/shared/components/shell src/App.test.ts`
Expected: PASS — if `AppShell.test.ts`/`App.test.ts` assert wrapper classes or structure, update them to the new column layout (failures will name the exact assertions; stub `@tanstack/vue-query`'s `useIsFetching` the same way as ChassisBar.test.ts if a mount now reaches it, or rely on the app-level QueryClient plugin the tests already install).

- [ ] **Step 8: Commit**

```bash
bun run format && git add -A && git commit -m "feat(shell): ChassisBar titlebar with drag region, wordmark, and liveness lamp"
```

---### Task 6: Native window chrome (`hiddenInset`)

**Files:**
- Create: `src/bun/windowChrome.ts`
- Create: `src/bun/windowChrome.test.ts`
- Modify: `src/bun/index.ts` (all four `new BrowserWindow({…})` call sites: main ~line 325, issue ~122, combined ~161, settings ~198)

- [ ] **Step 1: Write the failing test**

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { WINDOW_CHROME } from './windowChrome'

describe('WINDOW_CHROME', () => {
  it('hides the OS titlebar but keeps native inset traffic lights', () => {
    expect(WINDOW_CHROME.titleBarStyle).toBe('hiddenInset')
  })
  it('centers the traffic lights in the 36px chassis bar', () => {
    expect(WINDOW_CHROME.trafficLightOffset).toEqual({ x: 14, y: 12 })
  })
})
```

- [ ] **Step 2: Run to verify failure** — `bunx vitest run src/bun/windowChrome.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/bun/windowChrome.ts`**

```typescript
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
```

- [ ] **Step 4: Run** — `bunx vitest run src/bun/windowChrome.test.ts` → PASS.

- [ ] **Step 5: Spread into all four call sites in `src/bun/index.ts`**

Add `import { WINDOW_CHROME } from './windowChrome'` and add `...WINDOW_CHROME,` to each options object. Example (main window — repeat identically for issue, combined-issues, and settings windows):

```typescript
const win = track(
  new BrowserWindow({
    title: 'Lumen',
    url,
    frame: mainFrame,
    rpc: buildRpc({ route: restorePlan.mainRoute, isMain: true }),
    ...WINDOW_CHROME,
  }),
)
```

- [ ] **Step 6: Typecheck + full bun-host tests**

Run: `bunx vitest run src/bun && bunx vue-tsc --noEmit`
Expected: PASS / clean. (electrobun's `WindowOptionsType` declares `titleBarStyle` non-optional with a default — spreading a literal `'hiddenInset'` satisfies it; the `as const` keeps the literal type.)

- [ ] **Step 7: Manual verification note (cannot be unit-tested)**

Launch with `bun run app:dev` and confirm: traffic lights sit centered in the bar; dragging the bar moves the window; lamp/buttons remain clickable; double-click-to-zoom — if zoom does not fire (electrobun drag regions own the mousedown), accept for now and log a follow-up; do NOT hand-roll a zoom RPC in this task.

- [ ] **Step 8: Commit**

```bash
bun run format && git add -A && git commit -m "feat(chrome): chassis bar replaces OS titlebar via hiddenInset on all windows"
```

---

### Task 7: Phosphor theme (palette + registry + `data-idiom` application)

**Files:**
- Modify: `src/shared/theme/themes.ts` (`ThemeMeta` + new entry)
- Modify: `src/themes.css` (new block)
- Modify: `src/shared/theme/applyTheme.ts` (set/clear `data-idiom`)
- Test: `src/shared/theme/themes.test.ts`, `src/shared/theme/applyTheme.test.ts`

- [ ] **Step 1: Write failing tests**

`themes.test.ts` — adjust the count assertion (16 → 17) and add:

```typescript
it('registers phosphor as a dark terminal-idiom theme', () => {
  const t = themeById('phosphor')
  expect(t?.group).toBe('dark')
  expect(t?.idiom).toBe('terminal')
})

it('only phosphor carries an idiom', () => {
  expect(THEMES.filter((t) => t.idiom).map((t) => t.id)).toEqual(['phosphor'])
})
```

`applyTheme.test.ts` — add (mirror the file's existing document/storage fixtures):

```typescript
it('sets data-idiom for a terminal theme and clears it on switch back', () => {
  const doc = makeDoc()
  applyTheme(doc, { themeId: 'phosphor', overrides: {} })
  expect(doc.documentElement.getAttribute('data-idiom')).toBe('terminal')
  applyTheme(doc, { themeId: DEFAULT_THEME_ID, overrides: {} })
  expect(doc.documentElement.hasAttribute('data-idiom')).toBe(false)
})
```

- [ ] **Step 2: Run to verify failure** — `bunx vitest run src/shared/theme` → FAIL.

- [ ] **Step 3: Implement registry + application**

`themes.ts` — extend the interface and append the entry at the end of the dark group:

```typescript
export interface ThemeMeta {
  id: string
  name: string
  group: 'dark' | 'light' | 'bold'
  colorScheme: 'dark' | 'light'
  /** Rendering idiom: 'terminal' flips components to the phosphor readout dialect. */
  idiom?: 'terminal'
  swatch: { bg: string; surface: string; fg: string; accent: string }
}
```

```typescript
{
  id: 'phosphor',
  name: 'Phosphor',
  group: 'dark',
  colorScheme: 'dark',
  idiom: 'terminal',
  swatch: {
    bg: 'oklch(0.17 0.018 150)',
    surface: 'oklch(0.195 0.022 150)',
    fg: 'oklch(0.85 0.13 150)',
    accent: 'oklch(0.87 0.19 150)',
  },
},
```

`applyTheme.ts` — where `data-theme` is set/removed, add:

```typescript
const idiom = themeById(state.themeId)?.idiom
if (idiom) doc.documentElement.setAttribute('data-idiom', idiom)
else doc.documentElement.removeAttribute('data-idiom')
```

- [ ] **Step 4: Add the CSS block to `src/themes.css`** (drift test requires the full token set; brightness tiers ride on foreground/primary/muted-foreground):

```css
/* Phosphor — single-hue CRT readout. Hierarchy is brightness, not color:
   bright = --primary, body = --foreground, dim = --muted-foreground. The
   terminal idiom block in styles.css handles geometry/type; this is palette. */
:root[data-theme='phosphor'] {
  color-scheme: dark;
  --background: oklch(0.17 0.018 150);
  --foreground: oklch(0.85 0.13 150);
  --card: oklch(0.195 0.022 150);
  --card-foreground: oklch(0.85 0.13 150);
  --popover: oklch(0.195 0.022 150);
  --popover-foreground: oklch(0.85 0.13 150);
  --primary: oklch(0.87 0.19 150);
  --primary-foreground: oklch(0.18 0.05 150);
  --secondary: oklch(0.225 0.025 150);
  --secondary-foreground: oklch(0.85 0.13 150);
  --muted: oklch(0.225 0.025 150);
  --muted-foreground: oklch(0.58 0.07 150);
  --accent: oklch(0.245 0.028 150);
  --accent-foreground: oklch(0.88 0.13 150);
  --destructive: oklch(0.62 0.2 25);
  --destructive-foreground: oklch(0.96 0.02 25);
  --border: oklch(0.28 0.04 150);
  --input: oklch(0.3 0.04 150);
  --ring: oklch(0.87 0.19 150);
  --chart-1: oklch(0.87 0.19 150);
  --chart-2: oklch(0.7 0.13 150);
  --chart-3: oklch(0.58 0.07 150);
  --chart-4: oklch(0.7 0.16 25);
  --chart-5: oklch(0.85 0.13 150);
  --sidebar: oklch(0.195 0.022 150);
  --sidebar-foreground: oklch(0.85 0.13 150);
  --sidebar-primary: oklch(0.87 0.19 150);
  --sidebar-primary-foreground: oklch(0.18 0.05 150);
  --sidebar-accent: oklch(0.245 0.028 150);
  --sidebar-accent-foreground: oklch(0.88 0.13 150);
  --sidebar-border: oklch(0.28 0.04 150);
  --sidebar-ring: oklch(0.87 0.19 150);
  --canvas-gradient: linear-gradient(180deg, oklch(0.185 0.02 150) 0%, oklch(0.17 0.018 150) 18rem);
}
```

- [ ] **Step 5: Run the whole theme suite incl. drift**

Run: `bunx vitest run src/shared/theme src/features/settings`
Expected: PASS — drift test sees the new block; AppearancePane renders 17 cards (update its count literal if asserted).

- [ ] **Step 6: Commit**

```bash
bun run format && git add -A && git commit -m "feat(theme): phosphor terminal theme — palette, registry idiom, data-idiom application"
```

---

### Task 8: Terminal idiom CSS + `useIdiom()` composable

**Files:**
- Modify: `src/styles.css` (append the idiom block)
- Create: `src/shared/theme/useIdiom.ts`
- Create: `src/shared/theme/useIdiom.test.ts`

- [ ] **Step 1: Write the failing composable test**

```typescript
import { describe, it, expect } from 'vitest'
import { useTheme } from './useTheme'
import { useIdiom } from './useIdiom'
import { DEFAULT_THEME_ID } from './themes'

describe('useIdiom', () => {
  it('is null for the default theme and "terminal" for phosphor', async () => {
    const { setTheme } = useTheme()
    const idiom = useIdiom()
    await setTheme(DEFAULT_THEME_ID)
    expect(idiom.value).toBeNull()
    await setTheme('phosphor')
    expect(idiom.value).toBe('terminal')
    await setTheme(DEFAULT_THEME_ID)
  })
})
```

(Mirror `useTheme.test.ts`'s existing setup — it already stubs the rpc broadcast; reuse the same mock/bootstrapping so `setTheme` resolves.)

- [ ] **Step 2: Run to verify failure** — `bunx vitest run src/shared/theme/useIdiom.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/shared/theme/useIdiom.ts`**

```typescript
import { computed } from 'vue'
import { useTheme } from './useTheme'
import { themeById } from './themes'

/** Reactive rendering idiom of the active theme — 'terminal' under Phosphor.
 *  Components branch on this for dialect swaps CSS can't express (bracketed
 *  statuses, ▲ priority glyphs, de-colored chips). */
export function useIdiom() {
  const { themeId } = useTheme()
  return computed(() => themeById(themeId.value)?.idiom ?? null)
}
```

- [ ] **Step 4: Append the idiom CSS to `src/styles.css`** (after the facet transition block):

```css
/* ---- Terminal idiom (Phosphor) ---------------------------------------------
   Everything CSS can flip when [data-idiom='terminal'] is set: mono type,
   zero radius, plates flattened to ruled rows. Component-level dialect
   (brackets, glyphs) lives behind useIdiom(). Tailwind utilities read these
   tokens through var(), so attribute-level overrides cascade everywhere.
   Note: an explicit user font override (inline --font-sans) still wins — an
   intentional escape hatch. */
:root[data-idiom='terminal'] {
  --radius: 0px;
  --font-sans: 'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace;
  --shadow-card: none;
  --shadow-pop: 0 0 0 1px var(--border);
  --shadow-float: 0 0 0 1px var(--border), 0 12px 32px -8px oklch(0 0 0 / 0.6);
  --shadow-key: none;
  --shadow-key-hover: none;
}

/* The one sanctioned glow: bright phosphor text is an emitting readout. */
:root[data-idiom='terminal'] .phosphor-glow {
  text-shadow: 0 0 8px color-mix(in oklch, var(--primary) 50%, transparent);
}
```

- [ ] **Step 5: Run** — `bunx vitest run src/shared/theme src/styles.css.test.ts`
Expected: PASS (including Task 1's deferred `terminal idiom block` assertion).

- [ ] **Step 6: Commit**

```bash
bun run format && git add -A && git commit -m "feat(theme): terminal idiom CSS layer + useIdiom composable"
```

---

### Task 9: Terminal dialect in components (brackets, glyphs, de-colored chips)

**Files:**
- Modify: `src/features/labels/lib/labels.ts` (terminal priority glyph map)
- Modify: `src/features/issues/components/StateBadge.vue`
- Modify: `src/features/issues/components/IssueRow.vue`
- Modify: `src/features/issues/components/IssueCard.vue`
- Modify: `src/features/labels/components/LabelChip.vue`
- Test: `src/features/labels/lib/labels.test.ts`, `src/features/issues/components/StateBadge.test.ts` (create if absent), `src/features/labels/components/LabelChip.test.ts`

- [ ] **Step 1: Write failing tests**

`labels.test.ts` — add:

```typescript
import { TERMINAL_PRIORITY } from './labels'

describe('TERMINAL_PRIORITY', () => {
  it('maps every priority level to a glyph + brightness tier', () => {
    expect(TERMINAL_PRIORITY.critical).toEqual({ glyph: '▲▲▲', tier: 'bright' })
    expect(TERMINAL_PRIORITY.fasttrack).toEqual({ glyph: '▲▲', tier: 'bright' })
    expect(TERMINAL_PRIORITY.high).toEqual({ glyph: '▲▲', tier: 'mid' })
    expect(TERMINAL_PRIORITY.medium).toEqual({ glyph: '▲', tier: 'mid' })
    expect(TERMINAL_PRIORITY.low).toEqual({ glyph: '▽', tier: 'dim' })
  })
})
```

`StateBadge.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

const idiom = ref<string | null>(null)
vi.mock('@/shared/theme/useIdiom', () => ({ useIdiom: () => idiom }))

import StateBadge from './StateBadge.vue'

describe('StateBadge', () => {
  it('renders the pill dialect by default', () => {
    idiom.value = null
    expect(mount(StateBadge, { props: { state: 'opened' } }).text()).toBe('Open')
  })
  it('renders bracketed phosphor text under the terminal idiom', () => {
    idiom.value = 'terminal'
    expect(mount(StateBadge, { props: { state: 'opened' } }).text()).toBe('[OPEN]')
    expect(mount(StateBadge, { props: { state: 'closed' } }).text()).toBe('[CLOSED]')
    idiom.value = null
  })
})
```

`LabelChip.test.ts` — add:

```typescript
it('renders as bracketed dim text under the terminal idiom', () => {
  idiom.value = 'terminal'
  const w = mount(LabelChip, { props: { title: 'team::ops', color: '#1f75cb' } })
  expect(w.text()).toBe('[team::ops]')
  expect(w.attributes('style') ?? '').not.toContain('background-color')
  idiom.value = null
})
```

(Add the same `vi.mock('@/shared/theme/useIdiom', …)` + `idiom` ref to the top of LabelChip.test.ts as in StateBadge.test.ts.)

- [ ] **Step 2: Run to verify failure** — `bunx vitest run src/features/labels src/features/issues/components/StateBadge.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`labels.ts` — append after the `PRIORITY` table:

```typescript
/** Terminal-idiom (Phosphor) rendering: priority as repeated glyphs, hierarchy
 *  as brightness tier instead of semantic color. */
export interface TerminalPriorityGlyph {
  glyph: string
  tier: 'bright' | 'mid' | 'dim'
}

export const TERMINAL_PRIORITY: Record<Priority, TerminalPriorityGlyph> = {
  critical: { glyph: '▲▲▲', tier: 'bright' },
  fasttrack: { glyph: '▲▲', tier: 'bright' },
  high: { glyph: '▲▲', tier: 'mid' },
  medium: { glyph: '▲', tier: 'mid' },
  low: { glyph: '▽', tier: 'dim' },
}
```

`StateBadge.vue` — full replacement:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useIdiom } from '@/shared/theme/useIdiom'

const props = defineProps<{ state: string; compact?: boolean }>()
const open = computed(() => props.state === 'opened')
const label = computed(() => (open.value ? 'Open' : 'Closed'))
const idiom = useIdiom()
</script>

<template>
  <!-- Terminal idiom: a bracketed phosphor readout, bright when live. -->
  <span
    v-if="idiom === 'terminal'"
    :title="label"
    class="font-mono text-2xs whitespace-nowrap"
    :class="open ? 'phosphor-glow text-primary' : 'text-muted-foreground'"
  >
    [{{ label.toUpperCase() }}]
  </span>
  <!-- Compact: a status LED (used in dense lists where the column is implied).
       Full: a printed device label with a leading LED (detail page). -->
  <span
    v-else-if="compact"
    :title="label"
    :aria-label="label"
    class="inline-block size-2 shrink-0 rounded-full"
    :class="
      open ? 'bg-emerald-400 shadow-[0_0_0_3px_oklch(0.7_0.15_162/0.18)]' : 'bg-muted-foreground/50'
    "
  />
  <span
    v-else
    class="inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-0.5 font-mono text-2xs font-medium tracking-[0.06em] uppercase"
    :class="
      open
        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
        : 'border-border bg-muted text-muted-foreground'
    "
  >
    <span class="size-1.5 rounded-full" :class="open ? 'bg-emerald-400' : 'bg-muted-foreground'" />
    {{ label }}
  </span>
</template>
```

`IssueRow.vue` and `IssueCard.vue` — in both, add to the script block:

```typescript
import { useIdiom } from '@/shared/theme/useIdiom'
import { TERMINAL_PRIORITY } from '@/features/labels/lib/labels'

const idiom = useIdiom()
const TIER_CLASS = {
  bright: 'phosphor-glow text-primary',
  mid: 'text-foreground',
  dim: 'text-muted-foreground',
} as const
```

…and replace the **inner content** of the priority button (keep the surrounding `<button>` + its click/filter wiring) with:

```vue
<span
  v-if="idiom === 'terminal' && priority"
  class="font-mono text-2xs leading-none"
  :class="TIER_CLASS[TERMINAL_PRIORITY[priority.level].tier]"
>
  {{ TERMINAL_PRIORITY[priority.level].glyph }}
</span>
<component
  v-else
  :is="ICONS[priority.icon]"
  class="size-3.5"
  :style="{ color: priority.color }"
  :stroke-width="2.75"
/>
```

…and on the status button in both files, make the inline color styles conditional so terminal mode is brightness-only — replace the `:style` binding with:

```vue
:style="idiom === 'terminal' ? undefined : { backgroundColor: tint(status.color, 0.18), color: status.color }"
```

and wrap the status text as `<template v-if="idiom === 'terminal'">[{{ status.value.toUpperCase() }}]</template><template v-else>{{ status.value }}</template>`, hiding the leading dot span with `v-if="idiom !== 'terminal'"`.

`LabelChip.vue` — add a terminal branch above the existing template root:

```vue
<span
  v-if="idiom === 'terminal'"
  class="inline-flex h-5 items-center gap-1 font-mono text-2xs whitespace-nowrap text-muted-foreground"
  :title="title"
>
  [{{ title }}]
  <button
    v-if="closeable"
    type="button"
    :aria-label="`Remove filter ${title}`"
    class="grid size-3.5 place-items-center outline-none hover:text-foreground focus-visible:text-foreground"
    @click="emit('remove')"
  >
    <X class="size-2.5" :stroke-width="2.5" />
  </button>
</span>
<span v-else …existing pill template unchanged… >
```

(Script: `const idiom = useIdiom()` + import.)

- [ ] **Step 4: Run all touched suites**

Run: `bunx vitest run src/features/labels src/features/issues`
Expected: PASS. Any pre-existing IssueRow/IssueCard tests that mount without the mock get the real `useIdiom` → requires `useTheme` init; if that throws in jsdom, add the same `vi.mock('@/shared/theme/useIdiom', …)` returning `ref(null)` to those test files.

- [ ] **Step 5: Commit**

```bash
bun run format && git add -A && git commit -m "feat(phosphor): terminal dialect — bracketed statuses, glyph priorities, de-colored chips"
```

---

### Task 10: Documentation, format, full verification

**Files:**
- Modify: `.impeccable.md` (sections: Aesthetic Direction, Color, Design Principles intro)
- Verify: whole repo

- [ ] **Step 1: Update `.impeccable.md`**

Replace the **Aesthetic Direction** section body with:

```markdown
**Chassis — a machined graphite instrument.** Steel neutrals (hue 240) with crisp 1px
seam borders instead of soft elevation; near-square geometry (4px radius); inert
things read as hardware (plates, engraved mono micro-labels), live things emit
(LED status dots, the safety-orange signal lamp). One rare orange signal accent.
Color still carries *meaning* (labels, status, priority) rather than decoration.

- **Theme:** dark (chosen for the focused, editor-adjacent viewing context).
- **Density:** compact — maximize scannable rows for backlog triage.
- **Window chrome:** the ChassisBar IS the titlebar (`titleBarStyle: 'hiddenInset'`,
  native traffic lights kept, drag region via electrobun preload).
- **Phosphor:** a sanctioned alternate theme (`idiom: 'terminal'`) that flips the
  app to a single-hue CRT readout — bracketed statuses, ▲ priority glyphs,
  brightness-tier hierarchy. Text glow is allowed there only (`.phosphor-glow`).
```

Replace the **Color** section body with:

```markdown
- OKLCH throughout; neutrals tinted toward **hue 240** (steel) for cohesion.
- Background `oklch(0.195 0.006 240)`, plates `0.235`, seams `0.33`. No pure black/white.
- **Accent:** safety orange `oklch(0.69 0.2 42)` — used sparingly: the primary/create
  action, focus rings, and the chassis lamp. ~10% visual weight at most.
- Semantic label/status/priority colors render as LEDs/printed labels; brightened
  for contrast on dark surfaces (luminance-derived text on every colored chip).
```

In **Design Principles**, the five principles stand; update principle 5's exception list to add: *"…and the ChassisBar lamp, which inherits the header-lamp breathing exception."* Leave the Delight/Continuity/Pipelines/Toasts sections — they describe behavior that survives unchanged; correct any "amber" word to "orange" where it names the accent (grep the file for `amber`).

- [ ] **Step 2: Full-suite verification**

```bash
bun run format
bunx vitest run
bunx vue-tsc --noEmit
```

Expected: all green / clean. (Note: typecheck may be red ONLY if `src/gitlab/generated` is missing — that is the documented codegen gotcha, not this change; GraphQL queries are untouched by this plan.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs(design): document chassis system + phosphor idiom in .impeccable.md"
```

- [ ] **Step 4: Manual smoke (the user runs the app)**

`bun run app:dev` → verify: chassis skin everywhere; traffic lights centered in the bar; bar drags the window; Settings ▸ Appearance shows Phosphor with a green swatch; selecting it flips the whole app (mono, brackets, glyphs) live in every open window; switching back restores Chassis; legacy users (stored theme `amber`) land on Chassis without errors.
