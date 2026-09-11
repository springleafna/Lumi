<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { LumiApiError } from '@lumi/api-client';
import type { UserDto } from '@lumi/shared';
import { createExtensionClient } from '../../utils/api';
import { clearAuth, getSettings, saveSettings } from '../../utils/storage';
import lumiLogo from '../../assets/lumi-logo.svg';

const apiBaseUrl = ref('http://127.0.0.1:3000/api');
const webBaseUrl = ref('http://localhost:5173');
const username = ref('admin');
const password = ref('');
const user = ref<UserDto | undefined>();
const accessToken = ref<string | undefined>();
const showLoginForm = ref(false);
const loading = ref(false);
const message = ref('');
const messageType = ref<'ok' | 'error'>('ok');

const isLoggedIn = computed(() => Boolean(accessToken.value));

onMounted(load);

async function load() {
  const settings = await getSettings();
  apiBaseUrl.value = settings.apiBaseUrl;
  webBaseUrl.value = settings.webBaseUrl;
  user.value = settings.user;
  accessToken.value = settings.accessToken;
}

/** 地址失焦 / 回车时静默保存，值没变时不提示。 */
async function persistBaseSettings() {
  const api = normalizeBaseUrl(apiBaseUrl.value);
  const web = normalizeBaseUrl(webBaseUrl.value);
  const current = await getSettings();
  if (current.apiBaseUrl === api && current.webBaseUrl === web) return;
  await saveSettings({ apiBaseUrl: api, webBaseUrl: web });
  await load();
  showMessage('设置已保存', 'ok');
}

async function login() {
  loading.value = true;
  try {
    await persistBaseSettings();
    const settings = await getSettings();
    const client = await createExtensionClient(settings);
    const result = await client.auth.login({
      username: username.value,
      password: password.value,
    });
    await saveSettings({
      accessToken: result.accessToken,
      user: result.user,
    });
    password.value = '';
    showLoginForm.value = false;
    await load();
    showMessage(`已登录：${result.user.username}`, 'ok');
  } catch (error) {
    showMessage(getErrorMessage(error, '登录失败'), 'error');
  } finally {
    loading.value = false;
  }
}

async function testConnection() {
  loading.value = true;
  try {
    await persistBaseSettings();
    const settings = await getSettings();
    const client = await createExtensionClient(settings);
    const me = await client.auth.me();
    await saveSettings({ user: me });
    await load();
    showMessage(`连接正常：${me.username}`, 'ok');
  } catch (error) {
    if (error instanceof LumiApiError && isUnauthorized(error)) {
      showMessage('服务可达，但尚未登录或登录已失效', 'ok');
    } else {
      showMessage(getErrorMessage(error, '连接失败'), 'error');
    }
  } finally {
    loading.value = false;
  }
}

async function logout() {
  await clearAuth();
  showLoginForm.value = false;
  await load();
  showMessage('已退出登录', 'ok');
}

function isUnauthorized(error: LumiApiError) {
  return error.status === 401 || error.code === 'UNAUTHORIZED';
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, '');
}

function showMessage(text: string, type: 'ok' | 'error') {
  message.value = text;
  messageType.value = type;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof LumiApiError) {
    return error.code === 'NETWORK_ERROR'
      ? '无法连接服务，请检查 API 地址是否正确'
      : error.message;
  }
  return fallback;
}
</script>

<template>
  <main class="settings-page">
    <section class="panel">
      <header class="settings-header">
        <div class="brand-block">
          <img class="brand-logo" :src="lumiLogo" alt="" />
          <div>
            <p class="eyebrow">Lumi Extension</p>
            <h1>插件设置</h1>
          </div>
        </div>
        <div class="account-pill" :class="{ muted: !user }">
          <span class="pill-dot"></span>
          {{ user ? `已登录：${user.username}` : '未登录' }}
        </div>
      </header>
      <p class="lead">配置本地服务地址，并在插件中登录 Lumi。</p>

      <div v-if="message" class="message" :class="messageType">
        {{ message }}
      </div>

      <div class="form-card">
        <label>
          <span>API 地址</span>
          <input
            v-model.trim="apiBaseUrl"
            placeholder="http://127.0.0.1:3000/api"
            @blur="persistBaseSettings"
            @keydown.enter.prevent="persistBaseSettings"
          />
        </label>
        <label>
          <span>Web 地址</span>
          <input
            v-model.trim="webBaseUrl"
            placeholder="http://localhost:5173"
            @blur="persistBaseSettings"
            @keydown.enter.prevent="persistBaseSettings"
          />
        </label>

        <div class="actions">
          <button class="secondary-button" :disabled="loading" type="button" @click="testConnection">
            测试连接
          </button>
        </div>
      </div>

      <section class="section">
        <div class="section-heading">
          <h2>账号</h2>
          <p>{{ user ? `当前登录：${user.username}` : '当前未登录。' }}</p>
        </div>

        <div v-if="isLoggedIn && !showLoginForm" class="actions">
          <button
            class="secondary-button"
            :disabled="loading"
            type="button"
            @click="showLoginForm = true"
          >
            切换账号
          </button>
          <button
            class="danger-button"
            :disabled="loading"
            type="button"
            @click="logout"
          >
            退出登录
          </button>
        </div>

        <form v-else class="form-stack" @submit.prevent="login">
          <label>
            <span>用户名</span>
            <input v-model.trim="username" autocomplete="username" />
          </label>
          <label>
            <span>密码</span>
            <input v-model="password" autocomplete="current-password" type="password" />
          </label>
          <div class="actions">
            <button class="primary-button" :disabled="loading" type="submit">
              {{ loading ? '处理中...' : '登录' }}
            </button>
            <button
              v-if="isLoggedIn"
              class="secondary-button"
              :disabled="loading"
              type="button"
              @click="showLoginForm = false"
            >
              取消
            </button>
          </div>
        </form>
      </section>
    </section>
  </main>
</template>
