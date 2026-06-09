<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onKeyStroke } from '@vueuse/core'
import { useRoute, useRouter } from 'vue-router'
import { FileText, FolderGit2, GitBranch, Hash, Plus, Search, Settings, X } from '@lucide/vue'
import { useProjectBrowser } from '@/features/projects/composables/useProjectBrowser'
import { openSettings } from '@/shared/composables/useSettings'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'

type Command = {
  id: string
  title: string
  subtitle?: string
  icon: typeof Search
  action: () => void
}

const open = ref(false)
const query = ref('')
const active = ref(0)
const input = ref<{ $el: HTMLInputElement } | null>(null)
const router = useRouter()
const route = useRoute()

const { flatRows } = useProjectBrowser(query)

const currentProject = computed(() => {
  const raw = route.params.fullPath
  return typeof raw === 'string' && raw ? raw : null
})
const cleanQuery = computed(() => query.value.trim())
const issueJump = computed(() => cleanQuery.value.match(/^#?(\d+)$/)?.[1] ?? null)

const routeCommands = computed<Command[]>(() => {
  const commands: Command[] = [
    {
      id: 'projects',
      title: 'Open Projects',
      subtitle: 'Go to the project launcher',
      icon: FolderGit2,
      action: () => router.push({ name: 'projects' }),
    },
    {
      id: 'settings',
      title: 'Open Settings',
      subtitle: 'Connection and local preferences',
      icon: Settings,
      action: openSettings,
    },
  ]

  if (currentProject.value) {
    commands.unshift(
      {
        id: 'new-issue',
        title: 'Create Issue',
        subtitle: currentProject.value,
        icon: Plus,
        action: () =>
          router.push({
            name: 'issues',
            params: { fullPath: currentProject.value },
            query: { ...route.query, compose: '1' },
          }),
      },
      {
        id: 'project-issues',
        title: 'Open Issues',
        subtitle: currentProject.value,
        icon: FileText,
        action: () => router.push({ name: 'issues', params: { fullPath: currentProject.value } }),
      },
      {
        id: 'project-pipelines',
        title: 'Open Pipelines',
        subtitle: currentProject.value,
        icon: GitBranch,
        action: () =>
          router.push({ name: 'pipelines', params: { fullPath: currentProject.value } }),
      },
    )
  }

  if (currentProject.value && issueJump.value) {
    commands.unshift({
      id: `issue-${issueJump.value}`,
      title: `Open Issue #${issueJump.value}`,
      subtitle: currentProject.value,
      icon: Hash,
      action: () =>
        router.push({
          name: 'issue',
          params: { fullPath: currentProject.value, iid: issueJump.value },
        }),
    })
  }

  return commands
})

const projectCommands = computed<Command[]>(() =>
  flatRows.value.slice(0, 8).map((project) => ({
    id: `project-${project.fullPath}`,
    title: project.name,
    subtitle: project.fullPath,
    icon: FolderGit2,
    action: () => router.push({ name: 'issues', params: { fullPath: project.fullPath } }),
  })),
)

const commands = computed(() => {
  const q = cleanQuery.value.toLowerCase()
  const routeMatches = q
    ? routeCommands.value.filter(
        (c) => c.title.toLowerCase().includes(q) || c.subtitle?.toLowerCase().includes(q),
      )
    : routeCommands.value
  return [...routeMatches, ...projectCommands.value]
})

watch(open, async (value) => {
  if (!value) return
  query.value = ''
  active.value = 0
  await nextTick()
  input.value?.$el?.focus()
})

watch(commands, () => {
  active.value = Math.min(active.value, Math.max(commands.value.length - 1, 0))
})

onKeyStroke('k', (event) => {
  if (!(event.metaKey || event.ctrlKey)) return
  event.preventDefault()
  open.value = true
})

function close() {
  open.value = false
}

function run(command: Command | undefined) {
  if (!command) return
  command.action()
  close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = Math.min(active.value + 1, commands.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = Math.max(active.value - 1, 0)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    run(commands.value[active.value])
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent hide-close class="top-[18%] max-w-2xl translate-y-0 gap-0 overflow-hidden p-0">
      <DialogTitle class="sr-only">Command palette</DialogTitle>
      <DialogDescription class="sr-only">
        Search projects and run common Lumen commands.
      </DialogDescription>

      <div class="flex items-center gap-2 border-b border-border px-4 py-3">
        <Search class="size-4 shrink-0 text-muted-foreground" />
        <Input
          ref="input"
          v-model="query"
          type="search"
          placeholder="Search projects, commands, or #issue…"
          aria-label="Search commands"
          class="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          @keydown="onKeydown"
        />
        <button
          type="button"
          aria-label="Close"
          class="shrink-0 rounded-sm text-muted-foreground opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
          @click="open = false"
        >
          <X class="size-4" />
        </button>
      </div>

      <div class="max-h-112 overflow-y-auto p-1.5">
        <button
          v-for="(command, index) in commands"
          :key="command.id"
          type="button"
          class="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left outline-none"
          :class="index === active ? 'bg-accent text-foreground' : 'text-muted-foreground'"
          @mouseenter="active = index"
          @click="run(command)"
        >
          <component :is="command.icon" class="size-4 shrink-0" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-foreground">
              {{ command.title }}
            </span>
            <span v-if="command.subtitle" class="block truncate font-mono text-xs">
              {{ command.subtitle }}
            </span>
          </span>
        </button>

        <p v-if="!commands.length" class="px-3 py-8 text-center text-sm text-muted-foreground">
          No commands found.
        </p>
      </div>
    </DialogContent>
  </Dialog>
</template>
