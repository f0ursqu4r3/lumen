<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue'
import { useTitle } from '@vueuse/core'
import { onBeforeRouteLeave } from 'vue-router'
import { useIssue } from '@/features/issues/composables/useIssue'
import { useIssueDraft } from '@/features/issues/composables/useIssueDraft'
import { useAddNote } from '@/features/issues/composables/useIssueMutations'
import { useProjectMembers } from '@/features/projects/composables/useProjectMembers'
import { useProjectContributors } from '@/features/projects/composables/useProjectContributors'
import { useProjectLabels } from '@/features/labels/composables/useProjectLabels'
import { useWorkItemStatuses, type WorkItemStatus } from '@/features/issues/composables/useWorkItemStatus'
import { useConfirm } from '@/shared/composables/useConfirm'
import { rpc } from '@/shared/lib/rpc'
import QuickAssign from '@/features/assignees/components/QuickAssign.vue'
import AssigneeEditor from '@/features/assignees/components/AssigneeEditor.vue'
import LabelPicker from '@/features/labels/components/LabelPicker.vue'
import StatusPicker from '@/features/issues/components/StatusPicker.vue'
import StateBadge from '@/features/issues/components/StateBadge.vue'
import ErrorNotice from '@/shared/components/ErrorNotice.vue'
import { Check, Link, ExternalLink, Images, ArrowLeft } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'
import { Avatar, AvatarFallback } from '@/shared/ui/avatar'
import { Skeleton } from '@/shared/ui/skeleton'
import MarkdownText from '@/shared/components/MarkdownText.vue'
import EditableField from '@/shared/components/EditableField.vue'
import Scratchpad from '@/shared/components/Scratchpad.vue'
import MediaViewer from '@/shared/components/MediaViewer.vue'
import { buildIssueMedia } from '@/features/issues/composables/useIssueMedia'

const props = defineProps<{
  fullPath: string
  iid: string
  embedded?: boolean
  windowed?: boolean
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

// The picker shows/sets the draft's buffered status (resolved against the
// options list); selecting just mutates the draft, so it persists on Save.
const currentStatus = computed<WorkItemStatus | null>(
  () => statusOptions.value?.find((s) => s.id === draft.value?.statusId) ?? null,
)
function onSelectStatus(status: WorkItemStatus) {
  if (draft.value) draft.value.statusId = status.id
}

const actionError = computed(() => saveError.value)

// The repo (final path segment) anchors the masthead eyebrow, echoing the list
// and picker headers so the detail view reads as part of the same instrument.
const repoName = computed(() => props.fullPath.split('/').at(-1) ?? props.fullPath)

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

const media = computed(() => buildIssueMedia(draft.value?.description, notes.value, props.fullPath))
const viewerOpen = ref(false)
const viewerIndex = ref(0)

function openViewer(i: number) {
  viewerIndex.value = i
  viewerOpen.value = true
}

// Two GitLab affordances next to the issue id: open in the browser, and copy a
// link. Opening routes through the host (the native webview can't open external
// URLs itself). Copy defaults to the bare URL; Shift+Click copies a markdown link.
// We deliberately avoid ⌘/Ctrl chords — Electrobun's preload intercepts those on
// links before our handler runs.
async function openInGitLab() {
  if (issue.value) await rpc.openExternal({ url: issue.value.webUrl })
}

const linkCopied = ref<null | 'url' | 'md'>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

async function onCopyClick(e: MouseEvent) {
  if (!issue.value) return
  const url = issue.value.webUrl
  const markdown = e.shiftKey
  const text = markdown ? `[#${issue.value.iid} ${issue.value.title}](${url})` : url
  // navigator.clipboard is undefined under the views:// origin; write via the host.
  await rpc.clipboardWriteText({ text })
  linkCopied.value = markdown ? 'md' : 'url'
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => (linkCopied.value = null), 1400)
}

// Inline media is rendered via v-html, so intercept clicks by delegation. The
// clicked trigger's ordinal among all [data-media-trigger] elements in the body
// is its index in `media`: both follow document order (description then
// comments) and only images/videos carry the trigger — exactly the collection.
function onBodyMediaClick(e: MouseEvent) {
  const el = (e.target as HTMLElement | null)?.closest('[data-media-trigger]')
  if (!el) return
  e.preventDefault()
  const triggers = Array.from(
    (e.currentTarget as HTMLElement).querySelectorAll('[data-media-trigger]'),
  )
  const i = triggers.indexOf(el)
  if (i >= 0) openViewer(i)
}

// Only notes that arrive *after* the thread first renders should animate in;
// the initial set lands with the section's own entrance. We prime `seen` on the
// first resolve (nothing flagged fresh), then any later id is a new comment —
// flag it so its <li> eases in, and drop the flag once the animation has played
// so an unrelated re-render can't replay it.
const seen = new Set<string>()
const fresh = ref(new Set<string>())
let primed = false

watch(
  () => notes.value.map((n) => n.id),
  (ids) => {
    if (!primed) {
      // Wait for the first real resolve; priming on the pre-load empty set would
      // make the whole initial thread count as "arrived" and animate at once.
      if (!issue.value) return
      ids.forEach((id) => seen.add(id))
      primed = true
      return
    }
    const arrived = ids.filter((id) => !seen.has(id))
    if (!arrived.length) return
    arrived.forEach((id) => {
      seen.add(id)
      fresh.value.add(id)
    })
    // Drop the flag after the animation completes (Vue tracks Set mutations).
    setTimeout(() => arrived.forEach((id) => fresh.value.delete(id)), 1500)
  },
  { immediate: true },
)

// Replies post immediately (their own per-thread box), independent of the draft
// buffer that batches field edits + the top-level comment behind Save. One box
// open at a time keeps the state flat; the mutation invalidates the issue query
// so the new reply lands on the next refetch.
const reply = useAddNote(props.fullPath, props.iid)
const replyingTo = ref<string | null>(null)
const replyBody = ref('')
const replyPending = computed(() => reply.isPending.value)
const replyError = computed(() => reply.error.value)

function openReply(threadId: string) {
  replyingTo.value = threadId
  replyBody.value = ''
  reply.reset()
}
function cancelReply() {
  replyingTo.value = null
  replyBody.value = ''
}
async function submitReply(threadId: string) {
  const body = replyBody.value.trim()
  if (!body || !issue.value?.id || reply.isPending.value) return
  try {
    await reply.mutateAsync({ noteableId: issue.value.id, discussionId: threadId, body })
    cancelReply()
  } catch {
    // Left open with the text intact; the error surfaces via reply.error below.
  }
}

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
      <!-- The eyebrow doubles as the way back. Full-page (deep link / refresh —
           the cards and rows open the drawer, so this view is the only one that
           strands you) it's a link to this repo's issue list, the arrow taking
           the tick's lead position. Embedded in the drawer it stays inert text:
           the list is already behind it, and the dirty guard lives on the host. -->
      <RouterLink
        v-if="!embedded && !windowed"
        :to="{ name: 'issues', params: { fullPath } }"
        data-testid="back-to-issues"
        class="group/back -mx-1 inline-flex max-w-full items-center gap-1.5 rounded-sm px-1 font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <ArrowLeft
          class="size-3 shrink-0 text-primary transition-transform group-hover/back:-translate-x-0.5"
        />
        <span class="min-w-0 truncate">{{ repoName }}</span>
      </RouterLink>
      <p
        v-else
        class="eyebrow-tick max-w-full font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
      >
        <span class="min-w-0 truncate">{{ repoName }}</span>
      </p>
      <div class="mt-2.5 flex items-center gap-2.5">
        <!-- Keyed by state so toggling open/closed re-triggers the quiet status flash. -->
        <StateBadge :key="draft.state" :state="draft.state" class="animate-status" />
        <span
          class="inline-flex items-center rounded-md bg-muted/70 px-1.5 py-0.5 font-mono text-sm font-medium tabular-nums text-foreground/90 ring-1 ring-inset ring-border/60"
        >
          <span class="text-muted-foreground/45">#</span>{{ issue.iid }}
        </span>
        <Button
          type="button"
          data-testid="copy-link"
          variant="ghost"
          size="icon-xs"
          class="text-muted-foreground"
          title="Copy link · Shift+Click to copy a markdown link"
          @click="onCopyClick"
        >
          <component :is="linkCopied ? Check : Link" class="size-3.5" />
        </Button>

        <Button
          type="button"
          data-testid="open-in-gitlab"
          variant="ghost"
          size="sm"
          class="ml-auto text-muted-foreground"
          title="Open this issue in GitLab"
          @click="openInGitLab"
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

      <p class="mt-2.5 text-xs text-muted-foreground">
        Opened by
        <span class="font-medium text-foreground">{{ nameOrUsername(issue.author) }}</span>
        <span class="px-1 text-muted-foreground/50">·</span>
        <span class="font-mono">{{ new Date(issue.createdAt).toLocaleDateString() }}</span>
      </p>
    </header>

    <ErrorNotice v-if="actionError" :error="actionError" class="mt-4" />

    <div class="issue__body my-8" @click="onBodyMediaClick">
      <!-- Main column: the document. -->
      <section class="issue__desc min-w-0 animate-row-in" style="animation-delay: 60ms">
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
      <aside
        class="issue__meta animate-row-in space-y-5 rounded-xl border border-border bg-card/55 p-4 shadow-card"
        style="animation-delay: 90ms"
      >
        <StatusPicker
          v-if="statusOptions?.length"
          :statuses="statusOptions"
          :current="currentStatus"
          label="Status"
          @select="onSelectStatus"
        />

        <LabelPicker v-model="draftLabelTitles" :catalog="catalog" label="Labels" />

        <AssigneeEditor
          v-model:usernames="draft.assigneeUsernames"
          :issue="issue"
          :members="members ?? []"
          :contributors="contributors ?? []"
          label="Assignees"
        >
          <template #actions>
            <QuickAssign
              v-model:usernames="draft.assigneeUsernames"
              :issue="issue"
              :members="members ?? []"
              :contributors="contributors ?? []"
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

        <ul v-if="threads.length" class="mt-3 divide-y divide-border/60">
          <li v-for="t in threads" :key="t.id" class="py-4 first:pt-0">
            <!-- First note is the comment; the rest are replies, indented to align
                 under the comment's content (size-7 avatar + gap-3 = pl-10). -->
            <div
              v-for="(n, i) in t.notes"
              :key="n.id"
              data-testid="note"
              class="flex gap-3"
              :class="[i > 0 && 'mt-4 pl-10', fresh.has(n.id) && 'animate-note-in']"
            >
              <Avatar class="mt-0.5 size-7 shrink-0 text-2xs ring-1 ring-border/70">
                <AvatarFallback>{{ initials(n.author) }}</AvatarFallback>
              </Avatar>
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2">
                  <span class="text-sm font-medium text-foreground">
                    {{ nameOrUsername(n.author) }}
                  </span>
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
            </div>

            <!-- Per-thread reply, aligned with the thread content past the avatar. -->
            <div class="mt-2 pl-10">
              <Button
                v-if="replyingTo !== t.id"
                type="button"
                variant="ghost"
                size="sm"
                class="-ml-3 h-7 px-3 text-xs text-muted-foreground"
                @click="openReply(t.id)"
              >
                Reply
              </Button>
              <div v-else class="space-y-2">
                <Textarea
                  v-model="replyBody"
                  :rows="2"
                  placeholder="Write a reply…"
                  aria-label="Write a reply"
                  @keydown.esc="cancelReply"
                />
                <ErrorNotice v-if="replyError" :error="replyError" />
                <div class="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    :disabled="replyPending || !replyBody.trim()"
                    @click="submitReply(t.id)"
                  >
                    {{ replyPending ? 'Replying…' : 'Reply' }}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="replyPending"
                    @click="cancelReply"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
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
  }
  .issue__talk {
    grid-area: talk;
  }
  .issue__pad {
    grid-area: pad;
  }
}
</style>
