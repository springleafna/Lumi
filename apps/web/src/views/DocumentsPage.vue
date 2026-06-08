<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  FileText,
  Globe2,
  Layers3,
  LogOut,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import type {
  DocumentFacets,
  DocumentReadingStatus,
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
import lumiLogo from '../assets/lumi-logo.svg'
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
  { value: 'active', label: '全部' },
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
const readingStatus = ref<DocumentReadingStatus | ''>('')
const favoriteOnly = ref(false)
const sort = ref<DocumentSort>('created_desc')
const page = ref(1)
const pageSize = 6
const maxCardTagCount = 3
const total = ref(0)
const loading = ref(false)
const actionLoadingId = ref('')
const errorMessage = ref('')
const showImportDialog = ref(false)
const importMode = ref('url')
const importUrl = ref('')
const selectedFile = ref<File | null>(null)
const importLoading = ref(false)
const confirmDialog = ref<ConfirmDialogState | null>(null)
const confirmLoading = ref(false)
let pollingTimer: number | undefined

const statusTabs = computed(() =>
  statusOptions.map((item) => ({
    value: item.value,
    label: item.label,
  })),
)

const importTabs = [
  { value: 'url', label: 'URL' },
  { value: 'file', label: '文件' },
]

const readingStatusTabs = [
  { value: '', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'read', label: '已读' },
]

const selectedTagName = computed(
  () => facets.value.tags.find((item) => item.id === tag.value)?.name,
)

const activeFilterCount = computed(
  () =>
    Number(Boolean(keyword.value)) +
    Number(Boolean(type.value)) +
    Number(Boolean(tag.value)) +
    Number(Boolean(source.value)) +
    Number(Boolean(readingStatus.value)) +
    Number(favoriteOnly.value),
)

const pageTitle = computed(() => {
  if (status.value === 'archived') return '归档文章'
  if (status.value === 'trash') return '回收站'
  return '所有文章'
})

const pageDescription = computed(() => {
  const parts = [`共 ${total.value} 篇`]
  if (selectedTagName.value) parts.push(`标签：${selectedTagName.value}`)
  if (source.value) parts.push(`来源：${source.value}`)
  if (readingStatus.value) parts.push(readingStatusLabel(readingStatus.value))
  if (favoriteOnly.value) parts.push('收藏')
  return parts.join(' · ')
})

const emptyState = computed(() => {
  if (activeFilterCount.value) {
    return {
      title: '没有匹配的文章',
      description: '调整搜索或筛选条件后再试。',
      showClear: true,
      showImport: status.value === 'active',
    }
  }

  if (status.value === 'archived') {
    return {
      title: '暂无归档文章',
      description: '归档后的文章会显示在这里。',
      showClear: false,
      showImport: false,
    }
  }

  if (status.value === 'trash') {
    return {
      title: '回收站为空',
      description: '删除后的文章会暂存在这里，恢复或永久删除前都可以查看。',
      showClear: false,
      showImport: false,
    }
  }

  return {
    title: '还没有文章',
    description: '导入一篇网页文章，开始建立你的阅读库。',
    showClear: false,
    showImport: true,
  }
})

const shouldPollDocuments = computed(() =>
  documents.value.some(
    (document) =>
      document.ingestStatus === 'pending' ||
      document.ingestStatus === 'processing' ||
      document.aiAnalysisStatus === 'pending' ||
      document.aiAnalysisStatus === 'processing',
  ),
)

onMounted(async () => {
  await Promise.all([loadDocuments(), loadFacets()])
  pollingTimer = window.setInterval(() => {
    if (shouldPollDocuments.value && !loading.value) {
      void loadDocuments({ silent: true })
    }
  }, 4000)
})

onBeforeUnmount(() => {
  if (pollingTimer) window.clearInterval(pollingTimer)
})

async function loadDocuments(options: { silent?: boolean } = {}) {
  if (!options.silent) {
    loading.value = true
  }
  errorMessage.value = ''
  try {
    const result = await client.documents.list({
      keyword: keyword.value || undefined,
      status: status.value,
      type: type.value || undefined,
      tag: tag.value || undefined,
      source: source.value || undefined,
      readingStatus: readingStatus.value || undefined,
      favorite: favoriteOnly.value || undefined,
      sort: sort.value,
      page: page.value,
      pageSize,
    })
    documents.value = result.items
    total.value = result.total
  } catch (error) {
    notifyError(error, '文章列表加载失败')
  } finally {
    if (!options.silent) {
      loading.value = false
    }
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
  readingStatus.value = ''
  favoriteOnly.value = false
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

async function changeReadingStatus(value: string) {
  readingStatus.value = value as DocumentReadingStatus | ''
  await applyFilters()
}

async function toggleFavoriteFilter() {
  favoriteOnly.value = !favoriteOnly.value
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
      title: '导入任务已创建',
      description: '文章会先进入解析队列，完成后自动生成 AI 摘要和标签。',
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

async function importFile() {
  if (!selectedFile.value) {
    toast({ title: '请选择文件', variant: 'destructive' })
    return
  }

  importLoading.value = true
  errorMessage.value = ''
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    const result = await client.ingest.file(formData)
    showImportDialog.value = false
    selectedFile.value = null
    toast({
      title: '文件已导入',
      description: '文档已保存，Lumi 会尝试自动生成 AI 阅读卡片。',
      variant: 'success',
    })
    await loadFacets()
    await router.push(`/documents/${result.document.id}`)
  } catch (error) {
    notifyError(error, '文件导入失败')
  } finally {
    importLoading.value = false
  }
}

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] || null
}

async function toggleFavorite(document: DocumentSummary) {
  if (!canEditReadingMarkers(document)) return
  await runDocumentAction(
    document.id,
    document.favoritedAt ? '已取消收藏' : '已收藏',
    async () => {
      await client.documents.updateFavorite(document.id, {
        favorite: !document.favoritedAt,
      })
    },
  )
}

async function retryIngest(document: DocumentSummary) {
  await runDocumentAction(document.id, '已重新加入解析队列', async () => {
    await client.documents.retryIngest(document.id)
  })
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
  if (document.ingestStatus === 'failed') return 'destructive'
  if (document.deletedAt) return 'destructive'
  return 'neutral'
}

function documentStatusLabel(document: DocumentSummary) {
  if (document.ingestStatus === 'pending') return '等待解析'
  if (document.ingestStatus === 'processing') return '解析中'
  if (document.ingestStatus === 'failed') return '解析失败'
  if (document.deletedAt) return '回收站'
  if (document.archivedAt) return '已归档'
  return ''
}

function shouldShowDocumentStatus(document: DocumentSummary) {
  return Boolean(document.deletedAt || document.archivedAt || document.ingestStatus !== 'succeeded')
}

function documentExcerpt(document: DocumentSummary) {
  if (document.ingestStatus === 'pending') return '文章已进入导入队列，正在等待解析。'
  if (document.ingestStatus === 'processing') return '正在提取正文并转换为 Markdown。'
  if (document.ingestStatus === 'failed') {
    return document.ingestErrorMessage || '解析失败，可以稍后重试。'
  }
  return document.excerpt || '暂无摘要'
}

function canManageDocument(document: DocumentSummary) {
  return document.ingestStatus === 'succeeded'
}

function canEditReadingMarkers(document: DocumentSummary) {
  return status.value !== 'trash' && document.ingestStatus === 'succeeded'
}

function readingStatusLabel(value: DocumentSummary['readingStatus']) {
  return value === 'read' ? '已读' : '未读'
}

function readingStatusClass(value: DocumentSummary['readingStatus']) {
  return value === 'unread' ? 'reading-status-badge is-unread' : 'reading-status-badge'
}

function visibleDocumentTags(document: DocumentSummary) {
  return document.tags.slice(0, maxCardTagCount)
}

function hasHiddenDocumentTags(document: DocumentSummary) {
  return document.tags.length > maxCardTagCount
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
  <main class="app-shell">
    <aside class="sidebar">
      <section class="sidebar-section">
        <div class="sidebar-brand-link">
          <div class="brand-mark">
            <img class="brand-logo" :src="lumiLogo" alt="" />
          </div>
          <span>Lumi</span>
        </div>
      </section>

      <section class="sidebar-section">
        <div class="sidebar-title">类型</div>
        <nav class="sidebar-nav">
          <button
            v-for="option in documentTypes"
            :key="option.value || 'all'"
            class="sidebar-link"
            :class="{ active: type === option.value }"
            type="button"
            @click="changeType(option.value)"
          >
            <Layers3 class="sidebar-link-icon" />
            <span>{{ option.label }}</span>
          </button>
        </nav>
      </section>

      <section class="sidebar-section">
        <div class="sidebar-title">标签</div>
        <nav v-if="facets.tags.length" class="sidebar-nav sidebar-filter-list">
          <button
            v-for="item in facets.tags"
            :key="item.id"
            class="sidebar-link"
            :class="{ active: tag === item.id }"
            type="button"
            @click="changeTag(item.id)"
          >
            <Tag class="sidebar-link-icon" />
            <span>{{ item.name }}</span>
            <span class="sidebar-link-count">{{ item.count || 0 }}</span>
          </button>
        </nav>
        <p v-else class="sidebar-empty">暂无标签</p>
      </section>

      <section class="sidebar-section">
        <div class="sidebar-title">来源</div>
        <nav v-if="facets.sources.length" class="sidebar-nav sidebar-filter-list">
          <button
            v-for="item in facets.sources"
            :key="item.source"
            class="sidebar-link"
            :class="{ active: source === item.source }"
            type="button"
            @click="changeSource(item.source)"
          >
            <Globe2 class="sidebar-link-icon" />
            <span>{{ item.source }}</span>
            <span class="sidebar-link-count">{{ item.count }}</span>
          </button>
        </nav>
        <p v-else class="sidebar-empty">暂无来源</p>
      </section>
    </aside>

    <div class="main">
      <header class="header">
        <UiTabs :model-value="status" :items="statusTabs" @update:model-value="changeStatus" />
        <div class="header-spacer"></div>
        <div class="header-actions">
          <UiSelect
            v-model="sort"
            aria-label="排序方式"
            :options="sortOptions"
            @change="applyFilters"
          />
          <UiButton @click="showImportDialog = true">
            <Plus :size="16" />
            导入文章
          </UiButton>
          <UiButton variant="ghost" size="icon" title="退出登录" @click="signOut">
            <LogOut :size="16" />
          </UiButton>
        </div>
      </header>

      <main class="content">
        <section class="article-list-header">
          <div>
            <h1 class="article-list-title">{{ pageTitle }}</h1>
            <p class="article-list-subtitle">{{ pageDescription }}</p>
          </div>
          <UiButton v-if="activeFilterCount" variant="secondary" @click="clearFilters">
            <X :size="15" />
            清除筛选
          </UiButton>
        </section>

        <section class="article-list-toolbar">
          <form class="article-search-form" @submit.prevent="applyFilters">
            <UiSearchInput v-model="keyword" placeholder="搜索文章..." />
            <UiButton variant="secondary" type="submit">搜索</UiButton>
          </form>
          <div class="article-list-filters">
            <UiTabs
              :model-value="readingStatus"
              :items="readingStatusTabs"
              @update:model-value="changeReadingStatus"
            />
            <UiButton
              class="favorite-filter-button"
              :class="{ 'is-active': favoriteOnly }"
              variant="secondary"
              :aria-pressed="favoriteOnly"
              @click="toggleFavoriteFilter"
            >
              <Star :size="15" :class="{ 'is-filled-icon': favoriteOnly }" />
              收藏
            </UiButton>
          </div>
        </section>

        <p v-if="errorMessage" class="inline-alert">{{ errorMessage }}</p>

        <section class="article-grid">
          <UiCard v-if="loading" class="article-card-shell loading-card">
            <span class="loading-line"></span>
            <span class="loading-line short"></span>
            <span class="loading-line soft"></span>
          </UiCard>

          <UiEmptyState
            v-else-if="documents.length === 0"
            :title="emptyState.title"
            :description="emptyState.description"
          >
            <template #icon>
              <FileText :size="28" />
            </template>
            <template #actions>
              <UiButton v-if="emptyState.showClear" variant="secondary" @click="clearFilters">
                清除筛选
              </UiButton>
              <UiButton v-if="emptyState.showImport" @click="showImportDialog = true">
                <Plus :size="16" />
                导入文章
              </UiButton>
            </template>
          </UiEmptyState>

          <UiCard
            v-for="document in documents"
            v-else
            :key="document.id"
            class="article-card-shell card-interactive"
          >
            <article class="article-card">
              <div class="article-card-header">
                <button class="article-card-title-button" type="button" @click="openDocument(document)">
                  <h3 class="article-card-title">{{ document.title }}</h3>
                </button>
                <div class="article-card-actions">
                  <UiButton
                    v-if="canEditReadingMarkers(document)"
                    variant="ghost"
                    size="icon"
                    :disabled="actionLoadingId === document.id"
                    :title="document.favoritedAt ? '取消收藏' : '收藏'"
                    @click.stop="toggleFavorite(document)"
                  >
                    <Star :size="15" :class="{ 'is-filled-icon': document.favoritedAt }" />
                  </UiButton>
                  <UiButton
                    v-if="status === 'trash'"
                    variant="ghost"
                    size="icon"
                    :disabled="actionLoadingId === document.id"
                    title="恢复"
                    @click="restoreDocument(document)"
                  >
                    <RotateCcw :size="15" />
                  </UiButton>
                  <UiButton
                    v-if="status === 'trash'"
                    variant="ghost"
                    size="icon"
                    :disabled="actionLoadingId === document.id"
                    title="永久删除"
                    @click="requestPermanentlyDeleteDocument(document)"
                  >
                    <Trash2 :size="15" />
                  </UiButton>
                  <UiButton
                    v-if="document.ingestStatus === 'failed'"
                    variant="ghost"
                    size="icon"
                    :disabled="actionLoadingId === document.id"
                    title="重新解析"
                    @click="retryIngest(document)"
                  >
                    <RefreshCw :size="15" />
                  </UiButton>
                  <UiButton
                    v-if="status === 'archived' && canManageDocument(document)"
                    variant="ghost"
                    size="icon"
                    :disabled="actionLoadingId === document.id"
                    title="取消归档"
                    @click="unarchiveDocument(document)"
                  >
                    <ArchiveRestore :size="15" />
                  </UiButton>
                  <UiButton
                    v-if="status === 'active' && canManageDocument(document)"
                    variant="ghost"
                    size="icon"
                    :disabled="actionLoadingId === document.id"
                    title="归档"
                    @click="archiveDocument(document)"
                  >
                    <Archive :size="15" />
                  </UiButton>
                  <UiButton
                    v-if="status !== 'trash'"
                    variant="ghost"
                    size="icon"
                    :disabled="actionLoadingId === document.id"
                    title="删除"
                    @click="requestDeleteDocument(document)"
                  >
                    <Trash2 :size="15" />
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
                    <ExternalLink :size="15" />
                  </a>
                </div>
              </div>

              <button class="article-card-body" type="button" @click="openDocument(document)">
                <p class="article-card-excerpt">{{ documentExcerpt(document) }}</p>
                <div class="article-card-footer">
                  <div class="article-card-meta">
                    <span class="article-card-meta-item">{{ document.source || '未知来源' }}</span>
                    <span class="article-card-meta-item">{{ formatDate(document.createdAt) }}</span>
                    <span v-if="document.wordCount" class="article-card-meta-item">
                      {{ document.wordCount }} 字
                    </span>
                  </div>
                  <div class="article-card-tags">
                    <UiBadge
                      class="article-card-badge article-card-badge-state"
                      :class="readingStatusClass(document.readingStatus)"
                      variant="neutral"
                    >
                      {{ readingStatusLabel(document.readingStatus) }}
                    </UiBadge>
                    <UiBadge
                      v-if="shouldShowDocumentStatus(document)"
                      class="article-card-badge article-card-badge-state"
                      :variant="documentStatusVariant(document)"
                    >
                      {{ documentStatusLabel(document) }}
                    </UiBadge>
                    <UiBadge class="article-card-badge article-card-badge-type" variant="strong">
                      {{ documentTypeLabel(document.type) }}
                    </UiBadge>
                    <UiBadge
                      v-if="document.aiAnalysisStatus === 'pending' || document.aiAnalysisStatus === 'processing'"
                      class="article-card-badge article-card-badge-ai"
                      variant="outline"
                    >
                      AI 生成中
                    </UiBadge>
                    <UiBadge
                      v-else-if="document.aiAnalysisStatus === 'succeeded'"
                      class="article-card-badge article-card-badge-ai"
                      variant="outline"
                    >
                      AI 已生成
                    </UiBadge>
                    <UiBadge
                      v-for="item in visibleDocumentTags(document)"
                      :key="item.id"
                      class="article-card-badge article-card-badge-tag"
                      variant="neutral"
                    >
                      {{ item.name }}
                    </UiBadge>
                    <UiBadge
                      v-if="hasHiddenDocumentTags(document)"
                      class="article-card-badge article-card-badge-more"
                      variant="neutral"
                    >
                      ...
                    </UiBadge>
                  </div>
                </div>
              </button>
            </article>
          </UiCard>
        </section>

        <footer class="pagination-bar">
          <UiButton variant="secondary" :disabled="page <= 1" @click="prevPage">上一页</UiButton>
          <span>第 {{ page }} 页 · 共 {{ total }} 篇</span>
          <UiButton variant="secondary" :disabled="page * pageSize >= total" @click="nextPage">
            下一页
          </UiButton>
        </footer>
      </main>
    </div>

    <UiDialog
      v-model:open="showImportDialog"
      title="导入文章"
      description="输入 URL，或上传 Markdown / 文本文档。"
    >
      <div class="dialog-form">
        <UiTabs
          :model-value="importMode"
          :items="importTabs"
          @update:model-value="(value) => (importMode = value)"
        />

        <form v-if="importMode === 'url'" class="dialog-form" @submit.prevent="importDocument">
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

        <form v-else class="dialog-form" @submit.prevent="importFile">
          <label class="field-group">
            <span>文件</span>
            <input
              class="ui-input"
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              @change="selectFile"
            />
          </label>
          <p class="field-hint">支持 .md / .txt，最大 2MB，按 UTF-8 读取。</p>
          <div class="dialog-actions">
            <UiButton variant="ghost" @click="showImportDialog = false">取消</UiButton>
            <UiButton type="submit" :disabled="importLoading || !selectedFile">
              {{ importLoading ? '导入中...' : '导入文件' }}
            </UiButton>
          </div>
        </form>
      </div>
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
