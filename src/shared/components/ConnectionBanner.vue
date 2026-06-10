<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'
import { sessionState } from '@/shared/composables/useSession'
import { rpc } from '@/shared/lib/rpc'

// The banner is now a pure display of host-owned server health (mirrored into
// sessionState by installServerHealth). Retry now pokes the single host loop.
const retryNow = () => void rpc.retryServerNow()
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-3 opacity-0"
  >
    <div
      v-if="sessionState.unavailable"
      class="fixed inset-x-0 bottom-5 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full border border-border bg-card py-2.5 pr-2 pl-4 shadow-pop"
      role="status"
      aria-live="polite"
      data-testid="connection-banner"
    >
      <LoaderCircle
        class="size-4 shrink-0 animate-spin text-primary/80"
        :stroke-width="2"
        aria-hidden="true"
      />
      <span class="text-sm leading-none text-foreground/90">
        Can't reach GitLab —
        <span aria-hidden="true">{{
          sessionState.probing ? 'retrying…' : `retrying in ${sessionState.secondsLeft}s`
        }}</span>
        <span class="sr-only">retrying</span>
      </span>
      <button
        v-if="!sessionState.probing"
        type="button"
        data-testid="connection-retry-now"
        class="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        @click="retryNow"
      >
        Retry now
      </button>
    </div>
  </Transition>
</template>
