<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bot,
  CalendarDays,
  Captions,
  ExternalLink,
  Highlighter,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Settings,
  Star,
  Trash2,
} from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import type {
  AnnotationDto,
  DocumentDetail,
  DocumentType,
  VideoTranscriptDto,
} from '@lumi/shared'
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import UiCard from '../components/ui/Card.vue'
import UiDialog from '../components/ui/Dialog.vue'
import UiEmptyState from '../components/ui/EmptyState.vue'
import AiDrawer from '../components/document-detail/AiDrawer.vue'
import AnnotationLayer from '../components/document-detail/AnnotationLayer.vue'
import ArticleToc from '../components/document-detail/ArticleToc.vue'
import TagEditor from '../components/document-detail/TagEditor.vue'
import VideoHeaderCard from '../components/document-detail/VideoHeaderCard.vue'
import { useToast } from '../composables/useToast'
import { useMarkdownRenderer } from '../composables/useMarkdownRenderer'
import { useRuntimeToc } from '../composables/useRuntimeToc'
import {
  applyReaderHighlights,
  countOccurrencesBefore,
  getSelectionOffsets,
  hasAnnotationOverlap,
} from '../lib/highlight-dom'
import lumiLogo from '../assets/lumi-logo.svg'
import { client } from '../lib/client'
import { parseVideoAnchorSeconds, wrapVideoAnchors } from '../lib/video-anchor'

type ConfirmDialogState = {
  title: string
  description: string
  actionLabel: string
  run: () => Promise<void>
}

type DrawerTab = 'ai' | 'annotations' | 'transcript'

// 即时问答：仅保留当前一轮，不读取历史
type AiExchange = {
  question: string
  answer: string
  streaming: boolean
  failed: boolean
}

type SelectionDraft = {
  selectedText: string
  prefix: string
  suffix: string
  occurrenceIndex: number
  startOffset: number
  endOffset: number
}

type CitationRange = {
  startOffset: number
  endOffset: number
}

const route = useRoute()
const router = useRouter()
const { toast } = useToast()

// Markdown 渲染管线（详情页允许 HTML，需经 DOMPurify 清洗）。
const { shikiHighlighter, initShiki, render } = useMarkdownRenderer({ html: true })

// 运行时目录（标题来自 v-html 注入，需手动 refresh）。
const { tocItems, activeTocId, refresh: refreshToc, scrollToHeading } = useRuntimeToc()

const documentTypes: Array<{ value: DocumentType; label: string }> = [
  { value: 'article', label: '文章' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'pdf', label: 'PDF' },
  { value: 'fragment', label: '片段' },
]

const document = ref<DocumentDetail | null>(null)
const loading = ref(false)
const actionLoading = ref(false)
const errorMessage = ref('')
const confirmDialog = ref<ConfirmDialogState | null>(null)
const confirmLoading = ref(false)

// AI 抽屉状态
const drawerOpen = ref(false)
const drawerTab = ref<DrawerTab>('ai')
const aiActionLoading = ref(false)
const aiQuestion = ref('')
const aiExchange = ref<AiExchange | null>(null)

// 高亮批注状态
const annotations = ref<AnnotationDto[]>([])
const annotationsLoading = ref(false)
const annotationActionLoading = ref('')
const articleContentRef = ref<HTMLElement | null>(null)
const selectionDraft = ref<SelectionDraft | null>(null)
const selectionToolbar = ref({ visible: false, x: 0, y: 0 })
const annotationDialogOpen = ref(false)
const annotationNote = ref('')
const editingAnnotation = ref<AnnotationDto | null>(null)
const activeAnnotationId = ref<string | null>(null)

// 视频阅读：transcript 供字幕面板使用，头卡播放器通过模板 ref 接收 seek
const transcript = ref<VideoTranscriptDto | null>(null)
const videoCardRef = ref<InstanceType<typeof VideoHeaderCard> | null>(null)
const isVideoDocument = computed(() => document.value?.type === 'video')

function seekVideo(seconds: number) {
  videoCardRef.value?.seekTo(seconds)
}

let pollingTimer: number | undefined

const sortedAnnotations = computed(() =>
  [...annotations.value].sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  }),
)

const renderedMarkdown = computed(() => {
  const current = document.value
  // 引用 shikiHighlighter 触发 highlighter 就绪后重算。
  Boolean(shikiHighlighter.value)
  if (!current || current.ingestStatus !== 'succeeded') return ''

  const html = render(current.markdown)
  return applyReaderHighlights(html, sortedAnnotations.value, citationRange.value)
})

const isTrash = computed(() => Boolean(document.value?.deletedAt))
const isArchived = computed(() => Boolean(document.value?.archivedAt) && !isTrash.value)
const isIngestPending = computed(
  () => document.value?.ingestStatus === 'pending' || document.value?.ingestStatus === 'processing',
)
const isIngestFailed = computed(() => document.value?.ingestStatus === 'failed')
const isIngestSucceeded = computed(() => document.value?.ingestStatus === 'succeeded')
const canEditReadingMarkers = computed(() => Boolean(document.value && !isTrash.value))
// 视频文档不支持划词批注（锚定机制基于正文字符偏移，方案文档 M1 非目标）
const canEditAnnotations = computed(
  () => Boolean(document.value && isIngestSucceeded.value && !isTrash.value && !isVideoDocument.value),
)
const aiAnalysis = computed(() => document.value?.aiAnalysis || null)
const shouldPollDocument = computed(
  () =>
    document.value?.ingestStatus === 'pending' ||
    document.value?.ingestStatus === 'processing' ||
    document.value?.aiAnalysisStatus === 'pending' ||
    document.value?.aiAnalysisStatus === 'processing' ||
    document.value?.aiAnalysis?.status === 'pending' ||
    document.value?.aiAnalysis?.status === 'processing' ||
    document.value?.embeddingIndexStatus === 'pending' ||
    document.value?.embeddingIndexStatus === 'processing',
)

const statusLabel = computed(() => {
  if (document.value?.ingestStatus === 'pending') return '等待解析'
  if (document.value?.ingestStatus === 'processing') return '解析中'
  if (document.value?.ingestStatus === 'failed') return '解析失败'
  if (isTrash.value) return '回收站'
  if (isArchived.value) return '已归档'
  return '已保存'
})

const statusVariant = computed(() => {
  if (document.value?.ingestStatus === 'failed') return 'destructive'
  if (isTrash.value) return 'destructive'
  if (isArchived.value) return 'neutral'
  return 'neutral'
})

const readingMeta = computed(() => {
  if (!document.value) return []

  return [
    document.value.source || '未知来源',
    document.value.author,
    document.value.wordCount ? `${document.value.wordCount} 字` : null,
    document.value.publishedAt ? `发布 ${formatDate(document.value.publishedAt)}` : null,
  ].filter(Boolean)
})

const aiStatusLabel = computed(() => {
  const status = aiAnalysis.value?.status || document.value?.aiAnalysisStatus
  if (status === 'pending') return '等待生成'
  if (status === 'processing') return '生成中'
  if (status === 'succeeded') return '已生成'
  if (status === 'failed') return '生成失败'
  return '未生成'
})

const citationRange = computed<CitationRange | null>(() => {
  const start = Number(route.query.citationStart)
  const end = Number(route.query.citationEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0) {
    return null
  }
  return {
    startOffset: start,
    endOffset: end,
  }
})

const embeddingIndexLabel = computed(() => {
  const status = document.value?.embeddingIndexStatus
  if (status === 'pending') return '待索引'
  if (status === 'processing') return '索引中'
  if (status === 'succeeded') return '已索引'
  if (status === 'failed') return '索引失败'
  if (status === 'not_configured') return '未配置'
  if (status === 'not_applicable') return '不适用'
  return '未知'
})

const embeddingIndexVariant = computed<'neutral' | 'destructive' | 'outline'>(() => {
  if (document.value?.embeddingIndexStatus === 'failed') return 'destructive'
  if (document.value?.embeddingIndexStatus === 'not_configured') return 'outline'
  return 'neutral'
})

const embeddingIndexDescription = computed(() => {
  const status = document.value?.embeddingIndexStatus
  if (status === 'succeeded' && document.value?.embeddingIndexedAt) {
    return `已进入知识库问答索引，完成于 ${formatDate(document.value.embeddingIndexedAt)}。`
  }
  if (status === 'pending') return '文档已等待进入知识库索引队列。'
  if (status === 'processing') return 'Lumi 正在为这篇文档生成知识库向量索引。'
  if (status === 'failed') {
    return document.value?.embeddingIndexErrorMessage || '索引生成失败，可在设置页重试该任务。'
  }
  if (status === 'not_configured') return '需要先在设置页配置 Embedding，后续新文档才会自动进入知识库问答。'
  if (status === 'not_applicable') return '当前文档不在知识库索引范围内，或尚未创建索引任务。'
  return '暂无索引状态。'
})

onMounted(async () => {
  initShiki()
  await loadDocument()
  pollingTimer = window.setInterval(() => {
    if (shouldPollDocument.value && !loading.value) {
      void loadDocument({ silent: true })
    }
  }, 4000)
})

watch(citationRange, async () => {
  await nextTick()
  scrollToCitationRange()
})

// loading 置回 false 后正文容器才挂载，因此需一并监听，
// 否则首次加载时 refresh 拿到 null 容器，目录会一直空白。
watch([renderedMarkdown, loading], async () => {
  await nextTick()
  refreshRuntimeToc()
})

onBeforeUnmount(() => {
  if (pollingTimer) window.clearInterval(pollingTimer)
})

async function loadDocument(options: { silent?: boolean } = {}) {
  if (!options.silent) {
    loading.value = true
  }
  errorMessage.value = ''
  try {
    const loaded = await client.documents.get(String(route.params.id))
    document.value = loaded
    await markAsReadingIfNeeded(loaded)
    if (document.value?.ingestStatus === 'succeeded') {
      await loadAnnotations({ silent: true })
      await loadTranscriptIfNeeded(loaded)
    }
    await nextTick()
    refreshRuntimeToc()
    scrollToCitationRange()
  } catch (error) {
    notifyError(error, '文章加载失败')
  } finally {
    if (!options.silent) {
      loading.value = false
    }
  }
}

// 字幕随所属文档缓存；切换文档或非视频文档时清空，失败静默置空
async function loadTranscriptIfNeeded(current: DocumentDetail) {
  if (current.type !== 'video') {
    transcript.value = null
    return
  }
  if (transcript.value?.documentId === current.id) return
  try {
    transcript.value = await client.documents.getTranscript(current.id)
  } catch {
    transcript.value = null
  }
}

async function markAsReadingIfNeeded(current: DocumentDetail) {  if (
    current.ingestStatus !== 'succeeded' ||
    current.deletedAt ||
    current.readingStatus !== 'unread'
  ) {
    return
  }

  try {
    document.value = await client.documents.updateReadingStatus(current.id, {
      readingStatus: 'read',
    })
  } catch {
    // Opening a document should not fail just because this soft state update failed.
  }
}

async function archiveDocument() {
  if (!document.value) return
  await runDetailAction(async () => {
    document.value = await client.documents.archive(document.value!.id)
    toast({ title: '已归档', variant: 'success' })
  }, '归档失败')
}

async function unarchiveDocument() {
  if (!document.value) return
  await runDetailAction(async () => {
    document.value = await client.documents.unarchive(document.value!.id)
    toast({ title: '已移回阅读库', variant: 'success' })
  }, '取消归档失败')
}

async function restoreDocument() {
  if (!document.value) return
  await runDetailAction(async () => {
    document.value = await client.documents.restore(document.value!.id)
    toast({ title: '已恢复', variant: 'success' })
  }, '恢复失败')
}

async function toggleFavorite() {
  if (!document.value || !canEditReadingMarkers.value) return
  await runDetailAction(async () => {
    document.value = await client.documents.updateFavorite(document.value!.id, {
      favorite: !document.value!.favoritedAt,
    })
    toast({
      title: document.value.favoritedAt ? '已收藏' : '已取消收藏',
      variant: 'success',
    })
  }, '收藏状态更新失败')
}

function requestDeleteDocument() {
  if (!document.value) return
  confirmDialog.value = {
    title: '删除文章',
    description: `确认删除《${document.value.title}》吗？文章会进入回收站。`,
    actionLabel: '删除',
    run: async () => {
      await runDetailAction(async () => {
        await client.documents.delete(document.value!.id)
        toast({ title: '已移入回收站', variant: 'success' })
        await router.push('/documents')
      }, '删除失败')
    },
  }
}

function requestPermanentlyDeleteDocument() {
  if (!document.value) return
  confirmDialog.value = {
    title: '永久删除',
    description: `确认永久删除《${document.value.title}》吗？此操作不可恢复。`,
    actionLabel: '永久删除',
    run: async () => {
      await runDetailAction(async () => {
        await client.documents.permanentDelete(document.value!.id)
        toast({ title: '已永久删除', variant: 'success' })
        await router.push('/documents')
      }, '永久删除失败')
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

async function addTag(name: string) {
  if (!document.value) return
  if (document.value.tags.some((tag) => tag.name === name)) {
    errorMessage.value = '标签已存在'
    toast({ title: '标签已存在', variant: 'destructive' })
    return
  }

  await runDetailAction(async () => {
    document.value = await client.documents.addTag(document.value!.id, { name })
    toast({ title: '标签已添加', variant: 'success' })
  }, '添加标签失败')
}

async function removeTag(tagId: string) {
  if (!document.value) return
  await runDetailAction(async () => {
    document.value = await client.documents.removeTag(document.value!.id, tagId)
    toast({ title: '标签已移除', variant: 'success' })
  }, '删除标签失败')
}

async function retryIngest() {
  if (!document.value) return
  await runDetailAction(async () => {
    const result = await client.documents.retryIngest(document.value!.id)
    document.value = result.document
    toast({ title: '已重新加入解析队列', variant: 'success' })
  }, '重新解析失败')
}

async function retryAiAnalysis() {
  if (!document.value) return
  aiActionLoading.value = true
  try {
    const result = await client.documents.retryAiAnalysis(document.value.id)
    document.value = {
      ...document.value,
      aiAnalysis: result.analysis,
      aiAnalysisStatus: result.analysis.status,
    }
    toast({ title: '已加入 AI 生成队列', variant: 'success' })
  } catch (error) {
    notifyError(error, 'AI 生成失败')
  } finally {
    aiActionLoading.value = false
  }
}

async function openDrawer(tab: DrawerTab) {
  drawerOpen.value = true
  drawerTab.value = tab
  if (tab === 'annotations' && document.value && isIngestSucceeded.value) {
    await loadAnnotations()
  }
}

async function askAi() {
  if (!document.value) return
  const question = aiQuestion.value.trim()
  if (!question) return

  const exchange = reactive<AiExchange>({
    question,
    answer: '',
    streaming: true,
    failed: false,
  })
  aiExchange.value = exchange
  aiQuestion.value = ''

  try {
    await client.documents.streamAiConversation(
      document.value.id,
      { question },
      (chunk) => {
        exchange.answer += chunk
      },
    )
    exchange.streaming = false
  } catch (error) {
    exchange.streaming = false
    exchange.failed = true
    notifyError(error, 'AI 问答失败')
  }
}

async function loadAnnotations(options: { silent?: boolean } = {}) {
  if (!document.value || document.value.ingestStatus !== 'succeeded') return
  if (!options.silent) annotationsLoading.value = true
  try {
    annotations.value = await client.documents.listAnnotations(document.value.id)
  } catch (error) {
    notifyError(error, '批注加载失败')
  } finally {
    if (!options.silent) annotationsLoading.value = false
  }
}

function handleTextSelection() {
  if (!canEditAnnotations.value || !articleContentRef.value) return

  window.setTimeout(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim() || ''
    if (!selection || selection.rangeCount === 0 || !text) {
      selectionToolbar.value.visible = false
      selectionDraft.value = null
      return
    }

    const range = selection.getRangeAt(0)
    if (
      !articleContentRef.value?.contains(range.commonAncestorContainer) ||
      text.length > 2000
    ) {
      selectionToolbar.value.visible = false
      selectionDraft.value = null
      if (text.length > 2000) {
        toast({ title: '高亮内容过长，请缩短选择范围', variant: 'destructive' })
      }
      return
    }

    const offsets = getSelectionOffsets(articleContentRef.value, range)
    if (!offsets || hasAnnotationOverlap(annotations.value, offsets.startOffset, offsets.endOffset)) {
      selectionToolbar.value.visible = false
      selectionDraft.value = null
      if (offsets) toast({ title: '该区域已有高亮', variant: 'destructive' })
      return
    }

    const plainText = articleContentRef.value.textContent || ''
    const rect = range.getBoundingClientRect()
    selectionDraft.value = {
      selectedText: text,
      prefix: plainText.slice(Math.max(0, offsets.startOffset - 80), offsets.startOffset),
      suffix: plainText.slice(offsets.endOffset, offsets.endOffset + 80),
      occurrenceIndex: countOccurrencesBefore(plainText, text, offsets.startOffset),
      startOffset: offsets.startOffset,
      endOffset: offsets.endOffset,
    }
    selectionToolbar.value = {
      visible: true,
      x: Math.min(rect.left + rect.width / 2, window.innerWidth - 120),
      y: Math.max(12, rect.top - 44),
    }
  })
}

function handleArticleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const seekButton = target?.closest<HTMLElement>('[data-video-seek]')
  if (seekButton) {
    const seconds = Number(seekButton.dataset.videoSeek)
    if (Number.isFinite(seconds)) seekVideo(seconds)
    return
  }
  const marker = target?.closest<HTMLElement>('[data-annotation-id]')
  if (!marker) return
  const annotation = annotations.value.find((item) => item.id === marker.dataset.annotationId)
  if (!annotation) return
  activeAnnotationId.value = annotation.id
  openDrawer('annotations')
  void nextTick(() => focusAnnotationInDrawer(annotation.id))
}

function handleReaderImageError(event: Event) {
  const image = event.target as HTMLImageElement | null
  if (!image || image.tagName !== 'IMG' || image.dataset.fallbackShown === 'true') return

  image.dataset.fallbackShown = 'true'
  image.classList.add('is-broken')
  const src = image.currentSrc || image.src
  const fallback = globalThis.document.createElement('a')
  fallback.className = 'reader-image-fallback'
  fallback.href = src
  fallback.target = '_blank'
  fallback.rel = 'noopener noreferrer'
  fallback.textContent = '图片加载失败，打开原图'
  image.insertAdjacentElement('afterend', fallback)
}

async function createHighlight(note?: string | null) {
  if (!document.value || !selectionDraft.value) return
  const draft = selectionDraft.value
  selectionToolbar.value.visible = false
  annotationActionLoading.value = 'create'
  try {
    const annotation = await client.documents.createAnnotation(document.value.id, {
      ...draft,
      note,
    })
    annotations.value = [...annotations.value, annotation]
    selectionDraft.value = null
    window.getSelection()?.removeAllRanges()
    toast({ title: note ? '批注已添加' : '高亮已添加', variant: 'success' })
  } catch (error) {
    notifyError(error, '高亮保存失败')
  } finally {
    annotationActionLoading.value = ''
  }
}

function openCreateAnnotationDialog() {
  if (!selectionDraft.value) return
  editingAnnotation.value = null
  annotationNote.value = ''
  annotationDialogOpen.value = true
  selectionToolbar.value.visible = false
}

function openEditAnnotationDialog(annotation: AnnotationDto) {
  editingAnnotation.value = annotation
  annotationNote.value = annotation.note || ''
  annotationDialogOpen.value = true
}

async function submitAnnotationDialog() {
  if (!document.value) return
  const note = annotationNote.value.trim()

  if (note.length > 1000) {
    toast({ title: '批注内容过长', variant: 'destructive' })
    return
  }

  annotationActionLoading.value = editingAnnotation.value?.id || 'create-note'
  try {
    if (editingAnnotation.value) {
      const updated = await client.documents.updateAnnotation(
        document.value.id,
        editingAnnotation.value.id,
        { note },
      )
      annotations.value = annotations.value.map((item) =>
        item.id === updated.id ? updated : item,
      )
      toast({ title: '批注已更新', variant: 'success' })
    } else {
      await createHighlight(note)
    }
    annotationDialogOpen.value = false
    annotationNote.value = ''
    editingAnnotation.value = null
  } catch (error) {
    notifyError(error, '批注保存失败')
  } finally {
    annotationActionLoading.value = ''
  }
}

function requestDeleteAnnotation(annotation: AnnotationDto) {
  if (!document.value || !canEditAnnotations.value) return
  const preview =
    annotation.selectedText.length > 40
      ? `${annotation.selectedText.slice(0, 40)}...`
      : annotation.selectedText
  confirmDialog.value = {
    title: '删除批注',
    description: `确认删除该批注吗？高亮「${preview}」会一并移除，且不可恢复。`,
    actionLabel: '删除',
    run: () => deleteAnnotation(annotation),
  }
}

async function deleteAnnotation(annotation: AnnotationDto) {
  if (!document.value || !canEditAnnotations.value) return
  annotationActionLoading.value = annotation.id
  try {
    await client.documents.deleteAnnotation(document.value.id, annotation.id)
    annotations.value = annotations.value.filter((item) => item.id !== annotation.id)
    if (activeAnnotationId.value === annotation.id) {
      activeAnnotationId.value = null
    }
    toast({ title: '高亮已删除', variant: 'success' })
  } catch (error) {
    notifyError(error, '删除高亮失败')
  } finally {
    annotationActionLoading.value = ''
  }
}

function scrollToAnnotation(id: string) {
  activeAnnotationId.value = id
  const element = globalThis.document.querySelector(`[data-annotation-id="${id}"]`)
  if (!element) return
  element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  flashAnnotationMarker(element)
}

// 抽屉批注列表可能仍在加载，条目未渲染时短暂重试。
function focusAnnotationInDrawer(id: string, attempts = 5) {
  const item = globalThis.document.querySelector(`[data-annotation-item="${id}"]`)
  if (!item) {
    if (attempts > 0) window.setTimeout(() => focusAnnotationInDrawer(id, attempts - 1), 100)
    return
  }
  const container = item.closest('.ai-drawer-body')
  if (!container) return
  const containerRect = container.getBoundingClientRect()
  const itemRect = item.getBoundingClientRect()
  const itemTop = itemRect.top - containerRect.top
  const itemBottom = itemRect.bottom - containerRect.top
  if (itemTop < 0 || itemBottom > containerRect.height) {
    container.scrollTop += itemTop - containerRect.height / 2 + itemRect.height / 2
  }
}

function flashAnnotationMarker(marker: Element) {
  marker.classList.remove('is-flashing')
  // 强制重排，让连续点击同一标记时动画能重新播放。
  void (marker as HTMLElement).offsetWidth
  marker.classList.add('is-flashing')
  window.setTimeout(() => marker.classList.remove('is-flashing'), 1300)
}

function scrollToCitationRange() {
  if (!citationRange.value) return
  const element = globalThis.document.querySelector('[data-citation-highlight="true"]')
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function refreshRuntimeToc() {
  refreshToc(articleContentRef.value, isIngestSucceeded.value)
  // TOC 提取后再包裹 [mm:ss] 锚点（幂等，已包裹的节点会被跳过）
  wrapVideoAnchors(articleContentRef.value)
}

// 章节点击 = 滚动正文 + 播放器 seek 到章节时间
async function handleTocNavigate(id: string) {
  await scrollToHeading(id)
  const heading = globalThis.document.getElementById(id)
  const seconds = parseVideoAnchorSeconds(heading?.textContent || '')
  if (seconds !== null) seekVideo(seconds)
}

async function runDetailAction(action: () => Promise<void>, fallback: string) {
  actionLoading.value = true
  errorMessage.value = ''
  try {
    await action()
  } catch (error) {
    notifyError(error, fallback)
  } finally {
    actionLoading.value = false
  }
}

function formatDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(value))
    : ''
}

function documentTypeLabel(value: DocumentType) {
  return documentTypes.find((item) => item.value === value)?.label || value
}

function readingStatusLabel(value: DocumentDetail['readingStatus']) {
  return value === 'read' ? '已读' : '未读'
}

function readingStatusClass(value: DocumentDetail['readingStatus']) {
  return value === 'unread' ? 'reading-status-badge is-unread' : 'reading-status-badge'
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
        <div class="sidebar-title">当前文章</div>
        <nav class="sidebar-nav">
          <button class="sidebar-link" type="button" @click="router.push('/documents')">
            <ArrowLeft class="sidebar-link-icon" />
            <span>返回文章库</span>
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

      <TagEditor
        v-if="document"
        :tags="document.tags"
        :disabled="actionLoading"
        @add="addTag"
        @remove="removeTag"
      />

      <section v-if="document" class="sidebar-section">
        <div class="sidebar-title">操作</div>
        <nav class="sidebar-nav">
          <a
            v-if="document.url"
            class="sidebar-link"
            :href="document.url"
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink class="sidebar-link-icon" />
            <span>打开原文</span>
          </a>
          <button
            v-if="!isTrash && !isArchived"
            class="sidebar-link"
            :disabled="actionLoading"
            type="button"
            @click="archiveDocument"
          >
            <Archive class="sidebar-link-icon" />
            <span>归档文章</span>
          </button>
          <button
            v-if="!isTrash && isArchived"
            class="sidebar-link"
            :disabled="actionLoading"
            type="button"
            @click="unarchiveDocument"
          >
            <ArchiveRestore class="sidebar-link-icon" />
            <span>取消归档</span>
          </button>
          <button
            v-if="isTrash"
            class="sidebar-link"
            :disabled="actionLoading"
            type="button"
            @click="restoreDocument"
          >
            <RotateCcw class="sidebar-link-icon" />
            <span>恢复文章</span>
          </button>
          <button
            v-if="!isTrash"
            class="sidebar-link sidebar-link-danger"
            :disabled="actionLoading"
            type="button"
            @click="requestDeleteDocument"
          >
            <Trash2 class="sidebar-link-icon" />
            <span>删除文章</span>
          </button>
          <button
            v-if="isTrash"
            class="sidebar-link sidebar-link-danger"
            :disabled="actionLoading"
            type="button"
            @click="requestPermanentlyDeleteDocument"
          >
            <Trash2 class="sidebar-link-icon" />
            <span>永久删除</span>
          </button>
        </nav>
      </section>
    </aside>

    <div class="main">
      <header class="header article-header">
        <div class="header-spacer"></div>
        <div v-if="document" class="header-actions">
          <UiButton
            variant="secondary"
            :disabled="!canEditReadingMarkers || actionLoading"
            :title="document.favoritedAt ? '取消收藏' : '收藏'"
            @click="toggleFavorite"
          >
            <Star :size="15" :class="{ 'is-filled-icon': document.favoritedAt }" />
            {{ document.favoritedAt ? '已收藏' : '收藏' }}
          </UiButton>
          <UiButton
            v-if="!isVideoDocument"
            variant="secondary"
            @click="openDrawer('annotations')"
          >
            <Highlighter :size="15" />
            批注
          </UiButton>
          <UiButton
            v-else
            variant="secondary"
            :disabled="!transcript?.segments.length"
            title="查看视频字幕"
            @click="openDrawer('transcript')"
          >
            <Captions :size="15" />
            字幕
          </UiButton>
          <UiButton variant="secondary" @click="openDrawer('ai')">
            <Bot :size="15" />
            AI
          </UiButton>
          <UiButton v-if="!isTrash && !isArchived" variant="secondary" @click="archiveDocument">
            <Archive :size="15" />
            归档
          </UiButton>
          <UiButton v-if="isTrash" variant="secondary" @click="restoreDocument">
            <RotateCcw :size="15" />
            恢复
          </UiButton>
          <a
            v-if="document.url"
            class="ui-button ui-button--ghost ui-button--size-icon"
            :href="document.url"
            rel="noreferrer"
            target="_blank"
            title="原文"
          >
            <ExternalLink :size="15" />
          </a>
        </div>
      </header>

      <main class="content">
        <p v-if="errorMessage" class="inline-alert">{{ errorMessage }}</p>

        <UiCard v-if="loading" class="article-detail loading-card">
          <span class="loading-line"></span>
          <span class="loading-line short"></span>
          <span class="loading-line soft"></span>
        </UiCard>

        <UiEmptyState
          v-else-if="!document"
          title="文章不可用"
          description="这篇文章可能已被删除，或当前账号没有访问权限。"
        />

        <div v-else class="article-reading-layout" :class="{ 'has-toc': tocItems.length }">
          <article class="article-detail">
            <header class="article-detail-header">
              <div class="article-detail-status">
                <UiBadge :variant="statusVariant">{{ statusLabel }}</UiBadge>
                <UiBadge variant="outline">{{ documentTypeLabel(document.type) }}</UiBadge>
                <UiBadge
                  :class="readingStatusClass(document.readingStatus)"
                  variant="neutral"
                >
                  {{ readingStatusLabel(document.readingStatus) }}
                </UiBadge>
                <UiBadge v-if="document.favoritedAt" variant="neutral">已收藏</UiBadge>
                <UiBadge v-if="document.aiAnalysisStatus" variant="neutral">
                  AI {{ aiStatusLabel }}
                </UiBadge>
                <UiBadge
                  v-if="document.embeddingIndexStatus !== 'succeeded'"
                  :variant="embeddingIndexVariant"
                >
                  知识库索引 {{ embeddingIndexLabel }}
                </UiBadge>
              </div>
              <h1 class="article-detail-title">{{ document.title }}</h1>
              <div class="article-detail-meta">
                <span>{{ document.source || '未知来源' }}</span>
                <span>
                  <CalendarDays :size="14" />
                  创建 {{ formatDate(document.createdAt) }}
                </span>
                <span v-if="document.updatedAt">更新 {{ formatDate(document.updatedAt) }}</span>
                <span v-for="item in readingMeta" :key="String(item)">{{ item }}</span>
              </div>
              <div class="article-index-status">
                <p>{{ embeddingIndexDescription }}</p>
                <UiButton
                  v-if="document.embeddingIndexStatus === 'failed' || document.embeddingIndexStatus === 'not_configured'"
                  variant="secondary"
                  size="sm"
                  @click="router.push('/settings?tab=jobs')"
                >
                  <Settings :size="14" />
                  查看设置
                </UiButton>
              </div>
              <div v-if="document.tags.length" class="article-detail-tags">
                <UiBadge v-for="item in document.tags" :key="item.id" variant="neutral">
                  {{ item.name }}
                </UiBadge>
              </div>
            </header>

            <VideoHeaderCard
              v-if="isVideoDocument"
              ref="videoCardRef"
              :url="document.url || ''"
              :cover-image="document.coverImage"
              :duration-seconds="document.videoDurationSeconds"
              :source="document.source"
            />

            <UiEmptyState
              v-if="isIngestPending"
              title="文章正在解析"
              description="Lumi 正在提取正文并转换为 Markdown，完成后会自动生成 AI 阅读卡片。"
            >
              <template #icon>
                <LoaderCircle :size="28" />
              </template>
            </UiEmptyState>

            <UiEmptyState
              v-else-if="isIngestFailed"
              title="文章解析失败"
              :description="document.ingestErrorMessage || '页面正文提取失败，可以重新加入解析队列。'"
            >
              <template #icon>
                <RefreshCw :size="28" />
              </template>
              <template #actions>
                <UiButton :disabled="actionLoading" @click="retryIngest">
                  <RefreshCw :size="15" />
                  重新解析
                </UiButton>
              </template>
            </UiEmptyState>

            <div
              v-else
              ref="articleContentRef"
              class="article-detail-content markdown-reader"
              @click="handleArticleClick"
              @error.capture="handleReaderImageError"
              @mouseup="handleTextSelection"
              v-html="renderedMarkdown"
            ></div>
          </article>

          <ArticleToc
            v-if="isIngestSucceeded"
            :items="tocItems"
            :active-id="activeTocId"
            @navigate="handleTocNavigate"
          />
        </div>
      </main>
    </div>

    <AnnotationLayer
      :toolbar="selectionToolbar"
      :dialog-open="annotationDialogOpen"
      :editing-annotation="editingAnnotation"
      :note="annotationNote"
      :action-loading="annotationActionLoading"
      @update:dialog-open="annotationDialogOpen = $event"
      @update:note="annotationNote = $event"
      @create-highlight="createHighlight(null)"
      @open-annotation-dialog="openCreateAnnotationDialog"
      @submit="submitAnnotationDialog"
    />

    <AiDrawer
      v-if="document"
      :open="drawerOpen"
      :tab="drawerTab"
      :is-video="isVideoDocument"
      :ingest-succeeded="isIngestSucceeded"
      :is-trash="isTrash"
      :can-edit-annotations="canEditAnnotations"
      :ai-analysis="aiAnalysis"
      :ai-status-label="aiStatusLabel"
      :ai-action-loading="aiActionLoading"
      :ai-exchange="aiExchange"
      :ai-question="aiQuestion"
      :annotations="annotations"
      :annotations-loading="annotationsLoading"
      :annotation-action-loading="annotationActionLoading"
      :active-annotation-id="activeAnnotationId"
      :transcript="transcript"
      @update:open="drawerOpen = $event"
      @update:tab="(value) => openDrawer(value)"
      @update:ai-question="aiQuestion = $event"
      @retry-ai-analysis="retryAiAnalysis"
      @ask-ai="askAi"
      @edit-annotation="openEditAnnotationDialog"
      @delete-annotation="requestDeleteAnnotation"
      @scroll-to-annotation="scrollToAnnotation"
      @seek-transcript="seekVideo"
      @seek="seekVideo"
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
