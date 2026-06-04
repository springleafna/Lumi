<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { LumiApiError } from '@lumi/api-client';
import type { UserDto } from '@lumi/shared';
import { createExtensionClient } from '../../utils/api';
import { clearAuth, getSettings, saveSettings } from '../../utils/storage';

const apiBaseUrl = ref('http://localhost:3000/api');
const webBaseUrl = ref('http://localhost:5173');
const username = ref('admin');
const password = ref('');
const user = ref<UserDto | undefined>();
const accessToken = ref<string | undefined>();
const loading = ref(false);
const message = ref('');
const messageType = ref<'ok' | 'error'>('ok');

onMounted(load);

async function load() {
  const settings = await getSettings();
  apiBaseUrl.value = settings.apiBaseUrl;
  webBaseUrl.value = settings.webBaseUrl;
  user.value = settings.user;
  accessToken.value = settings.accessToken;
}

async function saveBaseSettings() {
  await saveSettings({
    apiBaseUrl: normalizeBaseUrl(apiBaseUrl.value),
    webBaseUrl: normalizeBaseUrl(webBaseUrl.value),
  });
  await load();
  showMessage('设置已保存', 'ok');
}

async function login() {
  loading.value = true;
  try {
    await saveBaseSettings();
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
    await saveBaseSettings();
    const settings = await getSettings();
    const client = await createExtensionClient(settings);
    const me = await client.auth.me();
    await saveSettings({ user: me });
    await load();
    showMessage(`连接正常：${me.username}`, 'ok');
  } catch (error) {
    showMessage(getErrorMessage(error, '连接失败或需要重新登录'), 'error');
  } finally {
    loading.value = false;
  }
}

async function logout() {
  await clearAuth();
  await load();
  showMessage('已退出登录', 'ok');
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, '');
}

function showMessage(text: string, type: 'ok' | 'error') {
  message.value = text;
  messageType.value = type;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof LumiApiError ? error.message : fallback;
}
</script>

<template>
  <main class="settings-page">
    <section class="panel">
      <p class="eyebrow">Lumi Extension</p>
      <h1>插件设置</h1>
      <p>配置本地服务地址，并在插件中登录 Lumi。</p>

      <div v-if="message" class="message" :class="messageType">
        {{ message }}
      </div>

      <div class="form-stack">
        <label>
          <span>API 地址</span>
          <input v-model.trim="apiBaseUrl" placeholder="http://localhost:3000/api" />
        </label>
        <label>
          <span>Web 地址</span>
          <input v-model.trim="webBaseUrl" placeholder="http://localhost:5173" />
        </label>
      </div>

      <div class="actions">
        <button class="secondary-button" :disabled="loading" type="button" @click="saveBaseSettings">
          保存设置
        </button>
        <button class="secondary-button" :disabled="loading || !accessToken" type="button" @click="testConnection">
          测试连接
        </button>
      </div>

      <section class="section">
        <h2>账号</h2>
        <p v-if="user">当前登录：{{ user.username }}</p>
        <p v-else>当前未登录。</p>

        <form class="form-stack" @submit.prevent="login">
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
            <button class="danger-button" :disabled="loading || !accessToken" type="button" @click="logout">
              退出登录
            </button>
          </div>
        </form>
      </section>
    </section>
  </main>
</template>
