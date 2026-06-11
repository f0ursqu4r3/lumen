<script setup lang="ts">
import { computed } from 'vue'
import PaneHeader from './PaneHeader.vue'
import { THEMES, type ThemeGroup } from '@/shared/theme/themes'
import { useTheme } from '@/shared/theme/useTheme'

const { themeId, setTheme } = useTheme()

const GROUPS: { key: ThemeGroup; label: string }[] = [
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
  { key: 'bold', label: 'Bold' },
]
const grouped = computed(() =>
  GROUPS.map((g) => ({ ...g, themes: THEMES.filter((t) => t.group === g.key) })),
)

const activeId = computed(() => themeId.value)
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
          class="group flex flex-col gap-2 rounded-md border border-border p-2 text-left transition-colors hover:border-primary/60"
          :class="t.id === activeId ? 'ring-2 ring-primary' : ''"
          @click="setTheme(t.id)"
        >
          <span
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
  </section>
</template>
