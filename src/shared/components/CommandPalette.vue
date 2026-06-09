<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onKeyStroke } from '@vueuse/core'
import { Loader2, Search, X } from '@lucide/vue'
import { usePaletteCommands } from '@/features/palette/composables/usePaletteCommands'
import type { Command } from '@/features/palette/lib/types'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { useCommandPalette } from '@/shared/composables/useCommandPalette'

const { isOpen: open } = useCommandPalette()
const query = ref('')
const active = ref(0)
const input = ref<{ $el: HTMLInputElement } | null>(null)

const { groups, flat, isSearching } = usePaletteCommands(query)

// Map a command to its position in the single flat list so arrow nav walks
// across section headers. Precomputed so the per-item lookups in the render
// (highlight + aria-selected) stay O(1).
const indexById = computed(() => new Map(flat.value.map((c, i) => [c.id, i])))
const indexOf = (command: Command) => indexById.value.get(command.id) ?? -1

// Listbox option ids: the combobox input points aria-activedescendant at the
// active option so screen readers announce the highlighted command on arrow nav.
const optionId = (command: Command) => `palette-option-${command.id}`
const activeId = computed(() => {
  const command = flat.value[active.value]
  return command ? optionId(command) : undefined
})

// Keep the highlighted option in view as keyboard nav moves it past the fold.
// The Dialog teleports to <body>, so resolve the option by id off the document.
watch(activeId, async (id) => {
  if (!id) return
  await nextTick()
  document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
})

watch(open, async (value) => {
  if (!value) return
  query.value = ''
  active.value = 0
  await nextTick()
  input.value?.$el?.focus()
})

watch(flat, () => {
  active.value = Math.min(active.value, Math.max(flat.value.length - 1, 0))
})

onKeyStroke('k', (event) => {
  if (!(event.metaKey || event.ctrlKey)) return
  event.preventDefault()
  open.value = true
})

function close() {
  open.value = false
}

function run(command: Command | undefined) {
  if (!command) return
  command.action()
  close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = Math.min(active.value + 1, flat.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = Math.max(active.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    run(flat.value[active.value])
  }
}

const hasResults = computed(() => flat.value.length > 0)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent hide-close class="top-[18%] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0">
      <DialogTitle class="sr-only">Command palette</DialogTitle>
      <DialogDescription class="sr-only">
        Search projects, issues, saved views, and run common Lumen commands.
      </DialogDescription>

      <div class="flex items-center gap-2 border-b border-border px-4 py-3">
        <Search class="size-4 shrink-0 text-muted-foreground" />
        <Input
          ref="input"
          v-model="query"
          type="search"
          placeholder="Search projects, issues, views, or #issue…"
          aria-label="Search commands"
          role="combobox"
          aria-controls="palette-listbox"
          aria-expanded="true"
          :aria-activedescendant="activeId"
          class="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          @keydown="onKeydown"
        />
        <button
          type="button"
          aria-label="Close"
          class="shrink-0 rounded-sm text-muted-foreground opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
          @click="close"
        >
          <X class="size-4" />
        </button>
      </div>

      <div
        id="palette-listbox"
        role="listbox"
        aria-label="Commands"
        class="max-h-112 overflow-y-auto p-1.5"
      >
        <div v-for="section in groups" :key="section.group" class="mb-1 last:mb-0">
          <div
            class="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            {{ section.group }}
            <Loader2 v-if="section.group === 'Issues' && isSearching" class="size-3 animate-spin" />
          </div>
          <button
            v-for="command in section.items"
            :id="optionId(command)"
            :key="command.id"
            type="button"
            role="option"
            :aria-selected="indexOf(command) === active"
            class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none"
            :class="
              indexOf(command) === active ? 'bg-accent text-foreground' : 'text-muted-foreground'
            "
            @mouseenter="active = indexOf(command)"
            @click="run(command)"
          >
            <component :is="command.icon" class="size-4 shrink-0" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-foreground">
                {{ command.title }}
              </span>
              <span v-if="command.subtitle" class="block truncate font-mono text-xs">
                {{ command.subtitle }}
              </span>
            </span>
          </button>
        </div>

        <p
          v-if="!hasResults && !isSearching"
          class="px-3 py-8 text-center text-sm text-muted-foreground"
        >
          No commands found.
        </p>
      </div>

      <div
        class="flex items-center gap-3 border-t border-border px-4 py-2 font-mono text-xs text-muted-foreground"
      >
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>esc close</span>
      </div>
    </DialogContent>
  </Dialog>
</template>
