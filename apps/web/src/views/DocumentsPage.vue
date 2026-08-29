<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Bot,
  FileText,
  Globe2,
  Layers3,
  LogOut,
  Plus,
  Settings,
  Star,
  Tag,
  X,
} from 'lucide-vue-next'
import { LumiApiError } from '@lumi/api-client'
import type {
  DocumentReadingStatus,
  DocumentSort,
  DocumentStatus,
  DocumentSummary,
  DocumentType,
} from '@lumi/shared'
import UiButton from '../components/ui/Button.vue'
import UiCard from '../components/ui/Card.vue'
import UiDialog from '../components/ui/Dialog.vue'
import UiEmptyState from '../components/ui/EmptyState.vue'
import UiPagination from '../components/ui/Pagination.vue'
import UiSearchInput from '../components/ui/SearchInput.vue'
import UiSelect from '../components/ui/Select.vue'
import UiTabs from '../components/ui/Tabs.vue'
import ArticleCard from '../components/documents/ArticleCard.vue'
import ImportDialog from '../components/documents/ImportDialog.vue'
import { useAuth } from '../composables/useAuth'
import { useToast } from '../composables/useToast'
import { useDocumentsQuery } from '../composables/useDocumentsQuery'
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

const {
  documents,
  facets,
  keyword,
  status,
  type,
  tag,
  source,
  readingStatus,
  favoriteOnly,
  sort,
  page,
  pageSize,
  total,
  loading,
  errorMessage,
  selectedTagName,
  activeFilterCount,
  loadDocuments,
  applyFilters,
  clearFilters,
  refresh,
  goToPage,
  setErrorHandler,
} = useDocumentsQuery()

const contentRef = ref<HTMLElement | null>(null)

async function onPageChange(target: number) {
  await goToPage(target)
  contentRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

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

const readingStatusTabs = [
  { value: '', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'read', label: '已读' },
]

const showImportDialog = ref(false)
const actionLoadingId = ref('')
const confirmDialog = ref<ConfirmDialogState | null>(null)
const confirmLoading = ref(false)

const statusTabs = computed(() =>
  statusOptions.map((item) => ({
    value: item.value,
    label: item.label,
  })),
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

// 错误处理委托给页面壳的 toast，避免 composable 直接依赖副作用。
setErrorHandler((error, fallback) => {
  const message = error instanceof LumiApiError ? error.message : fallback
  toast({
    title: fallback,
    description: message,
    variant: 'destructive',
  })
})

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

async function toggleFavorite(document: DocumentSummary) {
  if (status.value === 'trash' || document.ingestStatus !== 'succeeded') return
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
  try {
    await action()
    toast({ title: successTitle, variant: 'success' })
    await refresh()
  } catch (error) {
    const message = error instanceof LumiApiError ? error.message : '操作失败'
    toast({
      title: '操作失败',
      description: message,
      variant: 'destructive',
    })
  } finally {
    actionLoadingId.value = ''
  }
}

function openDocument(document: DocumentSummary) {
  router.push(`/documents/${document.id}`)
}

function onImported(documentId: string) {
  void refresh()
  router.push(`/documents/${documentId}`)
}

function signOut() {
  logout()
  toast({ title: '已退出登录' })
  router.push('/login')
}

function readingStatusLabel(value: DocumentSummary['readingStatus']) {
  return value === 'read' ? '已读' : '未读'
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
        <div class="sidebar-title">导航</div>
        <nav class="sidebar-nav">
          <button class="sidebar-link active" type="button">
            <FileText class="sidebar-link-icon" />
            <span>文章库</span>
          </button>
          <button class="sidebar-link" type="button" @click="router.push('/knowledge-chat')">
            <Bot class="sidebar-link-icon" />
            <span>知识库问答</span>
          </button>
          <button class="sidebar-link" type="button" @click="router.push('/settings')">
            <Settings class="sidebar-link-icon" />
            <span>设置</span>
          </button>
        </nav>
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

      <main ref="contentRef" class="content">
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
          <template v-if="loading">
            <UiCard v-for="n in pageSize" :key="`skeleton-${n}`" class="article-card-shell loading-card">
              <span class="loading-line"></span>
              <span class="loading-line short"></span>
              <span class="loading-line soft"></span>
            </UiCard>
          </template>

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

          <ArticleCard
            v-for="document in documents"
            v-else
            :key="document.id"
            :document="document"
            :status="status"
            :action-loading-id="actionLoadingId"
            @open="openDocument"
            @toggle-favorite="toggleFavorite"
            @retry-ingest="retryIngest"
            @archive="archiveDocument"
            @unarchive="unarchiveDocument"
            @restore="restoreDocument"
            @request-delete="requestDeleteDocument"
            @request-permanent-delete="requestPermanentlyDeleteDocument"
          />
        </section>

        <footer class="pagination-bar">
          <UiPagination :page="page" :page-size="pageSize" :total="total" @update:page="onPageChange" />
          <span>第 {{ page }} 页 · 共 {{ total }} 篇</span>
        </footer>
      </main>
    </div>

    <ImportDialog
      v-model:open="showImportDialog"
      @imported="onImported"
    />

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

<style scoped>
.content {
  display: flex;
  flex-direction: column;
}

.article-grid {
  flex: 1;
  align-content: start;
}
</style>
