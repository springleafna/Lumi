<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  FileText,
  Filter,
  LogOut,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import type {
  DocumentFacets,
  DocumentSort,
  DocumentStatus,
  DocumentSummary,
  DocumentType,
} from '@lumi/shared'
import { useAuth } from '../composables/useAuth'
import { client } from '../lib/client'

const router = useRouter()
const { logout } = useAuth()

const documentTypes: Array<{ value: DocumentType | ''; label: string }> = [
  { value: '', label: '全部' },
  { value: 'article', label: '文章' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'pdf', label: 'PDF' },
  { value: 'fragment', label: '片段' },
]

const statusOptions: Array<{ value: DocumentStatus; label: string }> = [
  { value: 'active', label: '全部' },
  { value: 'archived', label: '已归档' },
  { value: 'trash', label: '回收站' },
]

const sortOptions: Array<{ value: DocumentSort; label: string }> = [
  { value: 'created_desc', label: '最新创建' },
  { value: 'created_asc', label: '最早创建' },
  { value: 'updated_desc', label: '最近更新' },
  { value: 'updated_asc', label: '最早更新' },
]

const documents = ref<DocumentSummary[]>([])
const facets = ref<DocumentFacets>({ tags: [], sources: [] })
const keyword = ref('')
const status = ref<DocumentStatus>('active')
const type = ref<DocumentType | ''>('')
const tag = ref('')
const source = ref('')
const sort = ref<DocumentSort>('created_desc')
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const actionLoadingId = ref('')
const errorMessage = ref('')
const showImportDialog = ref(false)
const importUrl = ref('')
const importLoading = ref(false)

const selectedTagName = computed(
  () => facets.value.tags.find((item) => item.id === tag.value)?.name,
)

const activeFilterCount = computed(
  () =>
    Number(Boolean(keyword.value)) +
    Number(status.value !== 'active') +
    Number(Boolean(type.value)) +
    Number(Boolean(tag.value)) +
    Number(Boolean(source.value)),
)

onMounted(async () => {
  await Promise.all([loadDocuments(), loadFacets()])
})

async function loadDocuments() {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await client.documents.list({
      keyword: keyword.value || undefined,
      status: status.value,
      type: type.value || undefined,
      tag: tag.value || undefined,
      source: source.value || undefined,
      sort: sort.value,
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

async function loadFacets() {
  try {
    facets.value = await client.documents.facets()
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '筛选项加载失败')
  }
}

async function applyFilters() {
  page.value = 1
  await loadDocuments()
}

async function clearFilters() {
  keyword.value = ''
  status.value = 'active'
  type.value = ''
  tag.value = ''
  source.value = ''
  sort.value = 'created_desc'
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
    await loadFacets()
    await router.push(`/documents/${result.document.id}`)
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '导入失败')
  } finally {
    importLoading.value = false
  }
}

async function archiveDocument(document: DocumentSummary) {
  await runDocumentAction(document.id, async () => {
    await client.documents.archive(document.id)
  })
}

async function unarchiveDocument(document: DocumentSummary) {
  await runDocumentAction(document.id, async () => {
    await client.documents.unarchive(document.id)
  })
}

async function restoreDocument(document: DocumentSummary) {
  await runDocumentAction(document.id, async () => {
    await client.documents.restore(document.id)
  })
}

async function deleteDocument(document: DocumentSummary) {
  if (!confirm(`确认删除《${document.title}》吗？文章会进入回收站。`)) return
  await runDocumentAction(document.id, async () => {
    await client.documents.delete(document.id)
  })
}

async function permanentlyDeleteDocument(document: DocumentSummary) {
  if (!confirm(`确认永久删除《${document.title}》吗？此操作不可恢复。`)) return
  await runDocumentAction(document.id, async () => {
    await client.documents.permanentDelete(document.id)
  })
}

async function runDocumentAction(id: string, action: () => Promise<void>) {
  actionLoadingId.value = id
  errorMessage.value = ''
  try {
    await action()
    await Promise.all([loadDocuments(), loadFacets()])
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '操作失败')
  } finally {
    actionLoadingId.value = ''
  }
}

async function nextPage() {
  page.value += 1
  await loadDocuments()
}

async function prevPage() {
  page.value -= 1
  await loadDocuments()
}

function openDocument(document: DocumentSummary) {
  router.push(`/documents/${document.id}`)
}

function signOut() {
  logout()
  router.push('/login')
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function documentTypeLabel(value: DocumentType) {
  return documentTypes.find((item) => item.value === value)?.label || value
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof LumiApiError ? error.message : fallback
}
</script>

<template>
  <main class="app-shell workspace-shell">
    <aside class="filter-sidebar">
      <div class="sidebar-head">
        <div>
          <p class="eyebrow">Lumi</p>
          <h1>知识库</h1>
        </div>
        <Filter :size="20" />
      </div>

      <form class="sidebar-search" @submit.prevent="applyFilters">
        <Search :size="17" />
        <input v-model.trim="keyword" placeholder="搜索标题、摘要或正文" />
      </form>

      <section class="filter-group">
        <div class="filter-title">
          <span>状态</span>
        </div>
        <button
          v-for="option in statusOptions"
          :key="option.value"
          class="filter-option"
          :class="{ active: status === option.value }"
          type="button"
          @click="status = option.value; applyFilters()"
        >
          <span>{{ option.label }}</span>
        </button>
      </section>

      <section class="filter-group">
        <div class="filter-title">
          <span>类型</span>
        </div>
        <button
          v-for="option in documentTypes"
          :key="option.value || 'all'"
          class="filter-option"
          :class="{ active: type === option.value }"
          type="button"
          @click="type = option.value; applyFilters()"
        >
          <span>{{ option.label }}</span>
        </button>
      </section>

      <section class="filter-group">
        <div class="filter-title">
          <span>标签</span>
          <button v-if="tag" class="plain-button" type="button" @click="tag = ''; applyFilters()">
            清除
          </button>
        </div>
        <button
          v-for="item in facets.tags"
          :key="item.id"
          class="filter-option"
          :class="{ active: tag === item.id }"
          type="button"
          @click="tag = item.id; applyFilters()"
        >
          <span>{{ item.name }}</span>
          <small>{{ item.count || 0 }}</small>
        </button>
        <p v-if="facets.tags.length === 0" class="muted-text">暂无标签</p>
      </section>

      <section class="filter-group">
        <div class="filter-title">
          <span>来源</span>
          <button
            v-if="source"
            class="plain-button"
            type="button"
            @click="source = ''; applyFilters()"
          >
            清除
          </button>
        </div>
        <button
          v-for="item in facets.sources"
          :key="item.source"
          class="filter-option"
          :class="{ active: source === item.source }"
          type="button"
          @click="source = item.source; applyFilters()"
        >
          <span>{{ item.source }}</span>
          <small>{{ item.count }}</small>
        </button>
        <p v-if="facets.sources.length === 0" class="muted-text">暂无来源</p>
      </section>
    </aside>

    <section class="workspace-main">
      <header class="topbar workspace-topbar">
        <div>
          <p class="eyebrow">Library</p>
          <h2>文章管理</h2>
          <p class="topbar-subtitle">
            共 {{ total }} 篇
            <span v-if="selectedTagName"> · 标签：{{ selectedTagName }}</span>
            <span v-if="source"> · 来源：{{ source }}</span>
          </p>
        </div>
        <div class="topbar-actions">
          <select v-model="sort" class="sort-select" @change="applyFilters">
            <option v-for="option in sortOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
          <button
            v-if="activeFilterCount"
            class="secondary-button"
            type="button"
            @click="clearFilters"
          >
            <X :size="17" />
            清除筛选
          </button>
          <button class="secondary-button" type="button" @click="showImportDialog = true">
            <Plus :size="18" />
            导入
          </button>
          <button class="icon-button" title="退出登录" type="button" @click="signOut">
            <LogOut :size="18" />
          </button>
        </div>
      </header>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

      <section class="document-list">
        <div v-if="loading" class="empty-state">正在加载...</div>
        <div v-else-if="documents.length === 0" class="empty-state">
          <FileText :size="34" />
          <span>暂无匹配文章</span>
        </div>
        <article
          v-for="document in documents"
          v-else
          :key="document.id"
          class="document-card"
        >
          <button class="document-card-main" type="button" @click="openDocument(document)">
            <div class="document-card-titleline">
              <h3>{{ document.title }}</h3>
              <span class="type-badge">{{ documentTypeLabel(document.type) }}</span>
            </div>
            <p>{{ document.excerpt || '暂无摘要' }}</p>
            <div class="tag-row" v-if="document.tags.length">
              <span v-for="item in document.tags" :key="item.id" class="tag-pill">
                {{ item.name }}
              </span>
            </div>
            <div class="meta-line">
              <span>{{ document.source || '未知来源' }}</span>
              <span>{{ formatDate(document.createdAt) }}</span>
              <span v-if="document.wordCount">{{ document.wordCount }} 字</span>
            </div>
          </button>

          <div class="card-actions">
            <button
              v-if="status === 'trash'"
              class="secondary-button compact-icon"
              :disabled="actionLoadingId === document.id"
              title="恢复"
              type="button"
              @click="restoreDocument(document)"
            >
              <RotateCcw :size="17" />
            </button>
            <button
              v-if="status === 'trash'"
              class="danger-button compact-icon"
              :disabled="actionLoadingId === document.id"
              title="永久删除"
              type="button"
              @click="permanentlyDeleteDocument(document)"
            >
              <Trash2 :size="17" />
            </button>
            <button
              v-if="status === 'archived'"
              class="secondary-button compact-icon"
              :disabled="actionLoadingId === document.id"
              title="取消归档"
              type="button"
              @click="unarchiveDocument(document)"
            >
              <ArchiveRestore :size="17" />
            </button>
            <button
              v-if="status === 'active'"
              class="secondary-button compact-icon"
              :disabled="actionLoadingId === document.id"
              title="归档"
              type="button"
              @click="archiveDocument(document)"
            >
              <Archive :size="17" />
            </button>
            <button
              v-if="status !== 'trash'"
              class="danger-button compact-icon"
              :disabled="actionLoadingId === document.id"
              title="删除"
              type="button"
              @click="deleteDocument(document)"
            >
              <Trash2 :size="17" />
            </button>
            <a
              v-if="document.url"
              class="secondary-button compact-icon"
              :href="document.url"
              rel="noreferrer"
              target="_blank"
              title="打开原文"
              @click.stop
            >
              <ExternalLink :size="17" />
            </a>
          </div>
        </article>
      </section>

      <footer class="pagination">
        <button class="secondary-button" :disabled="page <= 1" type="button" @click="prevPage">
          上一页
        </button>
        <span>第 {{ page }} 页 / 共 {{ total }} 篇</span>
        <button
          class="secondary-button"
          :disabled="page * pageSize >= total"
          type="button"
          @click="nextPage"
        >
          下一页
        </button>
      </footer>
    </section>

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
