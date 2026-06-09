import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppTopBar from './AppTopBar.vue'

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
