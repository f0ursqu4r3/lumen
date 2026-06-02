<script setup lang="ts">
import { computed, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Check, UserPlus } from '@lucide/vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { ProjectMember } from '@/composables/useProjectMembers'

const props = defineProps<{ members: ProjectMember[]; modelValue: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [id: string | null] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => (open.value = false))

const current = computed(() => props.members.find((m) => m.id === props.modelValue) ?? null)

function select(id: string) {
  emit('update:modelValue', props.modelValue === id ? null : id)
  open.value = false
}
const initial = (m: ProjectMember) => (m.name || m.username).charAt(0).toUpperCase()
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      data-testid="assignee-picker-trigger"
      class="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      @click="open = !open"
    >
      <UserPlus class="size-3.5" />
      <span v-if="current" class="font-mono text-foreground">@{{ current.username }}</span>
      <span v-else>Assignee</span>
    </button>

    <div
      v-if="open"
      class="absolute z-50 mt-1 max-h-60 w-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
    >
      <button
        v-for="m in members"
        :key="m.id"
        type="button"
        :data-testid="`assignee-option-${m.username}`"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
        @click="select(m.id)"
      >
        <Avatar class="size-5 text-[10px]"><AvatarFallback>{{ initial(m) }}</AvatarFallback></Avatar>
        <span class="flex-1 truncate text-foreground">{{ m.name }} <span class="text-muted-foreground">@{{ m.username }}</span></span>
        <Check v-if="modelValue === m.id" class="size-3.5 text-primary" />
      </button>
      <p v-if="!members.length" class="px-2 py-1.5 text-xs text-muted-foreground">
        No members found.
      </p>
    </div>
  </div>
</template>
