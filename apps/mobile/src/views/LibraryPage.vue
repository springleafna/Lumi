<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import type { DocumentSummary } from '@lumi/shared'
import { showConfirmDialog, showToast } from 'vant'
import ArticleCell from '../components/ArticleCell.vue'
import { client } from '../lib/client'

type LibraryTab = 'all' | 'unread' | 'read' | 'favorite'

const PAGE_SIZE = 20

const tabs: Array<{ value: LibraryTab; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'read', label: '已读' },
  { value: 'favorite', label: '收藏' },
]

const router = useRouter()

const keywordInput = ref('')
const keyword = ref('')
const activeTab = ref<LibraryTab>('all')
const items = ref<DocumentSummary[]>([])
const total = ref(0)
const page = ref(0)
const refreshing = ref(false)
const listLoading = ref(false)
const listError = ref(false)
const finished = ref(false)

const importOpen = ref(false)
const importUrl = ref('')
const importing = ref(false)

function queryFilters() {
  return {
    keyword: keyword.value || undefined,
    status: 'active' as const,
    readingStatus:
      activeTab.value === 'unread' || activeTab.value === 'read' ? activeTab.value : undefined,
    favorite: activeTab.value === 'favorite' || undefined,
    sort: 'created_desc' as const,
  }
}

function isListExhausted(batchCount: number): boolean {
  return items.value.length >= total.value || batchCount < PAGE_SIZE
}

async function loadPage(targetPage: number): Promise<DocumentSummary[]> {
  const result = await client.documents.list({
    ...queryFilters(),
    page: targetPage,
    pageSize: PAGE_SIZE,
  })
  total.value = result.total
  return result.items
}

async function onLoad() {
  listLoading.value = true
  try {
    const next = page.value + 1
    const batch = await loadPage(next)
    items.value = [...items.value, ...batch]
    page.value = next
    listError.value = false
    finished.value = isListExhausted(batch.length)
  } catch (error) {
    listError.value = true
    finished.value = false
    if (page.value === 0) showToast(getErrorMessage(error, '加载失败'))
  } finally {
    listLoading.value = false
  }
}

async function onRefresh() {
  try {
    const batch = await loadPage(1)
    items.value = batch
    page.value = 1
    listError.value = false
    finished.value = isListExhausted(batch.length)
  } catch (error) {
    showToast(getErrorMessage(error, '刷新失败'))
  } finally {
    refreshing.value = false
  }
}

/** 切换筛选 / 搜索 / 导入后重置列表；van-list 会在内容不足一屏时自动触发 onLoad。 */
function resetList() {
  items.value = []
  page.value = 0
  total.value = 0
  listError.value = false
  finished.value = false
}

function onTabChange() {
  resetList()
}

function onSearch() {
  keyword.value = keywordInput.value.trim()
  resetList()
}

function onSearchClear() {
  if (!keyword.value) return
  keyword.value = ''
  resetList()
}

function patchArticle(updated: DocumentSummary) {
  items.value = items.value.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
}

async function toggleFavorite(article: DocumentSummary) {
  try {
    const updated = await client.documents.updateFavorite(article.id, {
      favorite: !article.favoritedAt,
    })
    patchArticle(updated)
    showToast(updated.favoritedAt ? '已收藏' : '已取消收藏')
  } catch (error) {
    showToast(getErrorMessage(error, '收藏操作失败'))
  }
}

async function archiveArticle(article: DocumentSummary) {
  try {
    await client.documents.archive(article.id)
    items.value = items.value.filter((item) => item.id !== article.id)
    total.value = Math.max(0, total.value - 1)
    showToast('已归档')
  } catch (error) {
    showToast(getErrorMessage(error, '归档失败'))
  }
}

async function requestDeleteArticle(article: DocumentSummary) {
  try {
    await showConfirmDialog({
      title: '删除文章',
      message: `确认删除《${article.title}》吗？文章会进入回收站。`,
    })
  } catch {
    return
  }
  try {
    await client.documents.delete(article.id)
    items.value = items.value.filter((item) => item.id !== article.id)
    total.value = Math.max(0, total.value - 1)
    showToast('已移入回收站')
  } catch (error) {
    showToast(getErrorMessage(error, '删除失败'))
  }
}

async function beforeImportClose(action: string): Promise<boolean> {
  if (action !== 'confirm') return true
  const url = importUrl.value.trim()
  if (!url) {
    showToast('请输入文章链接')
    return false
  }
  importing.value = true
  try {
    await client.ingest.url({ url })
    showToast({ type: 'success', message: '导入任务已创建' })
    importUrl.value = ''
    resetList()
    return true
  } catch (error) {
    showToast(getErrorMessage(error, '导入失败'))
    return false
  } finally {
    importing.value = false
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof LumiApiError ? error.message : fallback
}

/** 分享导入等外部入口产生新文档后，通过窗口事件请求文章库重置刷新。 */
function onExternalRefresh() {
  resetList()
}

onMounted(() => window.addEventListener('lumi:library-refresh', onExternalRefresh))
onBeforeUnmount(() => window.removeEventListener('lumi:library-refresh', onExternalRefresh))
</script>

<template>
  <div class="library-page">
    <header class="library-header safe-area-top">
      <van-search
        v-model="keywordInput"
        placeholder="搜索文章"
        enterable
        @search="onSearch"
        @clear="onSearchClear"
      />
      <van-tabs v-model:active="activeTab" shrink @change="onTabChange">
        <van-tab v-for="tab in tabs" :key="tab.value" :title="tab.label" :name="tab.value" />
      </van-tabs>
    </header>

    <div class="library-body">
      <van-pull-refresh v-model="refreshing" success-text="已刷新" @refresh="onRefresh">
        <van-list
          v-model:loading="listLoading"
          v-model:error="listError"
          error-text="加载失败，点击重试"
          :finished="finished"
          finished-text="没有更多了"
          @load="onLoad"
        >
          <ArticleCell
            v-for="article in items"
            :key="article.id"
            :article="article"
            @open="router.push(`/article/${article.id}`)"
            @toggle-favorite="toggleFavorite(article)"
            @archive="archiveArticle(article)"
            @request-delete="requestDeleteArticle(article)"
          />
          <van-empty
            v-if="finished && items.length === 0"
            description="还没有文章，点右下角 + 导入"
          />
        </van-list>
      </van-pull-refresh>
    </div>

    <van-floating-bubble icon="plus" @click="importOpen = true" />

    <van-dialog
      v-model:show="importOpen"
      title="导入文章"
      show-cancel-button
      :before-close="beforeImportClose"
    >
      <van-field v-model="importUrl" type="url" placeholder="粘贴文章链接 https://..." />
    </van-dialog>
  </div>
</template>

<style scoped>
.library-page {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  background: var(--lumi-bg-page);
}

.library-header {
  position: sticky;
  z-index: 10;
  top: 0;
  background: var(--lumi-bg-primary);
  border-bottom: 1px solid var(--lumi-border-muted);
}

.library-header :deep(.van-tabs) {
  --van-tabs-bottom-border-color: transparent;
}

.library-header :deep(.van-tab--shrink) {
  padding: 0 14px;
}

.library-body {
  flex: 1;
  min-height: 0;
  padding-top: 12px;
}

.library-body :deep(.van-floating-bubble) {
  width: 44px;
  height: 44px;
  /* 取反色对：浅色白底黑叉、深色深底浅叉，图标始终可见 */
  color: var(--lumi-bg-primary);
  background: var(--lumi-fg-primary);
  border-radius: 50%;
}
</style>
