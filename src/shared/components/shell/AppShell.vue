<script setup lang="ts">
import AppIconRail from './AppIconRail.vue'
import AppTopBar from './AppTopBar.vue'
import AppStatusDock from './AppStatusDock.vue'
</script>

<template>
  <!-- The chrome dissolves: a slim rail sits in the (darkest) background gutter
       to the left and a dock along the bottom, with the view riding in an
       elevated, rounded panel inset from both — a floating instrument framed by
       background gutters, not bolted-on header + sidebar slabs. -->
  <div class="flex h-screen flex-col gap-1.5 overflow-hidden bg-background p-1.5 text-foreground">
    <div class="flex min-h-0 flex-1 gap-1.5">
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
    <AppStatusDock />
  </div>
</template>
