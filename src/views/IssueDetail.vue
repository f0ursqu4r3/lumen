<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { useTitle, onKeyStroke } from '@vueuse/core'
import { onBeforeRouteLeave } from 'vue-router'
import { useIssue } from '@/features/issues/composables/useIssue'
import { useIssueDraft } from '@/features/issues/composables/useIssueDraft'
import { useIssueLinks } from '@/features/issues/composables/useIssueLinks'
import { useProjectMembers } from '@/features/projects/composables/useProjectMembers'
import { useProjectContributors } from '@/features/projects/composables/useProjectContributors'
import { useProjectLabels } from '@/features/labels/composables/useProjectLabels'
import { useWorkItemStatuses } from '@/features/issues/composables/useWorkItemStatus'
import { useConfirm } from '@/shared/composables/useConfirm'
import { useRepoPath } from '@/shared/composables/useRepoPath'
import IssueDetailsRail from '@/features/issues/components/IssueDetailsRail.vue'
import IssueMasthead from '@/features/issues/components/IssueMasthead.vue'
import IssueDiscussion from '@/features/issues/components/IssueDiscussion.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import { Images } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import IssueDetailSkeleton from '@/features/issues/components/IssueDetailSkeleton.vue'
import MarkdownText from '@/shared/components/MarkdownText.vue'
import EditableField from '@/shared/components/EditableField.vue'
import Scratchpad from '@/shared/components/Scratchpad.vue'
import MediaViewer from '@/shared/components/MediaViewer.vue'
import { useIssueMediaViewer } from '@/features/issues/composables/useIssueMediaViewer'

const props = defineProps<{
  fullPath: string
  iid: string
  embedded?: boolean
  windowed?: boolean
  // px from the top to pin the windowed condensed-title bar — the height of a
  // host's own sticky header (the combined window's pager). 0 in a single window.
  stickyTop?: number
}>()
const emit = defineEmits<{ 'update:dirty': [value: boolean] }>()

const { data: issue, isLoading, error } = useIssue(toRef(props, 'fullPath'), toRef(props, 'iid'))
const { data: members } = useProjectMembers(toRef(props, 'fullPath'))
const { data: contributors } = useProjectContributors(toRef(props, 'fullPath'))
const { data: labelCatalog } = useProjectLabels(toRef(props, 'fullPath'))
// Work-item Status (To do / In progress / Done / …) — a native GitLab field,
// separate from labels and from open/closed state. The list of options is read
// here; the current value and its persistence live in the issue draft, so a
// status change buffers and saves exactly like every other field (nothing hot).
const { data: statusOptions } = useWorkItemStatuses(toRef(props, 'fullPath'))
const draftApi = useIssueDraft(props.fullPath, props.iid, issue)
const { draft, comment, dirty, saving, save, reset, error: saveError } = draftApi
const { confirm } = useConfirm()

// Surface the dirty state to a host (the drawer) so it can guard closing.
watch(dirty, (v) => emit('update:dirty', v), { immediate: true })

// In a native window, surface a condensed sticky title once the document title
// scrolls out of view (shared by the single and combined windows). Observe a
// sentinel just past the title; rootMargin offsets any host sticky header
// (stickyTop) so the swap fires as the title tucks under it.
const titleEnd = ref<HTMLElement | null>(null)
const titleVisible = ref(true)
if (props.windowed) {
  let observer: IntersectionObserver | null = null
  onMounted(() => {
    observer = new IntersectionObserver(([entry]) => (titleVisible.value = entry.isIntersecting), {
      rootMargin: `-${props.stickyTop ?? 0}px 0px 0px 0px`,
    })
    if (titleEnd.value) observer.observe(titleEnd.value)
  })
  // The sentinel only exists once the issue resolves (the article branch).
  watch(titleEnd, (el) => el && observer?.observe(el))
  onBeforeUnmount(() => observer?.disconnect())
}

const actionError = computed(() => saveError.value)

// The repo (final path segment) anchors the masthead eyebrow, echoing the list
// and picker headers so the detail view reads as part of the same instrument.
const { repoName } = useRepoPath(toRef(props, 'fullPath'))

// Each discussion is a thread: its first note is the comment, the rest are
// replies. Drop system notes (GitLab models each as its own single-note
// discussion) and any thread left empty by that filter.
const threads = computed(() =>
  (issue.value?.discussions?.nodes ?? [])
    .map((d) => {
      const notes = (d?.notes?.nodes ?? []).filter(
        (n): n is NonNullable<typeof n> => !!n && !n.system,
      )
      return d && notes.length ? { id: d.id, notes } : null
    })
    .filter((t): t is NonNullable<typeof t> => !!t),
)

// Flattened in DOM order (threads, then notes within each) — the media-trigger
// index mapping and the fresh-animation tracker both key off this.
const notes = computed(() => threads.value.flatMap((t) => t.notes))

const { media, viewerOpen, viewerIndex, openViewer, onBodyMediaClick } = useIssueMediaViewer({
  description: computed(() => draft.value?.description),
  notes,
  fullPath: props.fullPath,
})

// Two GitLab affordances next to the issue id: open in the browser, and copy a
// link. Opening routes through the host (the native webview can't open external
// URLs itself). Copy defaults to the bare URL; Shift+Click copies a markdown link.
// We deliberately avoid ⌘/Ctrl chords — Electrobun's preload intercepts those on
// links before our handler runs.
const { linkCopied, onCopyClick, openInGitLab } = useIssueLinks(issue)

if (!props.embedded) {
  useTitle(
    computed(() => (issue.value ? `#${issue.value.iid} ${issue.value.title} · lumen` : 'lumen')),
  )
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
// ⌘/Ctrl+S saves buffered edits. Deliberately not guarded against INPUT/TEXTAREA:
// the title and description are edited in fields, and saving from there without a
// blur first is the whole point. preventDefault suppresses the browser/webview's
// native save-page dialog; dedupe stops a held key from re-firing the mutation.
onKeyStroke(
  's',
  (e) => {
    if (!(e.metaKey || e.ctrlKey)) return
    e.preventDefault()
    if (dirty.value && !saving.value) onSave()
  },
  { dedupe: true },
)

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
  <IssueDetailSkeleton v-else-if="isLoading" />
  <article v-else-if="issue && draft" class="issue pb-20">
    <!-- Condensed title: appears in a window once the main title scrolls out of
         view. `fixed` (not sticky) so toggling it never shifts the document; the
         inner wrapper re-creates the app shell's centered, padded column so it
         lines up with the content. stickyTop pins it below a host's own sticky
         header (the combined window's pager); 0 in a single window. -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-1.5 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="-translate-y-1.5 opacity-0"
    >
      <div
        v-if="windowed && !titleVisible"
        data-testid="condensed-title"
        class="fixed inset-x-0 z-20 border-b border-border bg-background/95 backdrop-blur"
        :style="{ top: `${stickyTop ?? 0}px` }"
      >
        <p class="mx-auto max-w-5xl truncate px-4 py-2 text-sm font-medium text-foreground/90">
          {{ draft.title }}
        </p>
      </div>
    </Transition>

    <!-- Masthead: state · id · title · byline read as one tight identity unit. -->
    <IssueMasthead
      :issue="issue"
      :repo-name="repoName"
      :state="draft.state"
      :embedded="embedded"
      :windowed="windowed"
      :link-copied="linkCopied"
      :full-path="fullPath"
      @copy="onCopyClick"
      @open-external="openInGitLab"
      @toggle-state="toggleState"
    />

    <ErrorNotice v-if="actionError" :error="actionError" class="mt-4" />

    <div class="issue__body my-8" @click="onBodyMediaClick">
      <!-- Main column: the document. The title leads it — the issue's identity
           sits with its body, not up in the masthead's instrument cluster. -->
      <section class="issue__desc min-w-0 animate-row-in" style="animation-delay: 60ms">
        <EditableField
          v-model:editing="editingTitle"
          label="Title"
          toggle-testid="edit-title-toggle"
          class="mb-6"
        >
          <template #label>
            <span class="field-label">Title</span>
          </template>
          <template #view>
            <h1 class="text-balance text-title leading-[1.08] font-semibold">
              {{ draft.title }}
            </h1>
          </template>
          <template #edit>
            <Input
              v-model="draft.title"
              data-testid="edit-title"
              aria-label="Issue title"
              class="h-auto py-1.5 text-title font-semibold"
            />
          </template>
        </EditableField>
        <!-- Sentinel just past the title: when it scrolls under a host window's
             sticky header, IssueDetail emits update:title-visible=false. -->
        <div ref="titleEnd" aria-hidden="true" class="h-px"></div>
        <button
          v-if="media.length"
          type="button"
          data-testid="view-all-media"
          class="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          @click.stop="openViewer(0)"
        >
          <Images class="size-3.5" />
          View all media ({{ media.length }})
        </button>
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
              class="mt-1 text-sm leading-relaxed"
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

      <!-- Details rail: the issue's attributes, grouped into a sculpted panel so
           they read as one scannable instrument cluster rather than loose fields. -->
      <IssueDetailsRail
        :issue="issue"
        :members="members ?? []"
        :contributors="contributors ?? []"
        :catalog="labelCatalog ?? []"
        :status-options="statusOptions ?? []"
        v-model:label-ids="draft.labelIds"
        v-model:status-id="draft.statusId"
        v-model:assignee-usernames="draft.assigneeUsernames"
      />

      <IssueDiscussion
        :threads="threads"
        :notes="notes"
        :iid="iid"
        :issue="issue"
        :full-path="fullPath"
        v-model:comment="comment"
      />

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
        class="savebar sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 shadow-[0_-12px_32px_-14px_oklch(0_0_0/0.55)] backdrop-blur"
      >
        <Button
          type="button"
          data-testid="cancel-issue"
          variant="ghost"
          :disabled="saving"
          @click="onCancel"
        >
          Revert Changes
        </Button>
        <Button type="button" data-testid="save-issue" :disabled="saving" @click="onSave">
          {{ saving ? 'Saving…' : 'Save changes' }}
        </Button>
      </div>
    </Transition>

    <MediaViewer v-model:open="viewerOpen" :items="media" :start-index="viewerIndex" />
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
    /* The stacked/drawer view boxes the attributes into a card to separate them
       from the document; at full-page width the rail is bare and Linear-like, so
       drop the surface (the utilities still apply in the narrow layout). */
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    padding: 0;
    position: sticky;
    top: 1.5rem;
  }
  .issue__talk {
    grid-area: talk;
  }
  .issue__pad {
    grid-area: pad;
  }
}
</style>
