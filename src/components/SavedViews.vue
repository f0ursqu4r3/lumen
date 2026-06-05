<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { onClickOutside } from '@vueuse/core'
import { Bookmark, Check, ChevronDown, Pencil, Plus, Save, Trash2 } from '@lucide/vue'
import type { SavedView } from '@/composables/useSavedViews'

const props = defineProps<{
  views: SavedView[]
  /** id of the view whose query exactly matches the current one, or null. */
  activeId: string | null
  /** id of the view last loaded — drives the "update" affordance after edits. */
  loadedId: string | null
  /** Whether the current query has anything worth saving. */
  canSave: boolean
}>()
const emit = defineEmits<{
  apply: [view: SavedView]
  save: [name: string]
  update: [id: string]
  rename: [id: string, name: string]
  remove: [id: string]
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
onClickOutside(root, () => close())

// `null` = not editing; '' = creating; an id = renaming that view.
const editing = ref<string | null>(null)
const draft = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
// A function ref: the create field and the per-row rename field share one logical
// input (only one is ever mounted), but a v-for `ref="…"` would collect an array.
const setNameInput = (el: unknown) => {
  if (el) nameInput.value = el as HTMLInputElement
}

const loadedView = computed(() => props.views.find((v) => v.id === props.loadedId) ?? null)
// A view was loaded and then the filters were changed away from it.
const modified = computed(() => !!loadedView.value && loadedView.value.id !== props.activeId)

function close() {
  open.value = false
  editing.value = null
  draft.value = ''
}

function toggle() {
  if (open.value) close()
  else open.value = true
}

function apply(view: SavedView) {
  emit('apply', view)
  close()
}

async function beginEdit(id: string, initial: string) {
  editing.value = id
  draft.value = initial
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}

const beginCreate = () => beginEdit('', '')
const beginRename = (v: SavedView) => beginEdit(v.id, v.name)

function commit() {
  const name = draft.value.trim()
  if (!name) return
  if (editing.value === '') {
    emit('save', name)
    close()
  } else if (editing.value) {
    emit('rename', editing.value, name)
    editing.value = null
    draft.value = ''
  }
}
</script>

<template>
  <div ref="root" class="relative" @keydown.escape="close()">
    <button
      type="button"
      data-testid="views-trigger"
      :aria-expanded="open"
      class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      @click="toggle"
    >
      <Bookmark class="size-4" :class="activeId ? 'fill-primary text-primary' : ''" />
      <span :class="activeId ? 'text-foreground' : ''" class="max-w-32 truncate">
        {{ loadedView ? loadedView.name : 'Views' }}
      </span>
      <span
        v-if="modified"
        data-testid="views-modified"
        aria-label="Modified"
        class="size-1.5 rounded-full bg-primary"
      />
      <ChevronDown class="size-3.5 opacity-60" />
    </button>

    <div
      v-if="open"
      class="absolute z-50 mt-1 w-64 space-y-1 rounded-lg border border-border bg-popover p-1.5 shadow-md"
    >
      <p class="px-2 py-1 text-micro font-medium uppercase tracking-wide text-muted-foreground">
        Saved views
      </p>

      <div v-if="views.length" class="max-h-64 space-y-0.5 overflow-y-auto">
        <div
          v-for="v in views"
          :key="v.id"
          class="group flex items-center gap-1 rounded-md px-1 py-0.5 text-xs hover:bg-accent"
          :class="v.id === activeId ? 'bg-accent/60' : ''"
        >
          <!-- Inline rename -->
          <form
            v-if="editing === v.id"
            class="flex flex-1 items-center gap-1 py-0.5"
            @submit.prevent="commit"
          >
            <input
              :ref="setNameInput"
              v-model="draft"
              :data-testid="`view-rename-input-${v.id}`"
              type="text"
              maxlength="40"
              class="min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              @keydown.escape.stop="editing = null"
            />
            <button
              type="submit"
              :disabled="!draft.trim()"
              class="rounded bg-primary px-1.5 py-1 text-xs font-medium text-primary-foreground outline-none disabled:opacity-40"
            >
              Save
            </button>
          </form>

          <template v-else>
            <button
              type="button"
              :data-testid="`view-apply-${v.id}`"
              class="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left outline-none"
              @click="apply(v)"
            >
              <Check
                class="size-3.5 shrink-0"
                :class="v.id === activeId ? 'text-primary' : 'text-transparent'"
              />
              <span class="min-w-0 flex-1 truncate text-foreground">{{ v.name }}</span>
            </button>
            <button
              type="button"
              :data-testid="`view-rename-${v.id}`"
              aria-label="Rename view"
              class="grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60"
              @click.stop="beginRename(v)"
            >
              <Pencil class="size-3" />
            </button>
            <button
              type="button"
              :data-testid="`view-delete-${v.id}`"
              aria-label="Delete view"
              class="grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60"
              @click.stop="emit('remove', v.id)"
            >
              <Trash2 class="size-3.5" />
            </button>
          </template>
        </div>
      </div>
      <p v-else class="px-2 py-1.5 text-xs text-muted-foreground">No saved views yet.</p>

      <div class="space-y-0.5 border-t border-border pt-1.5">
        <!-- Create: inline name field -->
        <form v-if="editing === ''" class="flex items-center gap-1 px-1" @submit.prevent="commit">
          <input
            :ref="setNameInput"
            v-model="draft"
            data-testid="view-name-input"
            type="text"
            placeholder="View name…"
            maxlength="40"
            class="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          />
          <button
            type="submit"
            data-testid="view-save-confirm"
            :disabled="!draft.trim()"
            class="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40"
          >
            Save
          </button>
        </form>

        <template v-else>
          <!-- Update the loaded view in place, once its filters have drifted. -->
          <button
            v-if="modified"
            type="button"
            data-testid="view-update"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:bg-accent"
            @click="emit('update', loadedView!.id)"
          >
            <Save class="size-3.5" />
            <span class="min-w-0 flex-1 truncate">Update “{{ loadedView!.name }}”</span>
          </button>
          <button
            type="button"
            data-testid="view-save"
            :disabled="!canSave"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:bg-accent disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
            @click="beginCreate"
          >
            <Plus class="size-3.5" />
            {{ modified || activeId ? 'Save as new view' : 'Save current view' }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
