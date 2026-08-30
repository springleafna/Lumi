import { createRouter, createWebHistory } from 'vue-router'
import { hasServerUrl, TOKEN_KEY } from '../lib/client'
import KnowledgeChatPage from '../views/KnowledgeChatPage.vue'
import LibraryPage from '../views/LibraryPage.vue'
import LoginPage from '../views/LoginPage.vue'
import ReaderPage from '../views/ReaderPage.vue'
import RegisterPage from '../views/RegisterPage.vue'
import SettingsPage from '../views/SettingsPage.vue'
import SetupPage from '../views/SetupPage.vue'
import TabLayout from '../views/TabLayout.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: TabLayout,
      redirect: '/library',
      meta: { requiresAuth: true },
      children: [
        { path: 'library', component: LibraryPage },
        { path: 'chat', component: KnowledgeChatPage },
        { path: 'settings', component: SettingsPage },
      ],
    },
    {
      path: '/article/:id',
      component: ReaderPage,
      meta: { requiresAuth: true },
    },
    {
      // 分享深链的兜底路由：WebView 若真的导航到 /_share，直接回文章库
      path: '/_share',
      redirect: '/library',
    },
    {
      path: '/login',
      component: LoginPage,
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      component: RegisterPage,
      meta: { guestOnly: true },
    },
    {
      path: '/setup',
      component: SetupPage,
      meta: { guestOnly: true },
    },
  ],
})

router.beforeEach((to) => {
  const hasServer = hasServerUrl()
  const hasToken = Boolean(localStorage.getItem(TOKEN_KEY))

  // 未配置服务器时，任何页面都先进 setup
  if (!hasServer && to.path !== '/setup') {
    return '/setup'
  }

  if (to.meta.requiresAuth && !hasToken) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && hasToken) {
    return '/library'
  }

  return true
})
