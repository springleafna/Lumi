<script setup lang="ts">
import { FileText, LogOut, Plus, Search, X } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import type { DocumentSummary } from '@lumi/shared'
import { useAuth } from '../composables/useAuth'
import { client } from '../lib/client'

const router = useRouter()
const { logout } = useAuth()

const documents = ref<DocumentSummary[]>([])
const keyword = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const errorMessage = ref('')
const showImportDialog = ref(false)
const importUrl = ref('')
const importLoading = ref(false)

onMounted(loadDocuments)

async function loadDocuments() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await client.documents.list({
      keyword: keyword.value || undefined,
      page: page.value,
      pageSize,
    })
    documents.value = result.items
    total.value = result.total
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '文章列表加载失败')
  } finally {
    loading.value = false
  }
}

async function search() {
  page.value = 1
  await loadDocuments()
}

async function importDocument() {
  importLoading.value = true
  errorMessage.value = ''
  try {
    const result = await client.ingest.url({ url: importUrl.value })
    showImportDialog.value = false
    importUrl.value = ''
    await router.push(`/documents/${result.document.id}`)
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '导入失败')
  } finally {
    importLoading.value = false
  }
}

function signOut() {
  logout()
  router.push('/login')
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof LumiApiError ? error.message : fallback
}
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Lumi Knowledge</p>
        <h1>文章</h1>
      </div>
      <div class="topbar-actions">
        <button class="secondary-button" type="button" @click="showImportDialog = true">
          <Plus :size="18" />
          导入文章
        </button>
        <button class="icon-button" title="退出登录" type="button" @click="signOut">
          <LogOut :size="18" />
        </button>
      </div>
    </header>

    <section class="toolbar">
      <form class="search-form" @submit.prevent="search">
        <Search :size="18" />
        <input v-model.trim="keyword" placeholder="搜索标题或正文" />
        <button class="primary-button compact" type="submit">搜索</button>
      </form>
    </section>

    <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

    <section class="list-panel">
      <div v-if="loading" class="empty-state">正在加载...</div>
      <div v-else-if="documents.length === 0" class="empty-state">
        <FileText :size="34" />
        <span>还没有文章，导入一篇公开网页开始使用。</span>
      </div>
      <article
        v-for="document in documents"
        v-else
        :key="document.id"
        class="document-row"
        @click="router.push(`/documents/${document.id}`)"
      >
        <div>
          <h2>{{ document.title }}</h2>
          <p>{{ document.excerpt || '暂无摘要' }}</p>
          <div class="meta-line">
            <span>{{ document.source || '未知来源' }}</span>
            <span>{{ new Date(document.createdAt).toLocaleString() }}</span>
            <span v-if="document.wordCount">{{ document.wordCount }} 字</span>
          </div>
        </div>
      </article>
    </section>

    <footer class="pagination">
      <button
        class="secondary-button"
        :disabled="page <= 1"
        type="button"
        @click="page--; loadDocuments()"
      >
        上一页
      </button>
      <span>第 {{ page }} 页 / 共 {{ total }} 篇</span>
      <button
        class="secondary-button"
        :disabled="page * pageSize >= total"
        type="button"
        @click="page++; loadDocuments()"
      >
        下一页
      </button>
    </footer>

    <div v-if="showImportDialog" class="dialog-backdrop" @click.self="showImportDialog = false">
      <section class="dialog-panel">
        <button class="dialog-close" title="关闭" type="button" @click="showImportDialog = false">
          <X :size="18" />
        </button>
        <h2>导入文章</h2>
        <p>输入后端可直接访问的公开网页 URL。</p>
        <form class="form-stack" @submit.prevent="importDocument">
          <label>
            <span>URL</span>
            <input v-model.trim="importUrl" placeholder="https://example.com/article" />
          </label>
          <button class="primary-button" :disabled="importLoading" type="submit">
            {{ importLoading ? '导入中...' : '确认导入' }}
          </button>
        </form>
      </section>
    </div>
  </main>
</template>
