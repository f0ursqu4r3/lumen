import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "projects",
      component: () => import("@/views/ProjectPicker.vue"),
    },
    {
      path: "/projects/:fullPath(.*)/issues",
      name: "issues",
      component: () => import("@/views/IssueList.vue"),
      props: true,
    },
    {
      path: "/projects/:fullPath(.*)/issues/:iid",
      name: "issue",
      component: () => import("@/views/IssueDetail.vue"),
      props: true,
    },
  ],
});
