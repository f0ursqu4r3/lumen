<script setup lang="ts">
import { computed } from 'vue'
import { House, FolderGit2, Search, Settings, Circle } from '@lucide/vue'
import { useCommandPalette } from '@/shared/composables/useCommandPalette'
import { openSettings } from '@/shared/composables/useSettings'
import { sessionState } from '@/shared/composables/useSession'

const { open: openPalette } = useCommandPalette()
const connectionClass = computed(() =>
  sessionState.unavailable ? 'text-amber-400' : 'text-emerald-400',
)

const linkClass =
  'flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50'
</script>

<template>
  <nav
    class="flex h-full w-14 shrink-0 flex-col items-center gap-1.5 border-r border-border bg-card/40 py-3"
    aria-label="Global navigation"
  >
    <RouterLink :to="{ name: 'home' }" :class="linkClass" title="My Work" aria-label="My Work">
      <House class="size-5" />
    </RouterLink>
    <RouterLink
      :to="{ name: 'projects' }"
      :class="linkClass"
      title="Projects"
      aria-label="Projects"
    >
      <FolderGit2 class="size-5" />
    </RouterLink>
    <button
      type="button"
      data-testid="rail-search"
      :class="linkClass"
      title="Search (⌘K)"
      aria-label="Search"
      @click="openPalette()"
    >
      <Search class="size-5" />
    </button>

    <div class="flex-1" />

    <button
      type="button"
      data-testid="rail-settings"
      :class="linkClass"
      title="Settings"
      aria-label="Settings"
      @click="openSettings()"
    >
      <Settings class="size-5" />
    </button>
    <span
      data-testid="rail-connection"
      class="flex size-9 items-center justify-center"
      :class="connectionClass"
      :title="sessionState.unavailable ? 'Reconnecting…' : 'Connected'"
    >
      <Circle class="size-2.5 fill-current" />
    </span>
  </nav>
</template>
