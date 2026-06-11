<script setup lang="ts">
import { computed, ref } from 'vue'
import PaneHeader from './PaneHeader.vue'
import { THEMES, type ThemeGroup } from '@/shared/theme/themes'
import { useTheme } from '@/shared/theme/useTheme'
import { RADIUS_PRESETS, DENSITY_PRESETS, FONT_PRESETS } from '@/shared/theme/overrides'

const { themeId, overrides, setTheme, setOverride, reset } = useTheme()

const GROUPS: { key: ThemeGroup; label: string }[] = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'bold', label: 'Bold' },
]
const grouped = computed(() =>
  GROUPS.map((g) => ({ ...g, themes: THEMES.filter((t) => t.group === g.key) })),
)

const activeId = computed(() => themeId.value)

const customizing = ref(false)
const ACCENTS = [
  'oklch(0.69 0.2 42)',
  'oklch(0.7 0.13 264)',
  'oklch(0.72 0.15 150)',
  'oklch(0.62 0.2 22)',
  'oklch(0.68 0.16 300)',
  'oklch(0.72 0.12 195)',
]
const RADII = Object.keys(RADIUS_PRESETS) as (keyof typeof RADIUS_PRESETS)[]
const DENSITIES = Object.keys(DENSITY_PRESETS) as (keyof typeof DENSITY_PRESETS)[]
const FONTS = Object.keys(FONT_PRESETS) as (keyof typeof FONT_PRESETS)[]
</script>

<template>
  <section class="max-w-2xl space-y-6">
    <PaneHeader
      eyebrow="Appearance"
      title="Theme"
      description="Pick a theme. Changes apply instantly across every window."
    />

    <div v-for="g in grouped" :key="g.key" class="space-y-2">
      <p class="field-label">{{ g.label }}</p>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button
          v-for="t in g.themes"
          :key="t.id"
          type="button"
          data-test="theme-card"
          :data-theme-id="t.id"
          :aria-pressed="t.id === activeId ? 'true' : 'false'"
          class="group flex flex-col gap-2 rounded-md border border-border p-2 text-left transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary"
          :class="t.id === activeId ? 'ring-2 ring-primary' : ''"
          @click="setTheme(t.id)"
        >
          <span
            aria-hidden="true"
            class="relative flex h-12 items-center gap-1.5 overflow-hidden rounded px-2"
            :style="{ background: t.swatch.bg }"
          >
            <span class="h-6 w-8 rounded-sm" :style="{ background: t.swatch.surface }" />
            <span class="text-xs" :style="{ color: t.swatch.fg }">Aa</span>
            <span class="ml-auto h-3 w-3 rounded-full" :style="{ background: t.swatch.accent }" />
          </span>
          <span class="text-2xs font-medium text-foreground">{{ t.name }}</span>
        </button>
      </div>
    </div>

    <div class="space-y-3 border-t border-border pt-4">
      <button
        type="button"
        data-test="customize-toggle"
        class="field-label flex items-center gap-1"
        :aria-expanded="customizing"
        @click="customizing = !customizing"
      >
        Customize
      </button>

      <div v-if="customizing" class="space-y-4">
        <div class="space-y-1.5">
          <p class="field-label">Accent</p>
          <div class="flex gap-1.5">
            <button
              v-for="a in ACCENTS"
              :key="a"
              type="button"
              data-test="accent-swatch"
              class="h-6 w-6 rounded-full border border-border focus-visible:ring-2 focus-visible:ring-primary"
              :style="{ background: a }"
              :aria-pressed="overrides.accent === a ? 'true' : 'false'"
              :aria-label="`Accent ${a}`"
              @click="setOverride({ accent: a })"
            />
          </div>
        </div>

        <div class="space-y-1.5">
          <p class="field-label">Radius</p>
          <div class="flex gap-1">
            <button
              v-for="r in RADII"
              :key="r"
              type="button"
              :data-test="`radius-${r}`"
              class="rounded border border-border px-2 py-1 text-2xs capitalize focus-visible:ring-2 focus-visible:ring-primary"
              :class="overrides.radius === r ? 'bg-accent text-accent-foreground' : ''"
              @click="setOverride({ radius: r })"
            >
              {{ r }}
            </button>
          </div>
        </div>

        <div class="space-y-1.5">
          <p class="field-label">Density</p>
          <div class="flex gap-1">
            <button
              v-for="d in DENSITIES"
              :key="d"
              type="button"
              :data-test="`density-${d}`"
              class="rounded border border-border px-2 py-1 text-2xs capitalize focus-visible:ring-2 focus-visible:ring-primary"
              :class="overrides.density === d ? 'bg-accent text-accent-foreground' : ''"
              @click="setOverride({ density: d })"
            >
              {{ d }}
            </button>
          </div>
        </div>

        <div class="space-y-1.5">
          <p class="field-label">Font</p>
          <div class="flex gap-1">
            <button
              v-for="f in FONTS"
              :key="f"
              type="button"
              :data-test="`font-${f}`"
              class="rounded border border-border px-2 py-1 text-2xs capitalize focus-visible:ring-2 focus-visible:ring-primary"
              :class="overrides.font === f ? 'bg-accent text-accent-foreground' : ''"
              @click="setOverride({ font: f })"
            >
              {{ f }}
            </button>
          </div>
        </div>

        <button
          type="button"
          data-test="reset-overrides"
          class="text-2xs text-muted-foreground underline-offset-2 hover:underline"
          @click="reset()"
        >
          Reset to theme defaults
        </button>
      </div>
    </div>
  </section>
</template>
