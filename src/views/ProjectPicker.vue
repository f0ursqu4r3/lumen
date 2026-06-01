<script setup lang="ts">
import { ref } from 'vue'
import { useProjects } from '@/composables/useProjects'
import ErrorNotice from '@/components/ErrorNotice.vue'

const search = ref('')
const { data: projects, isLoading, error } = useProjects(search)
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-lg font-semibold">Projects</h1>
    <input
      v-model="search"
      type="search"
      placeholder="Search projects…"
      class="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
    />
    <ErrorNotice v-if="error" :error="error" />
    <p v-else-if="isLoading" class="text-sm text-neutral-500">Loading…</p>
    <template v-else>
      <ul
        v-if="projects?.length"
        class="divide-y divide-neutral-200 rounded border border-neutral-200"
      >
        <li v-for="p in projects" :key="p.id">
          <RouterLink
            :to="{ name: 'issues', params: { fullPath: p.fullPath } }"
            class="block px-3 py-2 hover:bg-neutral-100"
          >
            <span class="font-medium">{{ p.name }}</span>
            <span class="ml-2 text-xs text-neutral-500">{{ p.fullPath }}</span>
          </RouterLink>
        </li>
      </ul>
      <p v-else class="text-sm text-neutral-500">No projects.</p>
    </template>
  </section>
</template>
