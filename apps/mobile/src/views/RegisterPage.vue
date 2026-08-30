<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import { showNotify } from 'vant'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const router = useRouter()
const { register } = useAuth()

const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const submitting = ref(false)

function validate(): string {
  const name = username.value.trim()
  if (name.length < 2 || name.length > 32) return '用户名长度需为 2-32 个字符'
  if (password.value.length < 6 || password.value.length > 64) return '密码长度需为 6-64 位'
  if (password.value !== confirmPassword.value) return '两次输入的密码不一致'
  return ''
}

async function submit() {
  const invalid = validate()
  if (invalid) {
    showNotify({ type: 'danger', message: invalid })
    return
  }
  submitting.value = true
  try {
    await register(username.value.trim(), password.value)
    showNotify({ type: 'success', message: '注册成功' })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/library'
    router.replace(redirect)
  } catch (error) {
    const message = error instanceof LumiApiError ? error.message : '注册失败，请稍后重试'
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
      <h1>注册 Lumi</h1>
    </div>

    <div class="login-form">
      <van-field v-model="username" label="用户名" placeholder="2-32 个字符" clearable />
      <van-field
        v-model="password"
        type="password"
        label="密码"
        placeholder="至少 6 位"
        @keyup.enter="submit"
      />
      <van-field
        v-model="confirmPassword"
        type="password"
        label="确认密码"
        placeholder="再次输入密码"
        @keyup.enter="submit"
      />
      <van-button type="primary" block round :loading="submitting" @click="submit">
        注册
      </van-button>
      <RouterLink class="register-switch" to="/login">已有账号？直接登录</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.register-switch {
  display: block;
  margin-top: 16px;
  color: var(--lumi-fg-tertiary);
  font-size: 13px;
  text-align: center;
}

.register-switch:active {
  color: var(--lumi-fg-primary);
}
</style>
