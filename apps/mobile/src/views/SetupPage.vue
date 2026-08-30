<script setup lang="ts">
import { ref } from 'vue'
import { showToast } from 'vant'
import { setServerUrl } from '../lib/client'

const serverUrl = ref('')
const testing = ref(false)

async function submit() {
  const value = serverUrl.value.trim()
  if (!value) {
    showToast('请输入服务器地址')
    return
  }
  testing.value = true
  try {
    // 能收到任何 HTTP 响应（含 401）即视为可达，断网才会抛 TypeError
    await fetch(`${value.replace(/\/+$/, '')}/api/auth/me`)
  } catch {
    showToast('无法连接到该地址，请检查网络或地址')
    return
  } finally {
    testing.value = false
  }
  setServerUrl(value)
  // 整页跳转重建模块，让 client 拿到新的 baseUrl（SPA 导航不会重建单例）。
  window.location.replace('/login')
}
</script>

<template>
  <div class="setup-page safe-area-top safe-area-bottom">
    <div class="setup-brand">
      <img class="setup-logo" src="../assets/lumi-logo.svg" alt="Lumi" />
      <h1>欢迎使用 Lumi</h1>
      <p>先填写你的 Lumi 服务器地址，只需配置一次。</p>
    </div>

    <div class="setup-form">
      <van-field
        v-model="serverUrl"
        type="url"
        label="服务器"
        placeholder="https://your-server.com"
        clearable
        @keyup.enter="submit"
      />
      <p class="setup-hint">示例：https://lumi.example.com（不含 /api 后缀）</p>
      <van-button type="primary" block round :loading="testing" @click="submit">
        {{ testing ? '正在连接...' : '连接并继续' }}
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.setup-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  justify-content: center;
  padding: 32px 24px;
  background: var(--lumi-bg-primary);
}

.setup-brand {
  margin-bottom: 40px;
  text-align: center;
}

.setup-logo {
  width: 56px;
  height: 56px;
  margin-bottom: 16px;
}

.setup-brand h1 {
  margin-bottom: 8px;
  color: var(--lumi-fg-primary);
  font-size: 22px;
  font-weight: 600;
}

.setup-brand p {
  color: var(--lumi-fg-muted);
  font-size: 14px;
}

.setup-form .van-button {
  margin-top: 20px;
}

.setup-hint {
  margin-top: 8px;
  color: var(--lumi-fg-tertiary);
  font-size: 12px;
}
</style>
