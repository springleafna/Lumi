import { computed, ref } from 'vue'
import type { UserDto } from '@lumi/shared'
import { client, TOKEN_KEY } from '../lib/client'

const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
const user = ref<UserDto | null>(null)

export function useAuth() {
  const isAuthenticated = computed(() => Boolean(token.value))

  async function login(username: string, password: string) {
    const result = await client.auth.login({ username, password })
    localStorage.setItem(TOKEN_KEY, result.accessToken)
    token.value = result.accessToken
    user.value = result.user
    return result.user
  }

  async function register(username: string, password: string) {
    const result = await client.auth.register({ username, password })
    localStorage.setItem(TOKEN_KEY, result.accessToken)
    token.value = result.accessToken
    user.value = result.user
    return result.user
  }

  async function loadMe() {
    if (!token.value) return null

    try {
      user.value = await client.auth.me()
      return user.value
    } catch (error) {
      logout()
      throw error
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    token.value = null
    user.value = null
  }

  return {
    token,
    user,
    isAuthenticated,
    login,
    register,
    loadMe,
    logout,
  }
}
