<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'
import { Alert, AlertDescription } from '@/shared/ui/alert'
import type { GitLabError } from '@/gitlab/errors'

defineProps<{ error: GitLabError }>()
</script>

<template>
  <Alert variant="destructive">
    <CircleAlert />
    <AlertDescription>{{ error.message }}</AlertDescription>
  </Alert>
</template>
