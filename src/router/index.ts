import { createRouter, createWebHashHistory } from 'vue-router'
import { rpc } from '@/lib/rpc'
import { nextRoute } from './guard'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
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
      props: true,
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
  ],
})

// Send first-run / unconfigured users to Connect before anything tries to query.
router.beforeEach(async (to) => {
  const { configured } = await rpc.getConfig()
  return nextRoute(to.name as string | undefined, configured)
})
