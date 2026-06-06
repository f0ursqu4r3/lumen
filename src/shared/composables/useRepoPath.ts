import { computed, type Ref } from 'vue'

// Split a project path so the final segment (the repo) reads as the name and the
// rest trails as muted context — the shared emphasis the picker/list/detail
// headers all use.
export function useRepoPath(fullPath: Ref<string>) {
  const pathParts = computed(() => fullPath.value.split('/'))
  const repoName = computed(() => pathParts.value.at(-1) ?? fullPath.value)
  const pathPrefix = computed(() => pathParts.value.slice(0, -1).join('/'))
  return { pathParts, repoName, pathPrefix }
}
