<script setup lang="ts">
import { computed } from 'vue'
import { Check, Link, ExternalLink, RefreshCw } from '@lucide/vue'
import { Button } from '@/shared/ui/button'
import StateBadge from '@/features/issues/components/StateBadge.vue'

const props = defineProps<{
  issue: {
    iid: string
    title: string
    author?: { name?: string | null; username: string } | null
    createdAt: string
    webUrl: string
  }
  repoName: string
  state: string
  embedded?: boolean
  windowed?: boolean
  linkCopied: null | 'url' | 'md'
  fullPath: string
  refreshing?: boolean
}>()
defineEmits<{ copy: [e: MouseEvent]; 'open-external': []; 'toggle-state': []; refresh: [] }>()

// The shell is present only in the full-page main window. There the action
// cluster teleports into the shell top bar (and the eyebrow/back-link is dropped,
// since the shell provides back + breadcrumb). In the popped-out window and the
// drawer there's no shell to host it, so the masthead renders inline as today.
const shellPresent = computed(() => !props.embedded && !props.windowed)

// two-letter-free name helper (avatars elsewhere are initials; this is the byline)
function nameOrUsername(user?: { name?: string | null; username: string } | null) {
  if (!user) return '(deleted user)'
  return user.name || `@${user.username}`
}
</script>

<template>
  <header class="animate-row-in">
    <!-- Eyebrow: only when there's no shell to host the way back. In the full-page
         main window the shell top bar provides back + breadcrumb, so the eyebrow
         is dropped entirely. In the popped-out window it's inert text, and the
         drawer (embedded) likewise stays inert: the list is already behind it. -->
    <p
      v-if="!shellPresent"
      class="eyebrow-tick max-w-full font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
    >
      <span class="min-w-0 truncate">{{ repoName }}</span>
    </p>

    <!-- Action cluster (state · id · copy · open · toggle). In the full-page main
         window it teleports into the shell top bar; in the window/drawer it sits
         inline below the eyebrow. Markup is duplicated so each branch keeps its own
         spacing class, but the data-testids are identical across both. -->
    <Teleport v-if="shellPresent" defer to="#app-topbar-slot">
      <div class="flex items-center gap-2.5">
        <!-- Keyed by state so toggling open/closed re-triggers the quiet status flash. -->
        <StateBadge :key="state" :state="state" class="animate-status" />
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
          @click="$emit('copy', $event)"
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
          @click="$emit('open-external')"
        >
          <ExternalLink class="size-3.5" />
          Open in GitLab
        </Button>
        <Button
          type="button"
          data-testid="refresh-issue"
          variant="ghost"
          size="icon-xs"
          class="text-muted-foreground"
          title="Refresh this issue"
          :disabled="refreshing"
          @click="$emit('refresh')"
        >
          <RefreshCw class="size-3.5" :class="refreshing ? 'animate-spin' : ''" />
        </Button>
        <Button
          type="button"
          data-testid="toggle-state"
          variant="outline"
          size="sm"
          @click="$emit('toggle-state')"
        >
          {{ state === 'opened' ? 'Close issue' : 'Reopen issue' }}
        </Button>
      </div>
    </Teleport>
    <div v-else class="mt-2.5 flex items-center gap-2.5">
      <!-- Keyed by state so toggling open/closed re-triggers the quiet status flash. -->
      <StateBadge :key="state" :state="state" class="animate-status" />
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
        @click="$emit('copy', $event)"
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
        @click="$emit('open-external')"
      >
        <ExternalLink class="size-3.5" />
        Open in GitLab
      </Button>
      <Button
        type="button"
        data-testid="refresh-issue"
        variant="ghost"
        size="icon-xs"
        class="text-muted-foreground"
        title="Refresh this issue"
        :disabled="refreshing"
        @click="$emit('refresh')"
      >
        <RefreshCw class="size-3.5" :class="refreshing ? 'animate-spin' : ''" />
      </Button>
      <Button
        type="button"
        data-testid="toggle-state"
        variant="outline"
        size="sm"
        @click="$emit('toggle-state')"
      >
        {{ state === 'opened' ? 'Close issue' : 'Reopen issue' }}
      </Button>
    </div>

    <p class="mt-4 text-xs text-muted-foreground">
      Opened by
      <span class="font-medium text-foreground">{{ nameOrUsername(issue.author) }}</span>
      <span class="px-1 text-muted-foreground/50">·</span>
      <span class="font-mono">{{ new Date(issue.createdAt).toLocaleDateString() }}</span>
    </p>
  </header>
</template>
