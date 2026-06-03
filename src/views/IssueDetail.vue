<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { useTitle } from '@vueuse/core'
import { onBeforeRouteLeave } from 'vue-router'
import { useIssue } from '@/composables/useIssue'
import { useIssueDraft } from '@/composables/useIssueDraft'
import { useProjectMembers } from '@/composables/useProjectMembers'
import { useProjectLabels } from '@/composables/useProjectLabels'
import { useConfirm } from '@/composables/useConfirm'
import QuickAssign from '@/components/QuickAssign.vue'
import AssigneeEditor from '@/components/AssigneeEditor.vue'
import LabelPicker from '@/components/LabelPicker.vue'
import StateBadge from '@/components/StateBadge.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import MarkdownText from '@/components/MarkdownText.vue'
import EditableField from '@/components/EditableField.vue'
import Scratchpad from '@/components/Scratchpad.vue'

const props = defineProps<{
  fullPath: string
  iid: string
  embedded?: boolean
}>()
const emit = defineEmits<{ 'update:dirty': [value: boolean] }>()

const { data: issue, isLoading, error } = useIssue(toRef(props, 'fullPath'), toRef(props, 'iid'))
const { data: members } = useProjectMembers(toRef(props, 'fullPath'))
const { data: labelCatalog } = useProjectLabels(toRef(props, 'fullPath'))
const draftApi = useIssueDraft(props.fullPath, props.iid, issue)
const { draft, comment, dirty, saving, save, reset, error: saveError } = draftApi
const { confirm } = useConfirm()

// Surface the dirty state to a host (the drawer) so it can guard closing.
watch(dirty, (v) => emit('update:dirty', v), { immediate: true })

// Convert label ids <-> titles for the LabelPicker (which works in titles).
const catalog = computed(() => labelCatalog.value ?? [])
const draftLabelTitles = computed<string[]>({
  get: () =>
    (draft.value?.labelIds ?? [])
      .map((id) => catalog.value.find((l) => l.id === id)?.title)
      .filter((t): t is string => !!t),
  set: (titles) => {
    if (!draft.value) return
    draft.value.labelIds = titles
      .map((t) => catalog.value.find((l) => l.title === t)?.id)
      .filter((id): id is string => !!id)
  },
})

const actionError = computed(() => saveError.value)

const notes = computed(
  () =>
    issue.value?.notes?.nodes?.filter((n): n is NonNullable<typeof n> => !!n && !n.system) ?? [],
)

if (!props.embedded) {
  useTitle(
    computed(() => (issue.value ? `#${issue.value.iid} ${issue.value.title} · lumen` : 'lumen')),
  )
}

function nameOrUsername(user?: { name?: string | null; username: string } | null) {
  return user?.name || `@${user?.username}` || '(deleted user)'
}
function toggleState() {
  if (!draft.value) return
  draft.value.state = draft.value.state === 'opened' ? 'closed' : 'opened'
}

const editingTitle = ref(false)
const editingDescription = ref(false)

// After a successful save (buffer cleared) collapse edited fields back to their
// rendered view; if the save failed (still dirty), stay in edit mode so unsaved
// changes are not hidden.
async function onSave() {
  await save()
  if (!dirty.value) {
    editingTitle.value = false
    editingDescription.value = false
  }
}
// Cancel discards the buffer and returns both fields to rendered.
function onCancel() {
  reset()
  editingTitle.value = false
  editingDescription.value = false
}

// Dirty guard on full-page navigation (the drawer handles its own close).
if (!props.embedded) {
  onBeforeRouteLeave(async () => {
    if (!dirty.value) return true
    return confirm({
      title: 'Discard unsaved changes?',
      description: "Your edits to this issue haven't been saved.",
    })
  })
}
</script>

<template>
  <ErrorNotice v-if="error" :error="error" />
  <div v-else-if="isLoading" class="space-y-3">
    <Skeleton class="h-7 w-2/3" />
    <Skeleton class="h-24 w-full" />
  </div>
  <article v-else-if="issue && draft" class="space-y-4 pb-20">
    <header class="flex items-center gap-2">
      <StateBadge :state="draft.state" />
      <span class="font-mono text-sm text-muted-foreground"> #{{ issue.iid }} </span>
      <Button
        type="button"
        data-testid="toggle-state"
        variant="outline"
        size="sm"
        class="ml-auto"
        @click="toggleState"
      >
        {{ draft.state === 'opened' ? 'Close issue' : 'Reopen issue' }}
      </Button>
    </header>

    <EditableField v-model:editing="editingTitle" label="Title" toggle-testid="edit-title-toggle">
      <template #label>
        <h2 class="text-sm font-semibold">Title</h2>
      </template>
      <template #view>
        <h1 class="text-lg font-semibold text-foreground">{{ draft.title }}</h1>
      </template>
      <template #edit>
        <Input
          v-model="draft.title"
          data-testid="edit-title"
          aria-label="Issue title"
          class="text-lg font-semibold"
        />
      </template>
    </EditableField>

    <p class="text-xs text-muted-foreground">
      Opened by
      <span class="font-medium text-foreground">
        {{ nameOrUsername(issue.author) }}
      </span>
      · {{ new Date(issue.createdAt).toLocaleString() }}
    </p>

    <ErrorNotice v-if="actionError" :error="actionError" />

    <section class="space-y-2">
      <EditableField
        v-model:editing="editingDescription"
        label="Description"
        toggle-testid="edit-description-toggle"
      >
        <template #label>
          <h2 class="text-sm font-semibold">Description</h2>
        </template>
        <template #view>
          <MarkdownText
            v-if="draft.description.trim()"
            :source="draft.description"
            :project-path="fullPath"
            class="text-sm"
          />
          <p v-else class="text-sm text-muted-foreground">No description</p>
        </template>
        <template #edit>
          <Textarea
            v-model="draft.description"
            :rows="6"
            aria-label="Issue description"
            placeholder="Add a description…"
          />
        </template>
      </EditableField>
    </section>

    <LabelPicker v-model="draftLabelTitles" :catalog="catalog" />

    <AssigneeEditor
      v-model:usernames="draft.assigneeUsernames"
      :issue="issue"
      :members="members ?? []"
    />
    <QuickAssign
      v-model:usernames="draft.assigneeUsernames"
      :issue="issue"
      :members="members ?? []"
    />
    <p v-if="issue.milestone" class="text-xs text-muted-foreground">
      Milestone: {{ issue.milestone.title }}
    </p>

    <section class="space-y-3">
      <h2 class="text-sm font-semibold">Notes</h2>
      <Card v-for="n in notes" :key="n.id" class="py-0">
        <CardContent class="px-3 py-2 text-sm">
          <span class="font-medium">{{ nameOrUsername(n.author) }}</span>
          <span class="ml-2 text-xs text-muted-foreground">
            {{ new Date(n.createdAt).toLocaleString() }}
          </span>
          <MarkdownText :source="n.body" :project-path="fullPath" class="mt-1" />
        </CardContent>
      </Card>
      <Textarea
        v-model="comment"
        :rows="3"
        placeholder="Add a comment…"
        aria-label="Add a comment"
      />
    </section>
    <Scratchpad :full-path="fullPath" :iid="iid" />

    <!-- Sticky Save/Cancel — only while there are unsaved edits. -->
    <div
      v-if="dirty"
      class="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur"
    >
      <Button
        type="button"
        data-testid="cancel-issue"
        variant="ghost"
        :disabled="saving"
        @click="onCancel"
      >
        Cancel
      </Button>
      <Button type="button" data-testid="save-issue" :disabled="saving" @click="onSave">
        {{ saving ? 'Saving…' : 'Save changes' }}
      </Button>
    </div>
  </article>
  <p v-else class="text-sm text-muted-foreground">Issue not found.</p>
</template>
