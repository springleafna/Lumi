import { computed, ref } from 'vue'
import type { UserDto } from '@lumi/shared'
import { client, TOKEN_KEY } from '../lib/client'

const token = ref(localStorage.getItem(TOKEN_KEY) || '')
const user = ref<UserDto | null>(null)
const isAuthenticated = computed(() => Boolean(token.value))

async function login(username: string, password: string) {
  const result = await client.auth.login({ username, password })
  localStorage.setItem(TOKEN_KEY, result.accessToken)
  token.value = result.accessToken
  user.value = result.user
  return result.user
}

async function loadMe() {
  try {
    user.value = await client.auth.me()
  } catch (error) {
    logout()
    throw error
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY)
  token.value = ''
  user.value = null
}

export function useAuth() {
  return { token, user, isAuthenticated, login, loadMe, logout }
}
