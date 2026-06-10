<script setup lang="ts">
import { useRoute } from 'vue-router'
import { House, FolderGit2, Search, Settings } from '@lucide/vue'
import { useCommandPalette } from '@/shared/composables/useCommandPalette'
import { openSettings } from '@/shared/composables/useSettings'

const route = useRoute()
const { open: openPalette } = useCommandPalette()

// Lift the icon to the panel surface on hover; the active global view holds a
// quiet lit state (foreground glyph on a faint card tile) — no amber here, the
// accent stays reserved for the primary action + signal dot.
const tile =
  'flex size-9 items-center justify-center rounded-lg text-muted-foreground/80 outline-none transition-colors hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50'
const activeTile = 'bg-card text-foreground'
</script>

<template>
  <nav
    class="flex h-full w-12 shrink-0 flex-col items-center gap-1 py-1"
    aria-label="Global navigation"
  >
    <RouterLink
      :to="{ name: 'home' }"
      :class="[tile, route.name === 'home' && activeTile]"
      title="My Work"
      aria-label="My Work"
    >
      <House class="size-5" />
    </RouterLink>
    <RouterLink
      :to="{ name: 'projects' }"
      :class="[tile, route.name === 'projects' && activeTile]"
      title="Projects"
      aria-label="Projects"
    >
      <FolderGit2 class="size-5" />
    </RouterLink>
    <button
      type="button"
      data-testid="rail-search"
      :class="tile"
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
      :class="tile"
      title="Settings"
      aria-label="Settings"
      @click="openSettings()"
    >
      <Settings class="size-5" />
    </button>
  </nav>
</template>
