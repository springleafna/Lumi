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
    showMessage(getErrorMessage(error, '无法读取当前页面'));
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
    showMessage('请先在设置页登录');
    return;
  }

  loading.value = true;
  message.value = '';
  savedDocument.value = undefined;
  try {
    const result = await action();
    savedDocument.value = result.document;
  } catch (error) {
    showMessage(getErrorMessage(error, '保存失败'));
  } finally {
    loading.value = false;
  }
}

async function openSavedDocument() {
  if (!settings.value || !savedDocument.value) return;
  await openDocument(settings.value, savedDocument.value);
}

function showMessage(text: string) {
  message.value = text;
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

    <button
      v-if="!isLoggedIn"
      class="status-card login-hint"
      type="button"
      @click="openOptionsPage"
    >
      <span class="status-dot muted"></span>
      <span class="status-text">
        <strong>未登录</strong>
        <span class="status-sub">点击前往设置页登录 Lumi</span>
      </span>
    </button>
    <section v-else class="status-card">
      <span class="status-dot"></span>
      <div>
        <strong>已连接</strong>
        <p>{{ settings?.user?.username }}</p>
      </div>
    </section>

    <section v-if="savedDocument" class="page-card result-card">
      <p class="section-label">保存成功</p>
      <h2>{{ savedDocument.title }}</h2>
      <button
        class="secondary-button result-button"
        type="button"
        @click="openSavedDocument"
      >
        查看文章
      </button>
    </section>
    <section v-else class="page-card">
      <p class="section-label">当前页面</p>
      <h2>{{ currentPage?.title || '未读取到标题' }}</h2>
      <p class="page-url">{{ currentPage?.url || '未读取到 URL' }}</p>
    </section>

    <div class="button-stack">
      <button class="primary-button" :disabled="loading || !isLoggedIn || !currentPage" type="button" @click="saveHtml">
        {{ loading ? '保存中...' : '保存完整页面' }}
      </button>
      <div class="button-row">
        <button class="secondary-button" :disabled="loading || !isLoggedIn || !currentPage" type="button" @click="saveUrl">
          保存当前 URL
        </button>
        <button class="secondary-button" :disabled="loading || !isLoggedIn || !currentPage" type="button" @click="saveSelection">
          保存选中内容
        </button>
      </div>
    </div>

    <p v-if="message" class="message error">{{ message }}</p>
  </main>
</template>
