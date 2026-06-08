<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { LumiApiError } from '@lumi/api-client';
import type { DocumentDetail } from '@lumi/shared';
import { createExtensionClient } from '../../utils/api';
import {
  capturePageHtml,
  capturePageUrl,
  captureSelection,
  type CapturedPageUrl,
} from '../../utils/capture';
import { openDocument, openOptionsPage } from '../../utils/navigation';
import { getSettings, type ExtensionSettings } from '../../utils/storage';
import lumiLogo from '../../assets/lumi-logo.svg';

const settings = ref<ExtensionSettings>();
const currentPage = ref<CapturedPageUrl>();
const savedDocument = ref<DocumentDetail>();
const loading = ref(false);
const message = ref('');
const messageType = ref<'ok' | 'error'>('ok');

const isLoggedIn = computed(() => Boolean(settings.value?.accessToken));

onMounted(async () => {
  await refreshSettings();
  await loadCurrentPage();
});

async function refreshSettings() {
  settings.value = await getSettings();
}

async function loadCurrentPage() {
  try {
    currentPage.value = await capturePageUrl();
  } catch (error) {
    showMessage(getErrorMessage(error, '无法读取当前页面'), 'error');
  }
}

async function saveUrl() {
  if (!currentPage.value) return;
  await runSave(async () => {
    const client = await createExtensionClient(settings.value);
    return client.ingest.url({ url: currentPage.value!.url });
  });
}

async function saveHtml() {
  await runSave(async () => {
    const page = await capturePageHtml();
    const client = await createExtensionClient(settings.value);
    return client.ingest.html({
      url: page.url,
      title: page.title,
      html: page.html,
    });
  });
}

async function saveSelection() {
  await runSave(async () => {
    const selection = await captureSelection();
    const client = await createExtensionClient(settings.value);
    return client.ingest.selection({
      url: selection.url,
      title: selection.title,
      selectedHtml: selection.selectedHtml,
      selectedText: selection.selectedText,
    });
  });
}

async function runSave(
  action: () => Promise<{ document: DocumentDetail }>,
) {
  if (!settings.value?.accessToken) {
    showMessage('请先在设置页登录', 'error');
    return;
  }

  loading.value = true;
  savedDocument.value = undefined;
  try {
    const result = await action();
    savedDocument.value = result.document;
    showMessage(`保存成功：${result.document.title}`, 'ok');
  } catch (error) {
    showMessage(getErrorMessage(error, '保存失败'), 'error');
  } finally {
    loading.value = false;
  }
}

async function openSavedDocument() {
  if (!settings.value || !savedDocument.value) return;
  await openDocument(settings.value, savedDocument.value);
}

function showMessage(text: string, type: 'ok' | 'error') {
  message.value = text;
  messageType.value = type;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof LumiApiError || error instanceof Error
    ? error.message
    : fallback;
}
</script>

<template>
  <main class="popup-shell">
    <header class="popup-header">
      <div class="brand-block">
        <img class="brand-logo" :src="lumiLogo" alt="" />
        <div>
          <p class="eyebrow">Lumi</p>
          <h1>保存页面</h1>
        </div>
      </div>
      <button class="icon-button" title="设置" type="button" @click="openOptionsPage">设置</button>
    </header>

    <section class="status-card">
      <span class="status-dot" :class="{ muted: !isLoggedIn }"></span>
      <div>
        <strong>{{ isLoggedIn ? '已连接' : '未登录' }}</strong>
        <p v-if="settings?.user">{{ settings.user.username }}</p>
        <p v-else>请先进入设置页登录。</p>
      </div>
    </section>

    <section class="page-card">
      <p class="section-label">当前页面</p>
      <h2>{{ currentPage?.title || '未读取到标题' }}</h2>
      <p>{{ currentPage?.url || '未读取到 URL' }}</p>
    </section>

    <p v-if="message" class="message" :class="messageType">{{ message }}</p>

    <div class="button-stack">
      <button class="primary-button" :disabled="loading || !isLoggedIn || !currentPage" type="button" @click="saveHtml">
        {{ loading ? '保存中...' : '保存完整页面' }}
      </button>
      <button class="secondary-button" :disabled="loading || !isLoggedIn || !currentPage" type="button" @click="saveUrl">
        保存当前 URL
      </button>
      <button class="secondary-button" :disabled="loading || !isLoggedIn || !currentPage" type="button" @click="saveSelection">
        保存选中内容
      </button>
      <button
        v-if="savedDocument"
        class="secondary-button"
        type="button"
        @click="openSavedDocument"
      >
        打开文章
      </button>
    </div>
  </main>
</template>
