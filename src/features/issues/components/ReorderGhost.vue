<script setup lang="ts">
defineProps<{
  label: string
  color?: string | null
  count: number
  x: number
  y: number
}>()
</script>

<template>
  <Teleport to="body">
    <div
      data-testid="reorder-ghost"
      aria-hidden="true"
      class="reorder-ghost pointer-events-none fixed top-0 left-0 z-50 flex items-center gap-2 rounded-lg border border-primary/55 bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-pop"
      :style="{ transform: `translate(${x + 12}px, ${y + 14}px)` }"
    >
      <span
        v-if="color"
        data-testid="ghost-dot"
        class="size-2 shrink-0 rounded-full"
        :style="{ backgroundColor: color }"
      />
      <span class="max-w-44 truncate">{{ label }}</span>
      <span
        class="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-2xs tabular-nums text-muted-foreground/80"
      >
        {{ count }}
      </span>
    </div>
  </Teleport>
</template>

<style scoped>
.reorder-ghost {
  animation: reorder-ghost-in 120ms ease-out;
}
@keyframes reorder-ghost-in {
  from {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .reorder-ghost {
    animation: none;
  }
}
</style>
