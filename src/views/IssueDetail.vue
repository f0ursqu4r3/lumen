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
import { ExternalLink } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
// Two-letter monogram for the discussion avatars (avatars are always initials here).
function initials(user?: { name?: string | null; username: string } | null) {
  const src = (user?.name || user?.username || '?').trim()
  const parts = src.split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase()
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
  <!-- Skeleton mirrors the real masthead + rail composition (same container/grid)
       so resolved content lands in place instead of reflowing. -->
  <div v-else-if="isLoading" class="issue" role="status" aria-busy="true">
    <span class="sr-only">Loading issue…</span>
    <header>
      <div class="flex items-center gap-2.5">
        <Skeleton class="h-5 w-16 rounded-full" />
        <Skeleton class="h-4 w-10" />
        <Skeleton class="ml-auto h-8 w-24 rounded-md" />
      </div>
      <Skeleton class="mt-4 h-8 w-3/4" />
      <Skeleton class="mt-3 h-3 w-48" />
    </header>

    <div class="issue__body mt-8">
      <section class="issue__desc min-w-0 space-y-2.5">
        <Skeleton class="h-2.5 w-20" />
        <Skeleton class="h-3.5 w-full" />
        <Skeleton class="h-3.5 w-[92%]" />
        <Skeleton class="h-3.5 w-[78%]" />
        <Skeleton class="h-3.5 w-[85%]" />
      </section>

      <aside class="issue__meta space-y-6">
        <div class="space-y-2">
          <Skeleton class="h-2.5 w-14" />
          <Skeleton class="h-6 w-24 rounded-md" />
        </div>
        <div class="space-y-2">
          <Skeleton class="h-2.5 w-20" />
          <Skeleton class="h-6 w-28 rounded-md" />
        </div>
        <div class="space-y-1.5">
          <Skeleton class="h-2.5 w-16" />
          <Skeleton class="h-4 w-20" />
        </div>
      </aside>

      <section class="issue__talk min-w-0 space-y-4">
        <Skeleton class="h-2.5 w-20" />
        <div class="flex gap-3">
          <Skeleton class="size-7 shrink-0 rounded-full" />
          <div class="flex-1 space-y-2">
            <Skeleton class="h-3 w-32" />
            <Skeleton class="h-3.5 w-full" />
            <Skeleton class="h-3.5 w-2/3" />
          </div>
        </div>
      </section>
    </div>
  </div>
  <article v-else-if="issue && draft" class="issue pb-20">
    <!-- Masthead: state · id · title · byline read as one tight identity unit. -->
    <header class="animate-row-in">
      <div class="flex items-center gap-2.5">
        <!-- Keyed by state so toggling open/closed re-triggers the quiet status flash. -->
        <StateBadge :key="draft.state" :state="draft.state" class="animate-status" />
        <span class="font-mono text-xs text-muted-foreground">#{{ issue.iid }}</span>
        <Button
          as="a"
          :href="issue.webUrl"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="open-in-gitlab"
          variant="ghost"
          size="sm"
          class="ml-auto text-muted-foreground"
        >
          <ExternalLink class="size-3.5" />
          Open in GitLab
        </Button>
        <Button
          type="button"
          data-testid="toggle-state"
          variant="outline"
          size="sm"
          @click="toggleState"
        >
          {{ draft.state === 'opened' ? 'Close issue' : 'Reopen issue' }}
        </Button>
      </div>

      <EditableField
        v-model:editing="editingTitle"
        label="Title"
        toggle-testid="edit-title-toggle"
        class="mt-4"
      >
        <template #label>
          <span class="field-label">Title</span>
        </template>
        <template #view>
          <h1 class="text-balance text-2xl font-semibold leading-tight tracking-tight">
            {{ draft.title }}
          </h1>
        </template>
        <template #edit>
          <Input
            v-model="draft.title"
            data-testid="edit-title"
            aria-label="Issue title"
            class="h-auto py-1.5 text-2xl font-semibold tracking-tight"
          />
        </template>
      </EditableField>

      <p class="mt-2.5 text-xs text-muted-foreground">
        Opened by
        <span class="font-medium text-foreground">{{ nameOrUsername(issue.author) }}</span>
        <span class="px-1 text-muted-foreground/50">·</span>
        <span class="font-mono">{{ new Date(issue.createdAt).toLocaleDateString() }}</span>
      </p>
    </header>

    <ErrorNotice v-if="actionError" :error="actionError" class="mt-4" />

    <div class="issue__body mt-8">
      <!-- Main column: the document. -->
      <section class="issue__desc min-w-0 animate-row-in" style="animation-delay: 60ms">
        <EditableField
          v-model:editing="editingDescription"
          label="Description"
          toggle-testid="edit-description-toggle"
        >
          <template #label>
            <span class="field-label">Description</span>
          </template>
          <template #view>
            <MarkdownText
              v-if="draft.description.trim()"
              :source="draft.description"
              :project-path="fullPath"
              class="max-w-[68ch] text-sm leading-relaxed"
            />
            <p v-else class="text-sm italic text-muted-foreground">No description yet.</p>
          </template>
          <template #edit>
            <Textarea
              v-model="draft.description"
              :rows="8"
              aria-label="Issue description"
              placeholder="Add a description…"
            />
          </template>
        </EditableField>
      </section>

      <!-- Details rail: the issue's attributes, grouped. -->
      <aside class="issue__meta space-y-6 animate-row-in" style="animation-delay: 90ms">
        <LabelPicker v-model="draftLabelTitles" :catalog="catalog" label="Labels" />

        <AssigneeEditor
          v-model:usernames="draft.assigneeUsernames"
          :issue="issue"
          :members="members ?? []"
          label="Assignees"
        >
          <template #actions>
            <QuickAssign
              v-model:usernames="draft.assigneeUsernames"
              :issue="issue"
              :members="members ?? []"
            />
          </template>
        </AssigneeEditor>

        <div class="space-y-1.5">
          <span class="field-label">Milestone</span>
          <p class="text-sm" :class="issue.milestone ? 'text-foreground' : 'text-muted-foreground'">
            {{ issue.milestone?.title ?? 'None' }}
          </p>
        </div>
      </aside>

      <!-- Discussion: flat thread, no boxed cards. -->
      <section class="issue__talk min-w-0 animate-row-in" style="animation-delay: 140ms">
        <div class="flex items-baseline gap-2">
          <span class="field-label">Discussion</span>
          <span v-if="notes.length" class="font-mono text-xs text-muted-foreground">
            {{ notes.length }}
          </span>
        </div>

        <ul v-if="notes.length" class="mt-3 divide-y divide-border/60">
          <li v-for="n in notes" :key="n.id" class="flex gap-3 py-4 first:pt-0">
            <Avatar class="mt-0.5 size-7 shrink-0 text-[11px]">
              <AvatarFallback>{{ initials(n.author) }}</AvatarFallback>
            </Avatar>
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2">
                <span class="text-sm font-medium text-foreground">{{
                  nameOrUsername(n.author)
                }}</span>
                <span class="font-mono text-xs text-muted-foreground">
                  {{ new Date(n.createdAt).toLocaleDateString() }}
                </span>
              </div>
              <MarkdownText
                :source="n.body"
                :project-path="fullPath"
                class="mt-1 max-w-[68ch] text-sm leading-relaxed"
              />
            </div>
          </li>
        </ul>
        <p v-else class="mt-3 text-sm text-muted-foreground">
          No discussion yet — leave the first note below.
        </p>

        <div class="mt-4 space-y-1.5">
          <label for="issue-comment" class="field-label">Add a comment</label>
          <Textarea
            id="issue-comment"
            v-model="comment"
            :rows="3"
            placeholder="Add a comment…"
            aria-label="Add a comment"
          />
        </div>
      </section>

      <Scratchpad
        :full-path="fullPath"
        :iid="iid"
        class="issue__pad animate-row-in"
        style="animation-delay: 180ms"
      />
    </div>

    <!-- Sticky Save/Cancel — slides up the moment edits make the buffer dirty. -->
    <Transition name="savebar">
      <div
        v-if="dirty"
        class="savebar sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur"
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
    </Transition>
  </article>
  <p v-else class="text-sm text-muted-foreground">Issue not found.</p>
</template>

<style scoped>
/* The article is its own query context so the layout responds to the space it
   actually occupies (narrow drawer vs. full page), not the viewport. */
.issue {
  container-type: inline-size;
}

/* Save bar slide-in. Entrance settles up (matches row-in's easing); exit is
   quicker, as exits should be. Gated to no-preference so reduced-motion just
   toggles it — Vue resolves the transition synchronously when no CSS applies. */
@media (prefers-reduced-motion: no-preference) {
  .savebar-enter-active {
    transition:
      opacity 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .savebar-leave-active {
    transition:
      opacity 0.18s ease-out,
      transform 0.18s ease-out;
  }
  .savebar-enter-from,
  .savebar-leave-to {
    opacity: 0;
    transform: translateY(8px);
  }
}

.issue__body {
  display: grid;
  gap: 2rem;
}

/* The details rail hosts the Labels/Assignees popovers, which overflow downward
   past the rail. animate-row-in leaves every body section as its own stacking
   context, so without this the later-in-DOM discussion would paint over an open
   menu (the menu's z-index is trapped inside the rail's context). Lift the whole
   rail above its siblings so its popovers win. */
.issue__meta {
  position: relative;
  z-index: 1;
}

/* Past ~768px (full page, never the ~608px drawer) the attributes lift out of
   the stack into a right-hand details rail — asymmetric, scannable, Linear-like.
   The rail spans the document column's rows so it stays pinned alongside it. */
@container (min-width: 48rem) {
  .issue__body {
    grid-template-columns: minmax(0, 1fr) 15rem;
    column-gap: 3rem;
    row-gap: 2.5rem;
    align-items: start;
    grid-template-areas:
      'desc meta'
      'talk meta'
      'pad  meta';
  }
  .issue__desc {
    grid-area: desc;
  }
  .issue__meta {
    grid-area: meta;
  }
  .issue__talk {
    grid-area: talk;
  }
  .issue__pad {
    grid-area: pad;
  }
}
</style>
