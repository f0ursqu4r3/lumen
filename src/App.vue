<script setup lang="ts"></script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <header
      class="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-md"
    >
      <div class="mx-auto flex h-13 max-w-5xl items-center px-4">
        <RouterLink
          to="/"
          class="group inline-flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <!-- Amber signal lamp — a quiet operational/telemetry nod. -->
          <span
            class="size-2 rounded-full bg-primary shadow-[0_0_8px_oklch(0.82_0.142_81/0.6)] transition-shadow group-hover:shadow-[0_0_12px_oklch(0.82_0.142_81/0.9)]"
          />
          <span class="font-mono lowercase">tragit</span>
        </RouterLink>
      </div>
    </header>
    <!-- Remount on every route (incl. param changes) so composables that
         capture route params at setup never go stale. -->
    <main class="mx-auto max-w-5xl px-4 py-6">
      <RouterView :key="$route.fullPath" />
    </main>
  </div>
</template>
