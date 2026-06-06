<script setup lang="ts">
import { BookOpenText, LogIn } from 'lucide-vue-next'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import UiButton from '../components/ui/Button.vue'
import UiCard from '../components/ui/Card.vue'
import UiInput from '../components/ui/Input.vue'
import { useAuth } from '../composables/useAuth'
import { useToast } from '../composables/useToast'

const route = useRoute()
const router = useRouter()
const { login } = useAuth()
const { toast } = useToast()

const username = ref('admin')
const password = ref('admin123456')
const loading = ref(false)
const errorMessage = ref('')

async function submit() {
  errorMessage.value = ''
  loading.value = true
  try {
    await login(username.value, password.value)
    toast({ title: '登录成功', description: '欢迎回到 Lumi。', variant: 'success' })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/documents'
    await router.push(redirect)
  } catch (error) {
    errorMessage.value = error instanceof LumiApiError ? error.message : '登录失败，请稍后重试'
    toast({
      title: '登录失败',
      description: errorMessage.value,
      variant: 'destructive',
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <UiCard class="auth-card">
      <div class="auth-brand">
        <div class="brand-mark">
          <BookOpenText :size="20" />
        </div>
        <div>
          <p class="kicker">Lumi</p>
          <h1>进入阅读库</h1>
        </div>
      </div>

      <p class="auth-copy">登录后继续导入、整理和阅读你的图文知识库。</p>

      <form class="auth-form" @submit.prevent="submit">
        <label class="field-group">
          <span>用户名</span>
          <UiInput v-model.trim="username" autocomplete="username" placeholder="admin" />
        </label>
        <label class="field-group">
          <span>密码</span>
          <UiInput
            v-model="password"
            autocomplete="current-password"
            placeholder="admin123456"
            type="password"
          />
        </label>
        <p v-if="errorMessage" class="inline-alert">{{ errorMessage }}</p>
        <UiButton class="auth-submit" :disabled="loading" type="submit">
          <LogIn :size="17" />
          {{ loading ? '登录中...' : '登录' }}
        </UiButton>
      </form>
    </UiCard>
  </main>
</template>
