<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useAttrs, watch } from 'vue'
import { Paperclip } from '@lucide/vue'
import { Avatar, AvatarFallback } from '@/shared/ui/avatar'
import { Textarea } from '@/shared/ui/textarea'
import { useTextareaAttach } from '@/features/issues/composables/useTextareaAttach'
import type { ProjectMember } from '@/features/projects/composables/useProjectMembers'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  members: ProjectMember[]
  fullPath?: string
}>()
const emit = defineEmits<{ 'open-change': [value: boolean] }>()

const text = defineModel<string>({ required: true })
const attrs = useAttrs()
const textarea = ref<{ $el: HTMLTextAreaElement } | null>(null)
const active = ref(0)
const cursor = ref(0)

// fullPath is read non-reactively: each editor mounts a fresh instance, so it
// never changes for a live component — no need to watch it.
const attach = props.fullPath ? useTextareaAttach(props.fullPath, text, () => cursor.value) : null
const attachInput = ref<HTMLInputElement | null>(null)
onMounted(() => {
  if (attach) attach.fileInput.value = attachInput.value
})

function mentionRange(value: string, at: number) {
  const before = value.slice(0, at)
  const start = before.lastIndexOf('@')
  if (start === -1) return null
  const token = before.slice(start + 1)
  if (/\s/.test(token) || /[()[\]{}<>]/.test(token)) return null
  return { start, token }
}

const match = computed(() => mentionRange(text.value, cursor.value))
const suggestions = computed(() => {
  if (!match.value) return []
  const q = match.value.token.toLowerCase()
  return props.members
    .filter((member) => {
      const username = member.username.toLowerCase()
      const name = member.name.toLowerCase()
      return username.includes(q) || name.includes(q)
    })
    .slice(0, 6)
})

const open = computed(() => !!match.value && suggestions.value.length > 0)

watch(open, (value) => emit('open-change', value))
onUnmounted(() => emit('open-change', false))

function syncCursor(event?: Event) {
  const el = (event?.target as HTMLTextAreaElement | null) ?? textarea.value?.$el
  cursor.value = el?.selectionStart ?? text.value.length
}

function initials(member: ProjectMember) {
  const src = (member.name || member.username || '?').trim()
  const parts = src.split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase()
}

async function choose(member: ProjectMember) {
  if (!match.value) return
  const before = text.value.slice(0, match.value.start)
  const after = text.value.slice(cursor.value)
  const insert = `@${member.username} `
  text.value = `${before}${insert}${after}`
  const nextCursor = before.length + insert.length
  cursor.value = nextCursor
  await nextTick()
  const el = textarea.value?.$el
  el?.focus()
  el?.setSelectionRange(nextCursor, nextCursor)
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = Math.min(active.value + 1, suggestions.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = Math.max(active.value - 1, 0)
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    void choose(suggestions.value[active.value])
  } else if (event.key === 'Escape') {
    event.stopPropagation()
    cursor.value = 0
  }
}
</script>

<template>
  <div class="relative">
    <Textarea
      v-bind="attrs"
      ref="textarea"
      v-model="text"
      :class="attach?.dragging.value ? 'ring-2 ring-primary/60' : ''"
      @click="syncCursor"
      @keyup="syncCursor"
      @select="syncCursor"
      @keydown="onKeydown"
      @paste="attach?.onPaste"
      @dragover="attach?.onDragOver"
      @dragleave="attach?.onDragLeave"
      @drop="attach?.onDrop"
    />

    <div v-if="attach" class="mt-1.5 flex items-center gap-2">
      <input ref="attachInput" type="file" multiple class="hidden" @change="attach.onPick" />
      <button
        type="button"
        data-testid="attach-file"
        class="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:underline"
        @click="attach.openPicker"
      >
        <Paperclip class="size-3.5" />
        Attach file
      </button>
    </div>

    <div
      v-if="open"
      class="absolute right-0 bottom-full left-0 z-50 mb-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-1 text-popover-foreground shadow-[0_18px_48px_-18px_oklch(0_0_0/0.8)] ring-1 ring-border/80"
    >
      <button
        v-for="(member, index) in suggestions"
        :key="member.username"
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none"
        :class="index === active ? 'bg-accent' : ''"
        @mouseenter="active = index"
        @mousedown.prevent="choose(member)"
      >
        <Avatar class="size-6 text-2xs ring-1 ring-border/70">
          <AvatarFallback>{{ initials(member) }}</AvatarFallback>
        </Avatar>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-xs font-medium text-foreground">{{ member.name }}</span>
          <span class="block truncate font-mono text-2xs text-muted-foreground">
            @{{ member.username }}
          </span>
        </span>
      </button>
    </div>
  </div>
</template>
