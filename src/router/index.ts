import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { rpc } from '@/shared/lib/rpc'
import { nextRoute } from './guard'
// Views are imported eagerly, not lazily. This is a desktop app served from the
// `views://` scheme with on-disk assets, so route-level code-splitting buys no
// load-time win — and dynamically-imported chunks have proven flaky to fetch
// over `views://` at navigation time (blank popouts, failed pipeline view).
// Bundling the views into the main script sidesteps that entire class of bug.
import MyWork from '@/views/MyWork.vue'
import ProjectPicker from '@/views/ProjectPicker.vue'
import IssueList from '@/views/IssueList.vue'
import IssueDetail from '@/views/IssueDetail.vue'
import MultiIssueWindow from '@/views/MultiIssueWindow.vue'
import PipelineList from '@/views/PipelineList.vue'
import ConnectView from '@/views/ConnectView.vue'
import MergeRequestList from '@/views/MergeRequestList.vue'
import MergeRequestDetail from '@/views/MergeRequestDetail.vue'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: MyWork,
  },
  {
    path: '/projects',
    name: 'projects',
    component: ProjectPicker,
  },
  {
    path: '/projects/:fullPath(.*)/issues',
    name: 'issues',
    component: IssueList,
    props: true,
  },
  {
    path: '/projects/:fullPath(.*)/issues/:iid',
    name: 'issue',
    component: IssueDetail,
    props: (route) => ({
      fullPath: route.params.fullPath,
      iid: route.params.iid,
      // Only '1' is canonical — issueWindowRoute always emits ?window=1.
      windowed: route.query.window === '1',
    }),
  },
  {
    path: '/projects/:fullPath(.*)/issues-window',
    name: 'issues-window',
    component: MultiIssueWindow,
    props: (route) => ({
      fullPath: String(route.params.fullPath),
      // Comma-joined in issuesWindowRoute; split back to the pager's iid list.
      iids:
        typeof route.query.iids === 'string' && route.query.iids ? route.query.iids.split(',') : [],
      windowed: route.query.window === '1',
    }),
  },
  {
    path: '/projects/:fullPath(.*)/pipelines',
    name: 'pipelines',
    component: PipelineList,
    props: true,
  },
  {
    path: '/projects/:fullPath(.*)/merge-requests',
    name: 'merge-requests',
    component: MergeRequestList,
    props: true,
  },
  {
    path: '/projects/:fullPath(.*)/merge-requests/:iid',
    name: 'merge-request',
    component: MergeRequestDetail,
    props: (route) => ({
      fullPath: route.params.fullPath,
      iid: route.params.iid,
    }),
  },
  {
    path: '/connect',
    name: 'connect',
    component: ConnectView,
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
