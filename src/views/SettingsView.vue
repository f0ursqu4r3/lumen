<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTitle } from '@vueuse/core'
import { PlugZap, KeyRound, Server, LoaderCircle, ArrowRight, TriangleAlert } from '@lucide/vue'
import { rpc } from '@/lib/rpc'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

useTitle('Connect · lumen')

const router = useRouter()

const url = ref('')
const token = ref('')
const status = ref<'idle' | 'testing' | 'error'>('idle')
const message = ref('')

// Prefill the URL from any persisted config so re-running settings (e.g. to swap
// a token) doesn't make you retype the instance address.
onMounted(async () => {
  const cfg = await rpc.getConfig()
  if (cfg.url) url.value = cfg.url
})

const testing = computed(() => status.value === 'testing')
// The connect action is the one amber moment here, so it should only invite a
// click when there's something to connect with.
const canSubmit = computed(
  () => !testing.value && url.value.trim().length > 0 && token.value.trim().length > 0,
)

// Save first, then probe with the cheapest authenticated query GitLab offers.
// A clean 200 with no GraphQL errors is the only thing that earns the handoff
// to the workspace — anything else surfaces as an inline, recoverable error.
async function save() {
  if (!canSubmit.value) return
  status.value = 'testing'
  message.value = ''
  try {
    await rpc.saveConfig({ url: url.value.trim(), token: token.value.trim() })
    const res = await rpc.gitlabGraphql({ query: '{ currentUser { username } }' })
    if (res.status === 200 && !res.errors?.length) {
      router.replace({ name: 'projects' })
    } else {
      status.value = 'error'
      message.value = res.errors?.[0]?.message ?? `GitLab returned ${res.status}`
    }
  } catch (e) {
    status.value = 'error'
    message.value = e instanceof Error ? e.message : 'Could not reach GitLab'
  }
}
</script>

<template>
  <!-- Onboarding is a single calm focal panel, centered in the viewport — no
       chrome competing for attention before there's a connection to show. -->
  <section class="flex min-h-[calc(100dvh-3rem)] items-center justify-center px-4 py-12">
    <div class="w-full max-w-md animate-row-in">
      <!-- Crest: the amber lamp idiom, steady at rest and breathing while we
           probe — the same liveness signal the app header uses, introduced here. -->
      <div class="mb-7 flex flex-col items-center text-center">
        <div
          class="grid size-12 place-items-center rounded-xl border border-border bg-card shadow-pop"
          :class="testing && 'lamp-busy'"
        >
          <PlugZap class="size-[22px] text-primary" :stroke-width="2" />
        </div>
        <p
          class="eyebrow-tick mt-5 font-mono text-micro font-semibold tracking-[0.28em] text-muted-foreground/80 uppercase"
        >
          First run
        </p>
        <h1
          class="mt-2 text-title leading-none font-semibold text-foreground"
        >
          Connect to GitLab
        </h1>
        <p class="mt-2.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Point lumen at your instance and authorize it with a personal access token. It stays on
          this machine.
        </p>
      </div>

      <Card class="gap-0 p-0 shadow-pop">
        <form class="flex flex-col gap-5 p-6" @submit.prevent="save">
          <div class="space-y-2">
            <Label
              for="gitlab-url"
              class="font-mono text-2xs font-medium tracking-[0.06em] text-muted-foreground uppercase"
            >
              <Server class="size-3.5 text-muted-foreground/70" />
              Instance URL
            </Label>
            <Input
              id="gitlab-url"
              v-model="url"
              type="url"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder="https://gitlab.example.com"
              :disabled="testing"
              class="h-10 font-mono text-base"
              @keydown.enter.prevent="save"
            />
          </div>

          <div class="space-y-2">
            <Label
              for="gitlab-token"
              class="font-mono text-2xs font-medium tracking-[0.06em] text-muted-foreground uppercase"
            >
              <KeyRound class="size-3.5 text-muted-foreground/70" />
              Personal access token
            </Label>
            <Input
              id="gitlab-token"
              v-model="token"
              type="password"
              autocomplete="off"
              spellcheck="false"
              placeholder="glpat-…"
              :disabled="testing"
              class="h-10 font-mono text-base"
              @keydown.enter.prevent="save"
            />
            <p class="text-xs leading-relaxed text-muted-foreground/70">
              Needs the
              <code
                class="rounded bg-muted/60 px-1 py-0.5 font-mono text-2xs text-foreground/90"
                >api</code
              >
              scope. Create one under
              <span class="text-muted-foreground">Settings → Access Tokens</span>.
            </p>
          </div>

          <!-- Inline, recoverable error — the form stays put so a bad URL or
               token is a one-field fix, not a restart. -->
          <div
            v-if="status === 'error'"
            class="flex animate-status items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5"
            role="alert"
          >
            <TriangleAlert class="mt-px size-4 shrink-0 text-destructive" :stroke-width="2" />
            <p class="text-sm leading-relaxed text-foreground/90">{{ message }}</p>
          </div>

          <Button type="submit" size="lg" class="mt-0.5 w-full" :disabled="!canSubmit">
            <LoaderCircle v-if="testing" class="size-4 animate-spin" />
            <PlugZap v-else class="size-4" />
            {{ testing ? 'Connecting…' : 'Save & Connect' }}
            <ArrowRight v-if="!testing" class="size-4 opacity-70" />
          </Button>
        </form>
      </Card>

      <p class="mt-5 text-center font-mono text-2xs tracking-[0.04em] text-muted-foreground/50">
        lumen ▸ awaiting connection
      </p>
    </div>
  </section>
</template>
