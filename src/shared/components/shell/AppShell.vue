<script setup lang="ts">
import AppIconRail from './AppIconRail.vue'
import AppTopBar from './AppTopBar.vue'
import ChassisBar from './ChassisBar.vue'
</script>

<template>
  <!-- The chassis bar spans the full window width as the custom titlebar (OS
       titlebar is hidden via hiddenInset). Below it, the rail sits in the
       background gutter and the view rides in an elevated, rounded panel. -->
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
