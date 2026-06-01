<script setup lang="ts"></script>

<template>
  <div class="min-h-screen bg-neutral-50 text-neutral-900">
    <header class="border-b border-neutral-200 px-4 py-3">
      <RouterLink to="/" class="font-semibold">tragit</RouterLink>
    </header>
    <main class="mx-auto max-w-5xl p-4">
      <RouterView />
    </main>
  </div>
</template>
