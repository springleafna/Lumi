<script setup lang="ts">
import { LockKeyhole, LogIn } from 'lucide-vue-next'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const router = useRouter()
const { login } = useAuth()

const username = ref('admin')
const password = ref('admin123456')
const loading = ref(false)
const errorMessage = ref('')

async function submit() {
  errorMessage.value = ''
  loading.value = true
  try {
    await login(username.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/documents'
    await router.push(redirect)
  } catch (error) {
    errorMessage.value =
      error instanceof LumiApiError ? error.message : '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="auth-panel">
      <div class="brand-lock">
        <LockKeyhole :size="26" />
      </div>
      <h1>Lumi</h1>
      <p>登录后导入、搜索和阅读你的图文知识库。</p>

      <form class="form-stack" @submit.prevent="submit">
        <label>
          <span>用户名</span>
          <input v-model.trim="username" autocomplete="username" placeholder="admin" />
        </label>
        <label>
          <span>密码</span>
          <input
            v-model="password"
            autocomplete="current-password"
            placeholder="admin123456"
            type="password"
          />
        </label>
        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        <button class="primary-button" :disabled="loading" type="submit">
          <LogIn :size="18" />
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>
    </section>
  </main>
</template>
