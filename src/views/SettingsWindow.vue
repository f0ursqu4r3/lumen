<script setup lang="ts">
import { computed } from 'vue'
import { SETTINGS_PANES, useSettingsNav } from '@/features/settings/useSettingsNav'

const { selected, select } = useSettingsNav()
const active = computed(
  () => SETTINGS_PANES.find((p) => p.id === selected.value) ?? SETTINGS_PANES[0],
)
</script>

<template>
  <div class="flex h-screen bg-background text-foreground">
    <nav class="flex w-52 shrink-0 flex-col gap-0.5 border-r border-border/60 bg-card/40 p-3">
      <p
        class="px-2.5 pb-2 font-mono text-2xs font-semibold tracking-[0.14em] text-muted-foreground uppercase"
      >
        Settings
      </p>
      <button
        v-for="pane in SETTINGS_PANES"
        :key="pane.id"
        data-testid="settings-nav-item"
        type="button"
        class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors"
        :class="
          pane.id === selected
            ? 'bg-primary/12 text-foreground shadow-[inset_2px_0_0_var(--primary)]'
            : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
        "
        @click="select(pane.id)"
      >
        <component :is="pane.icon" class="size-4 shrink-0" />
        {{ pane.label }}
      </button>
    </nav>

    <main class="min-w-0 flex-1 overflow-y-auto px-7 py-6">
      <component :is="active.component" />
    </main>
  </div>
</template>
