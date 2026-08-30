<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useAuth } from '../composables/useAuth'
import { useTheme, type ThemeMode } from '../composables/useTheme'
import { getServerUrl, setServerUrl, TOKEN_KEY } from '../lib/client'

const APP_VERSION = '0.1.0'

const router = useRouter()
const { user, loadMe, logout } = useAuth()
const { mode: themeMode, setMode: setThemeMode } = useTheme()

const THEME_OPTIONS: Array<{ value: ThemeMode; text: string }> = [
  { value: 'light', text: '浅色' },
  { value: 'dark', text: '深色' },
  { value: 'system', text: '跟随系统' },
]

const serverUrl = ref(getServerUrl())
const editDialogOpen = ref(false)
const editingUrl = ref('')
const savingServer = ref(false)

onMounted(() => {
  loadMe().catch(() => {
    router.replace({ path: '/login', query: { redirect: '/settings' } })
  })
})

function openEditServer() {
  editingUrl.value = getServerUrl()
  editDialogOpen.value = true
}

async function saveServer() {
  const next = editingUrl.value.trim()
  if (!next || next === getServerUrl()) {
    editDialogOpen.value = false
    return
  }
  savingServer.value = true
  try {
    await fetch(`${next.replace(/\/+$/, '')}/api/auth/me`)
  } catch {
    showToast('无法连接到该地址')
    return
  } finally {
    savingServer.value = false
  }
  setServerUrl(next)
  serverUrl.value = getServerUrl()
  localStorage.removeItem(TOKEN_KEY)
  editDialogOpen.value = false
  showToast('服务器已更新，请重新登录')
  window.location.replace('/login')
}

async function confirmLogout() {
  try {
    await showConfirmDialog({ title: '退出登录', message: '确定退出当前账号吗？' })
  } catch {
    return
  }
  logout()
  router.replace('/login')
}
</script>

<template>
  <div class="settings-page">
    <van-nav-bar title="设置" />

    <div class="page-body">
      <van-cell-group inset title="账号">
        <van-cell title="当前用户" :value="user?.username || '...'" />
        <van-cell title="退出登录" is-link @click="confirmLogout" />
      </van-cell-group>

      <van-cell-group inset title="外观">
        <van-cell
          v-for="option in THEME_OPTIONS"
          :key="option.value"
          :title="option.text"
          clickable
          @click="setThemeMode(option.value)"
        >
          <template #value>
            <van-icon
              v-if="themeMode === option.value"
              name="success"
              color="var(--lumi-fg-primary)"
            />
          </template>
        </van-cell>
      </van-cell-group>

      <van-cell-group inset title="服务器">
        <van-cell title="服务器地址" :label="serverUrl" is-link @click="openEditServer" />
      </van-cell-group>

      <van-cell-group inset title="关于">
        <van-cell title="版本" :value="`v${APP_VERSION}`" />
      </van-cell-group>

      <p class="settings-footnote">AI / Embedding 配置请在桌面端 Web 的设置页管理。</p>
    </div>

    <van-dialog
      v-model:show="editDialogOpen"
      title="修改服务器地址"
      show-cancel-button
      @confirm="saveServer"
    >
      <van-field v-model="editingUrl" type="url" placeholder="https://your-server.com" />
    </van-dialog>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  background: var(--lumi-bg-page);
}

.settings-page .page-body {
  padding-top: 12px;
}

.settings-page :deep(.van-cell-group__title) {
  color: var(--lumi-fg-tertiary);
  font-size: 13px;
}

.settings-footnote {
  padding: 20px 16px;
  color: var(--lumi-fg-tertiary);
  font-size: 12px;
  text-align: center;
}
</style>
