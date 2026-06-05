<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Check, Search } from '@lucide/vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { personInitial, type AssigneeSection } from '@/lib/assigneeOrder'

// Presentational people-menu shared by the Assign and Quick-assign popovers:
// renders the search box plus relationship-grouped sections and emits the
// chosen username. Mounted only while open, so the filter resets per open and
// the search can grab focus on mount.
const props = defineProps<{
  sections: AssigneeSection[]
  selected: string[]
  menuLabel: string
  testidPrefix: string
}>()
const emit = defineEmits<{ select: [username: string] }>()

const query = ref('')
const search = ref<HTMLInputElement | null>(null)
onMounted(() => search.value?.focus())

const filteredSections = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.sections
  return props.sections
    .map((s) => ({
      ...s,
      people: s.people.filter(
        (p) => (p.name ?? '').toLowerCase().includes(q) || p.username.toLowerCase().includes(q),
      ),
    }))
    .filter((s) => s.people.length)
})
</script>

<template>
  <div
    role="menu"
    :aria-label="menuLabel"
    class="absolute right-0 z-50 mt-1 flex max-h-72 w-64 flex-col rounded-lg border border-border bg-popover p-1 shadow-md"
  >
    <div class="relative mb-1 shrink-0">
      <Search
        class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        ref="search"
        v-model="query"
        type="text"
        :data-testid="`${testidPrefix}-search`"
        placeholder="Search people"
        class="w-full rounded-md border border-border bg-muted/40 py-1 pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
      />
    </div>
    <div class="-mr-1 overflow-y-auto pr-1">
      <template v-for="section in filteredSections" :key="section.rel">
        <p
          role="presentation"
          class="px-2 pt-2 pb-1 text-micro font-medium uppercase tracking-wide text-muted-foreground"
        >
          {{ section.label }}
        </p>
        <button
          v-for="p in section.people"
          :key="p.username"
          type="button"
          role="menuitem"
          :data-testid="`${testidPrefix}-option-${p.username}`"
          class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"
          @click="emit('select', p.username)"
        >
          <Avatar class="size-5 text-micro">
            <AvatarFallback>{{ personInitial(p) }}</AvatarFallback>
          </Avatar>
          <span class="min-w-0 flex-1 truncate text-foreground">
            {{ p.name || p.username }}
            <span class="text-muted-foreground">@{{ p.username }}</span>
          </span>
          <Check
            v-if="selected.includes(p.username)"
            :data-testid="`${testidPrefix}-checked-${p.username}`"
            class="size-3.5 shrink-0 text-primary"
          />
        </button>
      </template>
      <p v-if="!filteredSections.length" class="px-2 py-1.5 text-xs text-muted-foreground">
        No people found.
      </p>
    </div>
  </div>
</template>
