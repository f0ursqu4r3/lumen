<script setup lang="ts">
import AppIconRail from './AppIconRail.vue'
import AppTopBar from './AppTopBar.vue'
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-background text-foreground">
    <AppIconRail />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopBar />
      <div class="flex-1 overflow-y-auto overflow-x-clip">
        <slot />
      </div>
    </div>
  </div>
</template>
