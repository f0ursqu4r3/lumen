<script setup lang="ts">
import { watch } from 'vue'
import { KeyRound, LoaderCircle, ShieldAlert, TriangleAlert, Unplug } from '@lucide/vue'
import { Card } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Button } from '@/shared/ui/button'
import { rpc } from '@/shared/lib/rpc'
import { sessionState } from '@/shared/composables/useSession'
import { useGitlabConnect } from '@/shared/composables/useGitlabConnect'

// Reuse onboarding's connect state: `url` is the saved instance (shown
// read-only), `token` is the new token, `save()` re-probes and returns ok.
const { url, token, status, message, testing, canSubmit, loadUrl, save } = useGitlabConnect()

// Prefill the instance URL each time the overlay appears (not just at boot, so
// a transient boot-time getConfig failure can't leave Reconnect disabled).
watch(
  () => sessionState.expired,
  (expired) => {
    if (expired) void loadUrl()
  },
)

// A clean re-probe earns a full reload — the bulletproof "restart": a clean
// boot re-probes and refetches every stuck query under the valid token. The
// host holds no token state, so nothing server-side needs restarting.
async function reconnect() {
  if (await save()) window.location.reload()
}

// Escape hatch: drop the token and reload. The router guard sends the now
// unconfigured app to ConnectView.
async function disconnect() {
  // The user's intent is to escape regardless; reload even if clearConfig fails
  // (a stuck overlay is worse than a best-effort disconnect).
  await rpc.clearConfig().catch(() => {})
  window.location.reload()
}
</script>

<template>
  <!-- Full-screen, non-dismissable: no click-away or ESC. The only exits are a
       successful reconnect or an explicit disconnect — both reload the app. -->
  <div
    v-if="sessionState.expired"
    class="fixed inset-0 z-[100] grid place-items-center bg-background/80 px-4 backdrop-blur-sm"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="session-expired-title"
    aria-describedby="session-expired-desc"
  >
    <div class="w-full max-w-md animate-row-in">
      <div class="mb-7 flex flex-col items-center text-center">
        <div
          class="grid size-12 place-items-center rounded-xl border border-border bg-card shadow-pop"
          :class="testing && 'lamp-busy'"
        >
          <ShieldAlert class="size-5.5 text-primary" :stroke-width="2" />
        </div>
        <p
          class="eyebrow-tick mt-5 font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
        >
          Session expired
        </p>
        <h1
          id="session-expired-title"
          class="mt-2 text-title leading-none font-semibold text-foreground"
        >
          Re-connect to GitLab
        </h1>
        <p id="session-expired-desc" class="mt-2.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Your access token is no longer valid. Enter a new one to pick up where you left off.
        </p>
      </div>

      <Card class="gap-0 p-0 shadow-pop">
        <form class="flex flex-col gap-5 p-6" @submit.prevent="reconnect">
          <p class="font-mono text-sm text-foreground/90">{{ url || '—' }}</p>

          <div class="space-y-2">
            <Label
              for="session-token"
              class="font-mono text-2xs font-medium tracking-[0.06em] text-muted-foreground uppercase"
            >
              <KeyRound class="size-3.5 text-muted-foreground/70" />
              New token
            </Label>
            <Input
              id="session-token"
              v-model="token"
              type="password"
              autocomplete="off"
              spellcheck="false"
              autofocus
              placeholder="glpat-…"
              :disabled="testing"
              class="h-10 font-mono text-base"
              @keydown.enter.prevent="reconnect"
            />
            <p class="text-xs leading-relaxed text-muted-foreground/70">
              Needs the
              <code class="rounded bg-muted/60 px-1 py-0.5 font-mono text-2xs text-foreground/90">
                api
              </code>
              scope.
            </p>
          </div>

          <div
            v-if="status === 'error'"
            class="flex animate-status items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5"
            role="alert"
          >
            <TriangleAlert class="mt-px size-4 shrink-0 text-destructive" :stroke-width="2" />
            <p class="text-sm leading-relaxed text-foreground/90">{{ message }}</p>
          </div>

          <Button
            type="submit"
            size="lg"
            class="mt-0.5 w-full"
            :disabled="!canSubmit"
            data-testid="session-reconnect"
          >
            <LoaderCircle v-if="testing" class="size-4 animate-spin" />
            <KeyRound v-else class="size-4" />
            {{ testing ? 'Reconnecting…' : 'Reconnect' }}
          </Button>

          <Button
            type="button"
            variant="ghost"
            class="w-full text-muted-foreground hover:text-foreground"
            data-testid="session-disconnect"
            @click="disconnect"
          >
            <Unplug class="size-4" />
            Disconnect
          </Button>
        </form>
      </Card>
    </div>
  </div>
</template>
