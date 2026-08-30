import { createRouter, createWebHistory } from 'vue-router'
import { hasServerUrl, TOKEN_KEY } from '../lib/client'
import LibraryPage from '../views/LibraryPage.vue'
import LoginPage from '../views/LoginPage.vue'
import ReaderPage from '../views/ReaderPage.vue'
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
        { path: 'settings', component: SettingsPage },
      ],
    },
    {
      path: '/article/:id',
      component: ReaderPage,
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      component: LoginPage,
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
