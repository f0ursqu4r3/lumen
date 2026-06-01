<script setup lang="ts">
import type { GitLabError } from '@/gitlab/errors'
defineProps<{ error: GitLabError }>()
</script>

<template>
  <div role="alert" class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
    {{ error.message }}
  </div>
</template>
