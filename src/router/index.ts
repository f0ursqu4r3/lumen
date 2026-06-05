import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { rpc } from '@/lib/rpc'
import { nextRoute } from './guard'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'projects',
    component: () => import('@/views/ProjectPicker.vue'),
  },
  {
    path: '/projects/:fullPath(.*)/issues',
    name: 'issues',
    component: () => import('@/views/IssueList.vue'),
    props: true,
  },
  {
    path: '/projects/:fullPath(.*)/issues/:iid',
    name: 'issue',
    component: () => import('@/views/IssueDetail.vue'),
    props: (route) => ({
      fullPath: route.params.fullPath,
      iid: route.params.iid,
      // Only '1' is canonical — issueWindowUrl always emits ?window=1.
      windowed: route.query.window === '1',
    }),
  },
  {
    path: '/projects/:fullPath(.*)/issues-window',
    name: 'issues-window',
    component: () => import('@/views/MultiIssueWindow.vue'),
    props: (route) => ({
      fullPath: String(route.params.fullPath),
      // Comma-joined in issuesWindowUrl; split back to the pager's iid list.
      iids:
        typeof route.query.iids === 'string' && route.query.iids
          ? route.query.iids.split(',')
          : [],
      windowed: route.query.window === '1',
    }),
  },
  {
    path: '/projects/:fullPath(.*)/pipelines',
    name: 'pipelines',
    component: () => import('@/views/PipelineList.vue'),
    props: true,
  },
  {
    path: '/connect',
    name: 'connect',
    component: () => import('@/views/ConnectView.vue'),
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// Send first-run / unconfigured users to Connect before anything tries to query.
router.beforeEach(async (to) => {
  const { configured } = await rpc.getConfig()
  return nextRoute(to.name as string | undefined, configured)
})
