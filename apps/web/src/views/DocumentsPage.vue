<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  BookOpenText,
  ExternalLink,
  FileText,
  Globe2,
  Layers3,
  LogOut,
  Plus,
  RotateCcw,
  Tag,
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
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import UiCard from '../components/ui/Card.vue'
import UiDialog from '../components/ui/Dialog.vue'
import UiEmptyState from '../components/ui/EmptyState.vue'
import UiInput from '../components/ui/Input.vue'
import UiSearchInput from '../components/ui/SearchInput.vue'
import UiSelect from '../components/ui/Select.vue'
import UiTabs from '../components/ui/Tabs.vue'
import { useAuth } from '../composables/useAuth'
import { useToast } from '../composables/useToast'
import { client } from '../lib/client'

type ConfirmDialogState = {
  title: string
  description: string
  actionLabel: string
  run: () => Promise<void>
}

const router = useRouter()
const { logout } = useAuth()
const { toast } = useToast()

const documentTypes: Array<{ value: DocumentType | ''; label: string }> = [
  { value: '', label: '全部类型' },
  { value: 'article', label: '文章' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'pdf', label: 'PDF' },
  { value: 'fragment', label: '片段' },
]

const statusOptions: Array<{ value: DocumentStatus; label: string }> = [
  { value: 'active', label: '阅读库' },
  { value: 'archived', label: '归档' },
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
const confirmDialog = ref<ConfirmDialogState | null>(null)
const confirmLoading = ref(false)

const statusTabs = computed(() =>
  statusOptions.map((item) => ({
    value: item.value,
    label: item.label,
  })),
)

const selectedTagName = computed(
  () => facets.value.tags.find((item) => item.id === tag.value)?.name,
)

const activeFilterCount = computed(
  () =>
    Number(Boolean(keyword.value)) +
    Number(Boolean(type.value)) +
    Number(Boolean(tag.value)) +
    Number(Boolean(source.value)),
)

const pageTitle = computed(
  () => statusOptions.find((item) => item.value === status.value)?.label ?? '阅读库',
)

const pageDescription = computed(() => {
  const parts = [`共 ${total.value} 篇`]
  if (selectedTagName.value) parts.push(`标签：${selectedTagName.value}`)
  if (source.value) parts.push(`来源：${source.value}`)
  return parts.join(' · ')
})

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
    notifyError(error, '文章列表加载失败')
  } finally {
    loading.value = false
  }
}

async function loadFacets() {
  try {
    facets.value = await client.documents.facets()
  } catch (error) {
    notifyError(error, '筛选项加载失败')
  }
}

async function applyFilters() {
  page.value = 1
  await loadDocuments()
}

async function clearFilters() {
  keyword.value = ''
  type.value = ''
  tag.value = ''
  source.value = ''
  sort.value = 'created_desc'
  page.value = 1
  await loadDocuments()
}

async function changeStatus(value: string) {
  status.value = value as DocumentStatus
  page.value = 1
  await loadDocuments()
}

async function changeType(value: DocumentType | '') {
  type.value = value
  await applyFilters()
}

async function changeTag(value: string) {
  tag.value = tag.value === value ? '' : value
  await applyFilters()
}

async function changeSource(value: string) {
  source.value = source.value === value ? '' : value
  await applyFilters()
}

async function importDocument() {
  importLoading.value = true
  errorMessage.value = ''
  try {
    const result = await client.ingest.url({ url: importUrl.value })
    showImportDialog.value = false
    importUrl.value = ''
    toast({
      title: '导入完成',
      description: '文章已保存到 Lumi 阅读库。',
      variant: 'success',
    })
    await loadFacets()
    await router.push(`/documents/${result.document.id}`)
  } catch (error) {
    notifyError(error, '导入失败')
  } finally {
    importLoading.value = false
  }
}

async function archiveDocument(document: DocumentSummary) {
  await runDocumentAction(document.id, '已归档', async () => {
    await client.documents.archive(document.id)
  })
}

async function unarchiveDocument(document: DocumentSummary) {
  await runDocumentAction(document.id, '已移回阅读库', async () => {
    await client.documents.unarchive(document.id)
  })
}

async function restoreDocument(document: DocumentSummary) {
  await runDocumentAction(document.id, '已恢复', async () => {
    await client.documents.restore(document.id)
  })
}

function requestDeleteDocument(document: DocumentSummary) {
  confirmDialog.value = {
    title: '删除文章',
    description: `确认删除《${document.title}》吗？文章会进入回收站。`,
    actionLabel: '删除',
    run: async () => {
      await runDocumentAction(document.id, '已移入回收站', async () => {
        await client.documents.delete(document.id)
      })
    },
  }
}

function requestPermanentlyDeleteDocument(document: DocumentSummary) {
  confirmDialog.value = {
    title: '永久删除',
    description: `确认永久删除《${document.title}》吗？此操作不可恢复。`,
    actionLabel: '永久删除',
    run: async () => {
      await runDocumentAction(document.id, '已永久删除', async () => {
        await client.documents.permanentDelete(document.id)
      })
    },
  }
}

async function confirmDialogAction() {
  const current = confirmDialog.value
  if (!current) return

  confirmLoading.value = true
  try {
    await current.run()
    confirmDialog.value = null
  } finally {
    confirmLoading.value = false
  }
}

async function runDocumentAction(id: string, successTitle: string, action: () => Promise<void>) {
  actionLoadingId.value = id
  errorMessage.value = ''
  try {
    await action()
    toast({ title: successTitle, variant: 'success' })
    await Promise.all([loadDocuments(), loadFacets()])
  } catch (error) {
    notifyError(error, '操作失败')
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
  toast({ title: '已退出登录' })
  router.push('/login')
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function documentTypeLabel(value: DocumentType) {
  return documentTypes.find((item) => item.value === value)?.label || value
}

function documentStatusVariant(document: DocumentSummary) {
  if (document.deletedAt) return 'destructive'
  if (document.archivedAt) return 'neutral'
  return 'strong'
}

function documentStatusLabel(document: DocumentSummary) {
  if (document.deletedAt) return '回收站'
  if (document.archivedAt) return '已归档'
  return '阅读中'
}

function notifyError(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback)
  errorMessage.value = message
  toast({
    title: fallback,
    description: message,
    variant: 'destructive',
  })
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof LumiApiError ? error.message : fallback
}
</script>

<template>
  <main class="library-layout">
    <aside class="library-sidebar">
      <div class="sidebar-brand">
        <div class="brand-mark">
          <BookOpenText :size="19" />
        </div>
        <div>
          <p>Lumi</p>
          <h1>阅读库</h1>
        </div>
      </div>

      <form class="sidebar-search-form" @submit.prevent="applyFilters">
        <UiSearchInput v-model="keyword" placeholder="搜索标题、摘要或正文" />
      </form>

      <section class="sidebar-section">
        <div class="section-heading">
          <Layers3 :size="14" />
          <span>类型</span>
        </div>
        <div class="sidebar-list">
          <button
            v-for="option in documentTypes"
            :key="option.value || 'all'"
            class="sidebar-item"
            :class="{ 'is-active': type === option.value }"
            type="button"
            @click="changeType(option.value)"
          >
            <span>{{ option.label }}</span>
          </button>
        </div>
      </section>

      <section class="sidebar-section">
        <div class="section-heading">
          <Tag :size="14" />
          <span>标签</span>
        </div>
        <div v-if="facets.tags.length" class="sidebar-list">
          <button
            v-for="item in facets.tags"
            :key="item.id"
            class="sidebar-item"
            :class="{ 'is-active': tag === item.id }"
            type="button"
            @click="changeTag(item.id)"
          >
            <span>{{ item.name }}</span>
            <small>{{ item.count || 0 }}</small>
          </button>
        </div>
        <p v-else class="subtle-text">暂无标签</p>
      </section>

      <section class="sidebar-section">
        <div class="section-heading">
          <Globe2 :size="14" />
          <span>来源</span>
        </div>
        <div v-if="facets.sources.length" class="sidebar-list">
          <button
            v-for="item in facets.sources"
            :key="item.source"
            class="sidebar-item"
            :class="{ 'is-active': source === item.source }"
            type="button"
            @click="changeSource(item.source)"
          >
            <span>{{ item.source }}</span>
            <small>{{ item.count }}</small>
          </button>
        </div>
        <p v-else class="subtle-text">暂无来源</p>
      </section>
    </aside>

    <section class="library-main">
      <header class="library-topbar">
        <div class="title-stack">
          <p class="kicker">Library</p>
          <h2>{{ pageTitle }}</h2>
          <p>{{ pageDescription }}</p>
        </div>
        <div class="topbar-actions">
          <UiSelect
            v-model="sort"
            aria-label="排序方式"
            :options="sortOptions"
            @change="applyFilters"
          />
          <UiButton v-if="activeFilterCount" variant="outline" @click="clearFilters">
            <X :size="16" />
            清除筛选
          </UiButton>
          <UiButton variant="secondary" @click="showImportDialog = true">
            <Plus :size="17" />
            导入
          </UiButton>
          <UiButton variant="ghost" size="icon" title="退出登录" @click="signOut">
            <LogOut :size="17" />
          </UiButton>
        </div>
      </header>

      <UiTabs :model-value="status" :items="statusTabs" @update:model-value="changeStatus" />

      <p v-if="errorMessage" class="inline-alert">{{ errorMessage }}</p>

      <section class="document-feed">
        <UiCard v-if="loading" class="loading-card">
          <span class="loading-line"></span>
          <span class="loading-line short"></span>
          <span class="loading-line soft"></span>
        </UiCard>

        <UiEmptyState
          v-else-if="documents.length === 0"
          title="没有匹配的文章"
          description="调整搜索或筛选条件后再试。"
        >
          <template #icon>
            <FileText :size="28" />
          </template>
          <template #actions>
            <UiButton v-if="activeFilterCount" variant="outline" @click="clearFilters">
              清除筛选
            </UiButton>
            <UiButton variant="secondary" @click="showImportDialog = true">
              <Plus :size="16" />
              导入文章
            </UiButton>
          </template>
        </UiEmptyState>

        <UiCard
          v-for="document in documents"
          v-else
          :key="document.id"
          class="document-item"
        >
          <button class="document-open-area" type="button" @click="openDocument(document)">
            <div class="document-line">
              <div class="document-title-block">
                <div class="badge-row">
                  <UiBadge :variant="documentStatusVariant(document)">
                    {{ documentStatusLabel(document) }}
                  </UiBadge>
                  <UiBadge variant="outline">{{ documentTypeLabel(document.type) }}</UiBadge>
                </div>
                <h3>{{ document.title }}</h3>
              </div>
              <span class="document-date">{{ formatDate(document.createdAt) }}</span>
            </div>

            <p class="document-excerpt">{{ document.excerpt || '暂无摘要' }}</p>

            <div class="document-meta">
              <span>{{ document.source || '未知来源' }}</span>
              <span v-if="document.author">{{ document.author }}</span>
              <span v-if="document.wordCount">{{ document.wordCount }} 字</span>
            </div>

            <div v-if="document.tags.length" class="tag-strip">
              <UiBadge v-for="item in document.tags" :key="item.id" variant="neutral">
                {{ item.name }}
              </UiBadge>
            </div>
          </button>

          <div class="document-actions">
            <UiButton
              v-if="status === 'trash'"
              variant="ghost"
              size="icon"
              :disabled="actionLoadingId === document.id"
              title="恢复"
              @click="restoreDocument(document)"
            >
              <RotateCcw :size="16" />
            </UiButton>
            <UiButton
              v-if="status === 'trash'"
              variant="ghost"
              size="icon"
              :disabled="actionLoadingId === document.id"
              title="永久删除"
              @click="requestPermanentlyDeleteDocument(document)"
            >
              <Trash2 :size="16" />
            </UiButton>
            <UiButton
              v-if="status === 'archived'"
              variant="ghost"
              size="icon"
              :disabled="actionLoadingId === document.id"
              title="取消归档"
              @click="unarchiveDocument(document)"
            >
              <ArchiveRestore :size="16" />
            </UiButton>
            <UiButton
              v-if="status === 'active'"
              variant="ghost"
              size="icon"
              :disabled="actionLoadingId === document.id"
              title="归档"
              @click="archiveDocument(document)"
            >
              <Archive :size="16" />
            </UiButton>
            <UiButton
              v-if="status !== 'trash'"
              variant="ghost"
              size="icon"
              :disabled="actionLoadingId === document.id"
              title="删除"
              @click="requestDeleteDocument(document)"
            >
              <Trash2 :size="16" />
            </UiButton>
            <a
              v-if="document.url"
              class="ui-button ui-button--ghost ui-button--size-icon"
              :href="document.url"
              rel="noreferrer"
              target="_blank"
              title="打开原文"
              @click.stop
            >
              <ExternalLink :size="16" />
            </a>
          </div>
        </UiCard>
      </section>

      <footer class="pagination-bar">
        <UiButton variant="outline" :disabled="page <= 1" @click="prevPage">上一页</UiButton>
        <span>第 {{ page }} 页 · 共 {{ total }} 篇</span>
        <UiButton variant="outline" :disabled="page * pageSize >= total" @click="nextPage">
          下一页
        </UiButton>
      </footer>
    </section>

    <UiDialog
      v-model:open="showImportDialog"
      title="导入文章"
      description="输入后端可直接访问的公开网页 URL。"
    >
      <form class="dialog-form" @submit.prevent="importDocument">
        <label class="field-group">
          <span>URL</span>
          <UiInput
            v-model.trim="importUrl"
            autocomplete="url"
            placeholder="https://example.com/article"
          />
        </label>
        <div class="dialog-actions">
          <UiButton variant="ghost" @click="showImportDialog = false">取消</UiButton>
          <UiButton type="submit" :disabled="importLoading">
            {{ importLoading ? '导入中...' : '确认导入' }}
          </UiButton>
        </div>
      </form>
    </UiDialog>

    <UiDialog
      :open="Boolean(confirmDialog)"
      :title="confirmDialog?.title || ''"
      :description="confirmDialog?.description"
      @update:open="confirmDialog = null"
    >
      <div class="dialog-actions">
        <UiButton variant="ghost" @click="confirmDialog = null">取消</UiButton>
        <UiButton variant="destructive" :disabled="confirmLoading" @click="confirmDialogAction">
          {{ confirmLoading ? '处理中...' : confirmDialog?.actionLabel }}
        </UiButton>
      </div>
    </UiDialog>
  </main>
</template>
