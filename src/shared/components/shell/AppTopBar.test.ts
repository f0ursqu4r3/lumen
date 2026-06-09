import { describe, it, expect, vi } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppTopBar from './AppTopBar.vue'
import ProjectTabNav from './ProjectTabNav.vue'

// Stub usePipelines (pulled in transitively by ProjectTabNav) so mounting the
// project branch doesn't need a query client.
vi.mock('@/features/pipelines/composables/usePipelines', () => {
  const { ref } = require('vue')
  return { usePipelines: () => ({ pipelines: ref([]) }) }
})

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div/>' } },
    { path: '/projects', name: 'projects', component: { template: '<div/>' } },
  ],
})

async function mountAt(path: string) {
  await router.push(path)
  await router.isReady()
  return mount(AppTopBar, { global: { plugins: [router] } })
}

describe('AppTopBar', () => {
  it('shows the My Work title on the home route', async () => {
    expect((await mountAt('/')).text()).toContain('My Work')
  })
  it('shows the Projects title on the projects route', async () => {
    expect((await mountAt('/projects')).text()).toContain('Projects')
  })
  it('renders the top-bar slot target', async () => {
    expect((await mountAt('/')).find('#app-topbar-slot').exists()).toBe(true)
  })
})

const projectRouter = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div/>' } },
    { path: '/projects', name: 'projects', component: { template: '<div/>' } },
    { path: '/projects/:fullPath(.*)/issues', name: 'issues', component: { template: '<div/>' } },
  ],
})

describe('AppTopBar project branch', () => {
  it('shows the repo name + tabs on a project list route', async () => {
    await projectRouter.push('/projects/grp/proj/issues')
    await projectRouter.isReady()
    const w = mount(AppTopBar, {
      global: { plugins: [projectRouter], stubs: { RouterLink: RouterLinkStub } },
    })
    expect(w.text()).toContain('proj')
    expect(w.findComponent(ProjectTabNav).exists()).toBe(true)
    expect(w.findComponent(ProjectTabNav).props('active')).toBe('issues')
  })
})
