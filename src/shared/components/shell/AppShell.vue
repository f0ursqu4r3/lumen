<script setup lang="ts">
import AppIconRail from './AppIconRail.vue'
import AppTopBar from './AppTopBar.vue'
</script>

<template>
  <!-- The chrome dissolves: a slim rail sits in the (darkest) background gutter,
       and the view rides in an elevated, rounded panel inset from it — reads as a
       floating instrument rather than bolted-on header + sidebar slabs. -->
  <div class="flex h-screen gap-1.5 overflow-hidden bg-background p-1.5 text-foreground">
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
</template>
