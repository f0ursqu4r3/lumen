import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

// Mounts `composable()` inside a Vue Query provider (retries off so failures
// surface immediately in tests). Returns a getter for the composable's result.
export function withQuery<T>(composable: () => T) {
  let result!: T
  const Comp = defineComponent({
    setup() {
      result = composable()
      return () => h('div')
    },
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = mount(Comp, {
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  })
  return { result: () => result, wrapper, queryClient }
}
