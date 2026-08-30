<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import { showNotify } from 'vant'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const router = useRouter()
const { login } = useAuth()

const username = ref('admin')
const password = ref('')
const submitting = ref(false)

async function submit() {
  if (!username.value.trim() || !password.value) return
  submitting.value = true
  try {
    await login(username.value.trim(), password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/library'
    router.replace(redirect)
  } catch (error) {
    const message = error instanceof LumiApiError ? error.message : '登录失败，请稍后重试'
    showNotify({ type: 'danger', message })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-page safe-area-top safe-area-bottom">
    <div class="login-brand">
      <img class="login-logo" src="../assets/lumi-logo.svg" alt="Lumi" />
      <h1>登录 Lumi</h1>
    </div>

    <div class="login-form">
      <van-field v-model="username" label="用户名" placeholder="用户名" clearable />
      <van-field
        v-model="password"
        type="password"
        label="密码"
        placeholder="密码"
        @keyup.enter="submit"
      />
      <van-button type="primary" block round :loading="submitting" @click="submit">
        登录
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: center;
  padding: 32px 24px;
  background: var(--lumi-bg-primary);
}

.login-brand {
  margin-bottom: 36px;
  text-align: center;
}

.login-logo {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
}

.login-brand h1 {
  color: var(--lumi-fg-primary);
  font-size: 20px;
  font-weight: 600;
}

.login-form .van-button {
  margin-top: 24px;
}
</style>
