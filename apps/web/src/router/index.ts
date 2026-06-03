import { createRouter, createWebHistory } from 'vue-router'
import { TOKEN_KEY } from '../lib/client'
import DocumentDetailPage from '../views/DocumentDetailPage.vue'
import DocumentsPage from '../views/DocumentsPage.vue'
import LoginPage from '../views/LoginPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: () => (localStorage.getItem(TOKEN_KEY) ? '/documents' : '/login'),
    },
    {
      path: '/login',
      component: LoginPage,
      meta: { guestOnly: true },
    },
    {
      path: '/documents',
      component: DocumentsPage,
      meta: { requiresAuth: true },
    },
    {
      path: '/documents/:id',
      component: DocumentDetailPage,
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  const hasToken = Boolean(localStorage.getItem(TOKEN_KEY))

  if (to.meta.requiresAuth && !hasToken) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && hasToken) {
    return '/documents'
  }

  return true
})
