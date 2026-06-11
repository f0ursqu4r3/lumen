<script setup lang="ts">
import { Star, CornerDownLeft } from '@lucide/vue'
import type { BrowserRow } from '@/features/projects/composables/useProjectBrowser'

defineProps<{
  row: BrowserRow
  index: number
  active: boolean
  nameStyle?: { viewTransitionName: string }
}>()
defineEmits<{
  'row-click': [e: MouseEvent]
  'toggle-star': []
  activate: []
}>()

// Split each path so the repo (final segment) reads as the name and the rest
// trails as muted mono context — same emphasis the issues header uses.
const namespace = (fullPath: string) => {
  const parts = fullPath.split('/')
  return parts.slice(0, -1).join('/')
}

// One-letter monogram for the launcher rows — a derived initial, consistent with
// the initials-only avatars elsewhere (no fetched icons). It lights orange on the
// active row, so the glyph doubles as the "this one launches" selection signal.
const monogram = (name: string) => name.trim().charAt(0).toUpperCase() || '?'
</script>

<template>
  <RouterLink
    data-row
    role="option"
    :aria-selected="active"
    :to="{ name: 'issues', params: { fullPath: row.fullPath } }"
    class="group relative z-10 flex animate-row-in items-center gap-3 rounded-lg py-2.5 pr-2.5 pl-3 outline-none"
    :style="{ animationDelay: `${Math.min(index, 14) * 26}ms` }"
    @mouseenter="$emit('activate')"
    @click="$emit('row-click', $event)"
    @focus="$emit('activate')"
  >
    <!-- Monogram: a derived initial that lights orange on the active row, so
       the glyph is also the "this one launches" signal. -->
    <span
      class="grid size-7 shrink-0 place-items-center rounded-md font-mono text-xs font-semibold ring-1 ring-inset transition-colors"
      :class="
        active
          ? 'bg-primary/15 text-primary ring-primary/30'
          : 'bg-muted/60 text-muted-foreground ring-border/60'
      "
    >
      {{ monogram(row.name) }}
    </span>

    <span class="flex min-w-0 flex-1 items-baseline gap-2">
      <span
        class="shrink-0 text-base font-medium tracking-tight transition-colors"
        :class="active ? 'text-foreground' : 'text-foreground/90'"
        :style="nameStyle"
      >
        {{ row.name }}
      </span>
      <span
        v-if="namespace(row.fullPath)"
        class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground/55"
      >
        {{ namespace(row.fullPath) }}/
      </span>
    </span>

    <!-- Right cluster: assigned count, the star toggle, then the Enter
       affordance + quick-jump keycap for the first nine rows. -->
    <span class="flex shrink-0 items-center gap-1.5">
      <span
        v-if="row.assignedOpen"
        class="mr-0.5 font-mono text-2xs tabular-nums text-muted-foreground/65"
      >
        {{ row.assignedOpen }} open
      </span>

      <button
        type="button"
        :aria-label="row.starred ? `Unstar ${row.name}` : `Star ${row.name}`"
        :aria-pressed="row.starred"
        class="relative z-10 grid size-7 place-items-center rounded-md outline-none transition-colors focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60"
        :class="
          row.starred
            ? 'text-primary'
            : active
              ? 'text-muted-foreground/50 hover:text-foreground'
              : 'text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-foreground'
        "
        @click.stop.prevent="$emit('toggle-star')"
      >
        <Star class="size-4" :fill="row.starred ? 'currentColor' : 'none'" :stroke-width="2" />
      </button>

      <CornerDownLeft
        class="size-3.5 text-primary transition-opacity duration-150"
        :class="active ? 'opacity-100' : 'opacity-0'"
      />
      <kbd
        v-if="index < 9"
        class="grid h-5 min-w-5 place-items-center rounded border px-1 font-mono text-micro tabular-nums transition-colors"
        :class="
          active
            ? 'border-border bg-muted/60 text-muted-foreground'
            : 'border-border/50 text-muted-foreground/40'
        "
      >
        {{ index + 1 }}
      </kbd>
    </span>
  </RouterLink>
</template>
