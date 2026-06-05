<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Check, Search, UserPlus } from '@lucide/vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { ProjectMember } from '@/composables/useProjectMembers'

const props = withDefaults(
  defineProps<{ members: ProjectMember[]; modelValue: string | null; label?: string }>(),
  { label: 'Assignee' },
)
const emit = defineEmits<{ 'update:modelValue': [id: string | null] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const query = ref('')
const search = ref<HTMLInputElement | null>(null)
onClickOutside(root, () => (open.value = false))

// Reset the filter on close; focus it on open so typing narrows immediately.
watch(open, async (isOpen) => {
  if (!isOpen) {
    query.value = ''
    return
  }
  await nextTick()
  search.value?.focus()
})

const current = computed(() => props.members.find((m) => m.id === props.modelValue) ?? null)

// Roster reads best alphabetically by display name, falling back to username.
const sortedMembers = computed(() =>
  [...props.members].sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username)),
)

const filteredMembers = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return sortedMembers.value
  return sortedMembers.value.filter(
    (m) => (m.name ?? '').toLowerCase().includes(q) || m.username.toLowerCase().includes(q),
  )
})

function select(id: string) {
  emit('update:modelValue', props.modelValue === id ? null : id)
  open.value = false
}
const initial = (m: ProjectMember) => (m.name || m.username).charAt(0).toUpperCase()
</script>

<template>
  <div ref="root" class="flex items-center justify-between gap-2">
    <span class="field-label">{{ label }}</span>
    <div class="relative">
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
        class="absolute right-0 z-50 mt-1 flex max-h-60 w-60 flex-col rounded-lg border border-border bg-popover p-1 shadow-md"
        @keydown.escape.stop="open = false"
      >
        <div class="relative mb-1 shrink-0">
          <Search
            class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref="search"
            v-model="query"
            type="text"
            data-testid="assignee-search"
            placeholder="Search members"
            class="w-full rounded-md border border-border bg-muted/40 py-1 pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          />
        </div>
        <div class="-mr-1 overflow-y-auto pr-1">
          <button
            v-for="m in filteredMembers"
            :key="m.id"
            type="button"
            :data-testid="`assignee-option-${m.username}`"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
            @click="select(m.id)"
          >
            <Avatar class="size-5 text-micro"
              ><AvatarFallback>{{ initial(m) }}</AvatarFallback></Avatar
            >
            <span class="flex-1 truncate text-foreground"
              >{{ m.name }} <span class="text-muted-foreground">@{{ m.username }}</span></span
            >
            <Check v-if="modelValue === m.id" class="size-3.5 text-primary" />
          </button>
          <p v-if="!filteredMembers.length" class="px-2 py-1.5 text-xs text-muted-foreground">
            No members found.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
