import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  DocumentFacets,
  DocumentReadingStatus,
  DocumentSort,
  DocumentStatus,
  DocumentSummary,
  DocumentType,
} from '@lumi/shared'
import { client } from '../lib/client'

const PAGE_SIZE = 6
const POLL_INTERVAL = 4000

/**
 * 文档列表查询、筛选、分页与轮询状态。
 *
 * 列表项在解析 / AI 分析进行中时会每 4 秒静默刷新，直到全部进入终态。
 * 筛选项变更统一走 applyFilters（重置到第一页），由调用方决定何时触发。
 */
export function useDocumentsQuery() {
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
  const pageSize = PAGE_SIZE
  const total = ref(0)
  const loading = ref(false)
  const errorMessage = ref('')
  let pollingTimer: number | undefined

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

  const shouldPollDocuments = computed(() =>
    documents.value.some(
      (document) =>
        document.ingestStatus === 'pending' ||
        document.ingestStatus === 'processing' ||
        document.aiAnalysisStatus === 'pending' ||
        document.aiAnalysisStatus === 'processing',
    ),
  )

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
      onError(error, '文章列表加载失败')
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
      onError(error, '筛选项加载失败')
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

  async function refresh() {
    await Promise.all([loadDocuments(), loadFacets()])
  }

  async function goToPage(target: number) {
    const maxPage = Math.max(1, Math.ceil(total.value / pageSize))
    if (!Number.isInteger(target) || target === page.value || target < 1 || target > maxPage) {
      return
    }
    page.value = target
    await loadDocuments()
  }

  /**
   * 错误回调，由调用方覆盖以接入 toast 展示。
   * 默认实现把错误信息写入 errorMessage ref，避免 composable 直接依赖 useToast。
   */
  let onError: (error: unknown, fallback: string) => void = (error, fallback) => {
    const message = error instanceof Error ? error.message : fallback
    errorMessage.value = message
  }

  function setErrorHandler(handler: (error: unknown, fallback: string) => void) {
    onError = handler
  }

  onMounted(async () => {
    await Promise.all([loadDocuments(), loadFacets()])
    pollingTimer = window.setInterval(() => {
      if (shouldPollDocuments.value && !loading.value) {
        void loadDocuments({ silent: true })
      }
    }, POLL_INTERVAL)
  })

  onBeforeUnmount(() => {
    if (pollingTimer) window.clearInterval(pollingTimer)
  })

  return {
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
    loadFacets,
    applyFilters,
    clearFilters,
    refresh,
    goToPage,
    setErrorHandler,
  }
}
