<script setup lang="ts">
import { Eye, EyeOff, UserPlus } from 'lucide-vue-next'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import UiButton from '../components/ui/Button.vue'
import UiCard from '../components/ui/Card.vue'
import UiInput from '../components/ui/Input.vue'
import { useAuth } from '../composables/useAuth'
import { useToast } from '../composables/useToast'
import lumiLogo from '../assets/lumi-logo.svg'

const route = useRoute()
const router = useRouter()
const { register } = useAuth()
const { toast } = useToast()

const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')

function validate(): string {
  const name = username.value.trim()
  if (name.length < 2 || name.length > 32) {
    return '用户名长度需为 2-32 个字符'
  }
  if (password.value.length < 6 || password.value.length > 64) {
    return '密码长度需为 6-64 位'
  }
  if (password.value !== confirmPassword.value) {
    return '两次输入的密码不一致'
  }
  return ''
}

async function submit() {
  errorMessage.value = validate()
  if (errorMessage.value) return

  loading.value = true
  try {
    await register(username.value.trim(), password.value)
    toast({ title: '注册成功', description: '欢迎来到 Lumi。', variant: 'success' })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/documents'
    await router.push(redirect)
  } catch (error) {
    errorMessage.value = error instanceof LumiApiError ? error.message : '注册失败，请稍后重试'
    toast({
      title: '注册失败',
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
          <img class="brand-logo" :src="lumiLogo" alt="" />
        </div>
        <div>
          <p class="kicker">Lumi</p>
          <h1>创建账号</h1>
        </div>
      </div>

      <p class="auth-copy">注册后即可导入、整理和阅读你的图文知识库。</p>

      <form class="auth-form" @submit.prevent="submit">
        <label class="field-group">
          <span>用户名</span>
          <UiInput
            v-model.trim="username"
            autocomplete="username"
            placeholder="2-32 个字符"
          />
        </label>
        <label class="field-group">
          <span>密码</span>
          <div class="password-field">
            <UiInput
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="至少 6 位"
            />
            <button
              type="button"
              class="password-toggle"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click.prevent="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" :size="16" />
              <Eye v-else :size="16" />
            </button>
          </div>
        </label>
        <label class="field-group">
          <span>确认密码</span>
          <UiInput
            v-model="confirmPassword"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            placeholder="再次输入密码"
          />
        </label>
        <p v-if="errorMessage" class="inline-alert">{{ errorMessage }}</p>
        <UiButton class="auth-submit" :disabled="loading" type="submit">
          <UserPlus :size="17" />
          {{ loading ? '注册中...' : '注册' }}
        </UiButton>
      </form>

      <p class="auth-switch">
        已有账号？
        <RouterLink to="/login">直接登录</RouterLink>
      </p>
    </UiCard>
  </main>
</template>

<style scoped>
.password-field {
  position: relative;
}

.password-field .ui-input {
  padding-right: 40px;
}

.password-toggle {
  position: absolute;
  top: 50%;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  transform: translateY(-50%);
}

.password-toggle:hover {
  color: var(--fg-primary);
  background: var(--bg-secondary);
}

.auth-switch {
  margin-top: 14px;
  color: var(--fg-muted);
  font-size: 13px;
  text-align: center;
}

.auth-switch a {
  color: var(--fg-primary);
  font-weight: 500;
  text-underline-offset: 3px;
}
</style>
