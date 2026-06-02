<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Plus, LoaderCircle, ChevronDown } from '@lucide/vue'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import ErrorNotice from './ErrorNotice.vue'
import LabelPicker from './LabelPicker.vue'
import AssigneePicker from './AssigneePicker.vue'
import { useCreateIssue } from '@/composables/useIssueMutations'
import { useProjectLabels } from '@/composables/useProjectLabels'
import { useProjectMembers } from '@/composables/useProjectMembers'

const props = defineProps<{ open: boolean; fullPath: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; created: [iid: string] }>()

const fullPathRef = computed(() => props.fullPath)
const { data: labels } = useProjectLabels(fullPathRef)
const { data: members } = useProjectMembers(fullPathRef)
const create = useCreateIssue(props.fullPath)

const title = ref('')
const description = ref('')
const selectedLabels = ref<string[]>([])
const assigneeId = ref<string | null>(null)
const showDetails = ref(false)

const titleInput = ref<{ $el: HTMLInputElement } | null>(null)

// Reset and refocus each time the sheet opens, so it always starts clean.
watch(
  () => props.open,
  (open) => {
    if (!open) return
    title.value = ''
    description.value = ''
    selectedLabels.value = []
    assigneeId.value = null
    showDetails.value = false
    nextTick(() => titleInput.value?.$el?.focus())
  },
)

const canSubmit = computed(() => !!title.value.trim() && !create.isPending.value)

function submit() {
  if (!title.value.trim()) return
  const input: {
    title: string
    description?: string
    labels?: string[]
    assigneeIds?: string[]
  } = { title: title.value.trim() }
  if (description.value.trim()) input.description = description.value.trim()
  if (selectedLabels.value.length) input.labels = selectedLabels.value
  if (assigneeId.value) input.assigneeIds = [assigneeId.value]

  create.mutate(input, {
    onSuccess: (data) => {
      if (data?.issue?.iid) emit('created', data.issue.iid)
      emit('update:open', false)
    },
  })
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-[480px]">
      <SheetHeader class="border-b px-4 py-3">
        <SheetTitle class="text-sm">New issue</SheetTitle>
        <SheetDescription class="sr-only">Create a new issue in this project</SheetDescription>
      </SheetHeader>

      <form
        data-testid="composer-form"
        class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4"
        @submit.prevent="submit"
      >
        <Input
          ref="titleInput"
          v-model="title"
          data-testid="composer-title"
          placeholder="Issue title…"
          aria-label="Issue title"
        />
        <Textarea
          v-model="description"
          data-testid="composer-description"
          placeholder="Description (optional)…"
          aria-label="Issue description"
          class="min-h-28"
        />

        <button
          v-if="!showDetails"
          type="button"
          data-testid="composer-add-details"
          class="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:underline"
          @click="showDetails = true"
        >
          <ChevronDown class="size-3.5" />
          Add details
        </button>

        <div v-else class="flex flex-col gap-3">
          <LabelPicker v-model="selectedLabels" :catalog="labels ?? []" />
          <AssigneePicker v-model="assigneeId" :members="members ?? []" />
        </div>

        <ErrorNotice v-if="create.error.value" :error="create.error.value" />

        <div class="mt-auto flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" @click="emit('update:open', false)">Cancel</Button>
          <Button type="submit" data-testid="composer-submit" :disabled="!canSubmit">
            <LoaderCircle v-if="create.isPending.value" class="animate-spin" />
            <Plus v-else />
            Create
          </Button>
        </div>
      </form>
    </SheetContent>
  </Sheet>
</template>
