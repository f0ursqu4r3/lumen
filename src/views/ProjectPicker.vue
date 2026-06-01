<script setup lang="ts">
import { ref } from 'vue'
import { useProjects } from '@/composables/useProjects'
import ErrorNotice from '@/components/ErrorNotice.vue'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const search = ref('')
const { data: projects, isLoading, error } = useProjects(search)
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-lg font-semibold">Projects</h1>
    <Input v-model="search" type="search" placeholder="Search projects…" />
    <ErrorNotice v-if="error" :error="error" />
    <div v-else-if="isLoading" class="space-y-2">
      <Skeleton v-for="i in 4" :key="i" class="h-10 w-full" />
    </div>
    <template v-else>
      <Card v-if="projects?.length" class="divide-y py-0">
        <RouterLink
          v-for="p in projects"
          :key="p.id"
          :to="{ name: 'issues', params: { fullPath: p.fullPath } }"
          class="flex items-baseline gap-2 px-4 py-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent"
        >
          <span class="font-medium">{{ p.name }}</span>
          <span class="text-xs text-muted-foreground">{{ p.fullPath }}</span>
        </RouterLink>
      </Card>
      <p v-else class="text-sm text-muted-foreground">No projects.</p>
    </template>
  </section>
</template>
