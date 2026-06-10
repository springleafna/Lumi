<script setup lang="ts">
import DOMPurify from 'dompurify'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bot,
  CalendarDays,
  ExternalLink,
  Highlighter,
  LoaderCircle,
  MessageSquare,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'
import { createHighlighter, type Highlighter as ShikiHighlighter } from 'shiki/bundle/web'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import type {
  AiConversationDto,
  AnnotationDto,
  DocumentDetail,
  DocumentType,
} from '@lumi/shared'
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import UiCard from '../components/ui/Card.vue'
import UiDialog from '../components/ui/Dialog.vue'
import UiEmptyState from '../components/ui/EmptyState.vue'
import UiInput from '../components/ui/Input.vue'
import UiTabs from '../components/ui/Tabs.vue'
import { useToast } from '../composables/useToast'
import lumiLogo from '../assets/lumi-logo.svg'
import { client } from '../lib/client'

type ConfirmDialogState = {
  title: string
  description: string
  actionLabel: string
  run: () => Promise<void>
}

type TocItem = {
  id: string
  title: string
  level: number
}

type DrawerTab = 'ai' | 'annotations'

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
const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
})
const defaultFence =
  markdown.renderer.rules.fence ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

const shikiHighlighter = ref<ShikiHighlighter | null>(null)

markdown.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const highlighter = shikiHighlighter.value
  const token = tokens[idx]
  const lang = normalizeCodeLang(token.info)
  if (highlighter) {
    try {
      return highlighter.codeToHtml(token.content, {
        lang,
        theme: 'github-light',
      })
    } catch {
      // Fall back to markdown-it below.
    }
  }
  return defaultFence(tokens, idx, options, env, self)
}

const documentTypes: Array<{ value: DocumentType; label: string }> = [
  { value: 'article', label: '文章' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'pdf', label: 'PDF' },
  { value: 'fragment', label: '片段' },
]

const drawerTabs = [
  { value: 'ai', label: 'AI' },
  { value: 'annotations', label: '批注' },
]

const document = ref<DocumentDetail | null>(null)
const loading = ref(false)
const actionLoading = ref(false)
const tagName = ref('')
const errorMessage = ref('')
const confirmDialog = ref<ConfirmDialogState | null>(null)
const confirmLoading = ref(false)
const drawerOpen = ref(false)
const drawerTab = ref<DrawerTab>('ai')
const conversations = ref<AiConversationDto[]>([])
const conversationsLoading = ref(false)
const aiActionLoading = ref(false)
const aiQuestion = ref('')
const streamingConversationId = ref('')
const annotations = ref<AnnotationDto[]>([])
const annotationsLoading = ref(false)
const annotationActionLoading = ref('')
const articleContentRef = ref<HTMLElement | null>(null)
const selectionDraft = ref<SelectionDraft | null>(null)
const selectionToolbar = ref({ visible: false, x: 0, y: 0 })
const annotationDialogOpen = ref(false)
const annotationNote = ref('')
const editingAnnotation = ref<AnnotationDto | null>(null)
let pollingTimer: number | undefined
let headingObserver: IntersectionObserver | null = null
const tocItems = ref<TocItem[]>([])
const activeTocId = ref('')

const renderedMarkdown = computed(() => {
  const current = document.value
  Boolean(shikiHighlighter.value)
  if (!current || current.ingestStatus !== 'succeeded') return ''

  const html = DOMPurify.sanitize(
    markdown.render(current.markdown),
    {
      ADD_ATTR: ['target', 'rel', 'loading'],
      ADD_TAGS: ['figure', 'figcaption'],
    },
  )

  return applyReaderHighlights(html, sortedAnnotations.value, citationRange.value)
})

const sortedAnnotations = computed(() =>
  [...annotations.value].sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  }),
)

const isTrash = computed(() => Boolean(document.value?.deletedAt))
const isArchived = computed(() => Boolean(document.value?.archivedAt) && !isTrash.value)
const isIngestPending = computed(
  () => document.value?.ingestStatus === 'pending' || document.value?.ingestStatus === 'processing',
)
const isIngestFailed = computed(() => document.value?.ingestStatus === 'failed')
const isIngestSucceeded = computed(() => document.value?.ingestStatus === 'succeeded')
const canEditReadingMarkers = computed(() => Boolean(document.value && !isTrash.value))
const canEditAnnotations = computed(() => Boolean(document.value && isIngestSucceeded.value && !isTrash.value))
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

watch(renderedMarkdown, async () => {
  await nextTick()
  refreshRuntimeToc()
})

onBeforeUnmount(() => {
  if (pollingTimer) window.clearInterval(pollingTimer)
  disconnectHeadingObserver()
})

async function initShiki() {
  try {
    shikiHighlighter.value = await createHighlighter({
      themes: ['github-light'],
      langs: [
        'bash',
        'css',
        'html',
        'java',
        'javascript',
        'json',
        'markdown',
        'python',
        'shell',
        'sql',
        'tsx',
        'typescript',
        'vue',
        'yaml',
      ],
    })
  } catch {
    shikiHighlighter.value = null
  }
}

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
    }
    if (drawerOpen.value && drawerTab.value === 'ai' && isIngestSucceeded.value) {
      await loadConversations()
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

async function markAsReadingIfNeeded(current: DocumentDetail) {
  if (
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

async function addTag() {
  if (!document.value) return
  const name = tagName.value.trim()
  if (!name) return
  if (document.value.tags.some((tag) => tag.name === name)) {
    errorMessage.value = '标签已存在'
    toast({ title: '标签已存在', variant: 'destructive' })
    return
  }

  await runDetailAction(async () => {
    document.value = await client.documents.addTag(document.value!.id, { name })
    tagName.value = ''
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
  if (tab === 'ai' && document.value && isIngestSucceeded.value) {
    await loadConversations()
  }
  if (tab === 'annotations' && document.value && isIngestSucceeded.value) {
    await loadAnnotations()
  }
}

async function loadConversations() {
  if (!document.value) return
  conversationsLoading.value = true
  try {
    conversations.value = await client.documents.listAiConversations(document.value.id)
  } catch (error) {
    notifyError(error, '问答历史加载失败')
  } finally {
    conversationsLoading.value = false
  }
}

async function askAi() {
  if (!document.value) return
  const question = aiQuestion.value.trim()
  if (!question) return

  const draft: AiConversationDto = {
    id: `draft-${Date.now()}`,
    question,
    answer: '',
    citations: [],
    status: 'processing',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    documentId: document.value.id,
  }

  conversations.value = [...conversations.value, draft]
  streamingConversationId.value = draft.id
  aiQuestion.value = ''

  try {
    await client.documents.streamAiConversation(
      document.value.id,
      { question },
      (chunk) => {
        draft.answer = `${draft.answer || ''}${chunk}`
      },
    )
    await loadConversations()
  } catch (error) {
    draft.status = 'failed'
    draft.errorMessage = getErrorMessage(error, 'AI 问答失败')
    notifyError(error, 'AI 问答失败')
  } finally {
    streamingConversationId.value = ''
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
    if (!offsets || hasAnnotationOverlap(offsets.startOffset, offsets.endOffset)) {
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
  const marker = target?.closest<HTMLElement>('[data-annotation-id]')
  if (!marker) return
  const annotation = annotations.value.find((item) => item.id === marker.dataset.annotationId)
  if (annotation) {
    openDrawer('annotations')
    scrollToAnnotation(annotation.id)
  }
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

async function deleteAnnotation(annotation: AnnotationDto) {
  if (!document.value || !canEditAnnotations.value) return
  annotationActionLoading.value = annotation.id
  try {
    await client.documents.deleteAnnotation(document.value.id, annotation.id)
    annotations.value = annotations.value.filter((item) => item.id !== annotation.id)
    toast({ title: '高亮已删除', variant: 'success' })
  } catch (error) {
    notifyError(error, '删除高亮失败')
  } finally {
    annotationActionLoading.value = ''
  }
}

function scrollToAnnotation(id: string) {
  const element = globalThis.document.querySelector(`[data-annotation-id="${id}"]`)
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function scrollToCitationRange() {
  if (!citationRange.value) return
  const element = globalThis.document.querySelector('[data-citation-highlight="true"]')
  element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

function aiList(items?: string[] | null) {
  return items?.filter(Boolean) || []
}

function refreshRuntimeToc() {
  disconnectHeadingObserver()
  tocItems.value = []
  activeTocId.value = ''

  if (!articleContentRef.value || !isIngestSucceeded.value) return

  const headings = Array.from(
    articleContentRef.value.querySelectorAll<HTMLElement>('h2, h3'),
  )
  const items: TocItem[] = []

  headings.forEach((heading, index) => {
    const title = normalizeTocTitle(heading.textContent || '')
    const level = heading.tagName.toLowerCase() === 'h3' ? 3 : 2
    const id = `heading-${index}`
    heading.id = id
    if (title) {
      items.push({ id, title, level })
    }
  })

  if (items.length < 2) return

  tocItems.value = items
  activeTocId.value = items[0]?.id || ''
  observeRuntimeHeadings(headings)
}

function normalizeTocTitle(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function observeRuntimeHeadings(headings: HTMLElement[]) {
  if (typeof IntersectionObserver === 'undefined') return

  const scrollRoot = globalThis.document.querySelector<HTMLElement>('.content')
  headingObserver = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visibleEntry?.target instanceof HTMLElement) {
        activeTocId.value = visibleEntry.target.id
      }
    },
    {
      root: scrollRoot || null,
      rootMargin: '-80px 0px -70% 0px',
      threshold: [0, 1],
    },
  )

  for (const heading of headings) {
    headingObserver.observe(heading)
  }
}

function disconnectHeadingObserver() {
  headingObserver?.disconnect()
  headingObserver = null
}

function scrollToHeading(id: string) {
  globalThis.document.getElementById(id)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

function applyReaderHighlights(
  html: string,
  items: AnnotationDto[],
  citation: CitationRange | null,
) {
  if (!items.length && !citation) return html
  if (typeof DOMParser === 'undefined') return html

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<main>${html}</main>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return html

  for (const annotation of [...items].sort((a, b) => b.startOffset - a.startOffset)) {
    wrapTextRange(root, annotation.startOffset, annotation.endOffset, {
      className: 'reader-annotation-mark',
      annotationId: annotation.id,
    })
  }

  if (citation) {
    wrapTextRange(root, citation.startOffset, citation.endOffset, {
      className: 'reader-citation-mark',
      citation: true,
    })
  }

  return root.innerHTML
}

function wrapTextRange(
  root: Element,
  startOffset: number,
  endOffset: number,
  options: {
    className: string
    annotationId?: string
    citation?: boolean
  },
) {
  const nodes: Array<{ node: Text; start: number; end: number }> = []
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let currentOffset = 0
  let current = walker.nextNode()

  while (current) {
    const node = current as Text
    const length = node.data.length
    nodes.push({ node, start: currentOffset, end: currentOffset + length })
    currentOffset += length
    current = walker.nextNode()
  }

  for (const item of nodes.reverse()) {
    const localStart = Math.max(startOffset, item.start) - item.start
    const localEnd = Math.min(endOffset, item.end) - item.start
    if (localStart < 0 || localEnd > item.node.data.length || localStart >= localEnd) continue

    const range = root.ownerDocument.createRange()
    range.setStart(item.node, localStart)
    range.setEnd(item.node, localEnd)
    const span = root.ownerDocument.createElement('mark')
    span.className = options.className
    if (options.annotationId) {
      span.dataset.annotationId = options.annotationId
    }
    if (options.citation) {
      span.dataset.citationHighlight = 'true'
    }
    try {
      range.surroundContents(span)
    } catch {
      // Keep the original text if the browser cannot wrap this range.
    }
  }
}

function getSelectionOffsets(root: HTMLElement, range: Range) {
  const startRange = globalThis.document.createRange()
  startRange.selectNodeContents(root)
  startRange.setEnd(range.startContainer, range.startOffset)

  const endRange = globalThis.document.createRange()
  endRange.selectNodeContents(root)
  endRange.setEnd(range.endContainer, range.endOffset)

  const startOffset = startRange.toString().length
  const endOffset = endRange.toString().length
  if (endOffset <= startOffset) return null
  return { startOffset, endOffset }
}

function hasAnnotationOverlap(startOffset: number, endOffset: number) {
  return annotations.value.some(
    (item) => item.startOffset < endOffset && item.endOffset > startOffset,
  )
}

function countOccurrencesBefore(text: string, selectedText: string, offset: number) {
  const before = text.slice(0, offset)
  if (!selectedText) return 0
  let count = 0
  let index = before.indexOf(selectedText)
  while (index >= 0) {
    count += 1
    index = before.indexOf(selectedText, index + selectedText.length)
  }
  return count
}

function normalizeCodeLang(info: string) {
  const lang = info.trim().split(/\s+/)[0]?.toLowerCase() || 'text'
  if (lang === 'js') return 'javascript'
  if (lang === 'ts') return 'typescript'
  if (lang === 'sh' || lang === 'zsh') return 'shell'
  if (lang === 'yml') return 'yaml'
  return lang
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

      <section v-if="document" class="sidebar-section">
        <div class="sidebar-title">标签管理</div>
        <div class="sidebar-tag-list">
          <UiBadge v-for="item in document.tags" :key="item.id" variant="neutral">
            <Tag :size="12" />
            {{ item.name }}
            <button
              class="badge-delete"
              :disabled="actionLoading"
              title="删除标签"
              type="button"
              @click="removeTag(item.id)"
            >
              <X :size="12" />
            </button>
          </UiBadge>
          <p v-if="document.tags.length === 0" class="sidebar-empty">暂无标签</p>
        </div>
        <form class="tag-form" @submit.prevent="addTag">
          <UiInput v-model="tagName" placeholder="添加标签" />
          <UiButton size="icon" variant="secondary" :disabled="actionLoading" type="submit">
            <Plus :size="15" />
          </UiButton>
        </form>
      </section>

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
          <UiButton variant="secondary" @click="openDrawer('annotations')">
            <Highlighter :size="15" />
            批注
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

          <aside
            v-if="isIngestSucceeded && tocItems.length"
            class="article-toc"
            aria-label="文章目录"
          >
            <p class="article-toc-title">目录</p>
            <nav class="article-toc-nav">
              <button
                v-for="item in tocItems"
                :key="item.id"
                class="article-toc-link"
                :class="[`level-${item.level}`, { active: activeTocId === item.id }]"
                type="button"
                @click="scrollToHeading(item.id)"
              >
                {{ item.title }}
              </button>
            </nav>
          </aside>
        </div>
      </main>
    </div>

    <div
      v-if="selectionToolbar.visible"
      class="selection-toolbar"
      :style="{ left: `${selectionToolbar.x}px`, top: `${selectionToolbar.y}px` }"
      @mousedown.prevent
    >
      <button type="button" @click="createHighlight(null)">高亮</button>
      <button type="button" @click="openCreateAnnotationDialog">批注</button>
    </div>

    <aside v-if="document" class="ai-drawer" :class="{ open: drawerOpen }">
      <header class="ai-drawer-header">
        <div>
          <p class="kicker">Lumi</p>
          <h2>辅助阅读</h2>
        </div>
        <UiButton variant="ghost" size="icon" title="关闭辅助区" @click="drawerOpen = false">
          <X :size="16" />
        </UiButton>
      </header>

      <div class="drawer-tabs">
        <UiTabs
          :model-value="drawerTab"
          :items="drawerTabs"
          @update:model-value="(value) => openDrawer(value as DrawerTab)"
        />
      </div>

      <div v-if="drawerTab === 'ai'" class="ai-drawer-body">
        <section class="ai-section">
          <div class="ai-section-header">
            <h3>分析状态</h3>
            <UiBadge variant="neutral">{{ aiStatusLabel }}</UiBadge>
          </div>
          <p v-if="!isIngestSucceeded" class="ai-muted">
            文章解析完成后会自动生成摘要、要点和标签。
          </p>
          <p
            v-else-if="aiAnalysis?.status === 'pending' || aiAnalysis?.status === 'processing'"
            class="ai-muted"
          >
            AI 正在生成结构化阅读卡片。
          </p>
          <p v-else-if="aiAnalysis?.status === 'failed'" class="ai-muted">
            {{ aiAnalysis.errorMessage || 'AI 生成失败，可以稍后重试。' }}
          </p>
          <p v-else-if="!aiAnalysis" class="ai-muted">当前文章还没有 AI 分析结果。</p>

          <UiButton
            v-if="isIngestSucceeded && (!aiAnalysis || aiAnalysis.status === 'failed')"
            variant="secondary"
            size="sm"
            :disabled="aiActionLoading"
            @click="retryAiAnalysis"
          >
            <RefreshCw :size="14" />
            {{ aiActionLoading ? '处理中...' : '生成 AI 分析' }}
          </UiButton>
        </section>

        <section v-if="aiAnalysis?.status === 'succeeded'" class="ai-section">
          <h3>摘要</h3>
          <p v-if="aiAnalysis.oneSentenceSummary" class="ai-summary-lead">
            {{ aiAnalysis.oneSentenceSummary }}
          </p>
          <p v-if="aiAnalysis.summary" class="ai-muted">{{ aiAnalysis.summary }}</p>

          <div v-if="aiList(aiAnalysis.keyPoints).length" class="ai-list-block">
            <h4>关键要点</h4>
            <ul>
              <li v-for="item in aiList(aiAnalysis.keyPoints)" :key="item">{{ item }}</li>
            </ul>
          </div>

          <div v-if="aiList(aiAnalysis.concepts).length" class="ai-list-block">
            <h4>核心概念</h4>
            <div class="article-detail-tags">
              <UiBadge v-for="item in aiList(aiAnalysis.concepts)" :key="item" variant="neutral">
                {{ item }}
              </UiBadge>
            </div>
          </div>

          <div v-if="aiList(aiAnalysis.actions).length" class="ai-list-block">
            <h4>行动项</h4>
            <ul>
              <li v-for="item in aiList(aiAnalysis.actions)" :key="item">{{ item }}</li>
            </ul>
          </div>

          <div v-if="aiAnalysis.audience" class="ai-list-block">
            <h4>适合人群</h4>
            <p class="ai-muted">{{ aiAnalysis.audience }}</p>
          </div>
        </section>

        <section class="ai-section ai-chat-section">
          <div class="ai-section-header">
            <h3>文章问答</h3>
            <MessageSquare :size="15" />
          </div>

          <p v-if="!isIngestSucceeded" class="ai-muted">文章解析完成后即可提问。</p>
          <p v-else-if="conversationsLoading" class="ai-muted">正在加载问答历史...</p>

          <div v-else class="ai-chat-list">
            <p v-if="conversations.length === 0" class="ai-muted">还没有问题。</p>
            <article v-for="item in conversations" :key="item.id" class="ai-chat-item">
              <h4>{{ item.question }}</h4>
              <p class="ai-answer">
                {{ item.answer || (streamingConversationId === item.id ? '正在生成...' : '暂无回答') }}
              </p>
              <div v-if="item.citations.length" class="ai-citations">
                <span v-for="citation in item.citations" :key="citation.index">
                  依据 {{ citation.index }}
                </span>
              </div>
            </article>
          </div>
        </section>
      </div>

      <div v-else class="ai-drawer-body">
        <section class="ai-section">
          <div class="ai-section-header">
            <h3>高亮与批注</h3>
            <UiBadge variant="neutral">{{ annotations.length }}</UiBadge>
          </div>
          <p v-if="isTrash" class="ai-muted">回收站文章只读，恢复后可以继续编辑批注。</p>
          <p v-else class="ai-muted">在正文中选中文字，可以创建高亮或批注。</p>
        </section>

        <section class="ai-section annotation-list-section">
          <p v-if="annotationsLoading" class="ai-muted">正在加载批注...</p>
          <p v-else-if="annotations.length === 0" class="ai-muted">还没有高亮或批注。</p>
          <article v-for="item in sortedAnnotations" v-else :key="item.id" class="annotation-item">
            <button class="annotation-text" type="button" @click="scrollToAnnotation(item.id)">
              {{ item.selectedText }}
            </button>
            <p v-if="item.note" class="annotation-note">{{ item.note }}</p>
            <p v-else class="annotation-note muted">未添加批注</p>
            <div v-if="canEditAnnotations" class="annotation-actions">
              <UiButton
                variant="ghost"
                size="sm"
                :disabled="Boolean(annotationActionLoading)"
                @click="openEditAnnotationDialog(item)"
              >
                <PencilLine :size="13" />
                编辑
              </UiButton>
              <UiButton
                variant="ghost"
                size="sm"
                :disabled="Boolean(annotationActionLoading)"
                @click="deleteAnnotation(item)"
              >
                <Trash2 :size="13" />
                删除
              </UiButton>
            </div>
          </article>
        </section>
      </div>

      <form v-if="drawerTab === 'ai'" class="ai-question-form" @submit.prevent="askAi">
        <UiInput
          v-model="aiQuestion"
          :disabled="!isIngestSucceeded || Boolean(streamingConversationId)"
          placeholder="围绕当前文章提问..."
        />
        <UiButton
          type="submit"
          size="icon"
          :disabled="!isIngestSucceeded || !aiQuestion.trim() || Boolean(streamingConversationId)"
        >
          <MessageSquare :size="15" />
        </UiButton>
      </form>
    </aside>

    <UiDialog
      :open="annotationDialogOpen"
      :title="editingAnnotation ? '编辑批注' : '添加批注'"
      description="批注会绑定到当前选中的正文。"
      @update:open="annotationDialogOpen = $event"
    >
      <form class="dialog-form" @submit.prevent="submitAnnotationDialog">
        <label class="field-group">
          <span>批注</span>
          <textarea
            v-model="annotationNote"
            class="ui-input annotation-textarea"
            maxlength="1000"
            placeholder="写下这段内容给你的提示..."
          ></textarea>
        </label>
        <div class="dialog-actions">
          <UiButton variant="ghost" @click="annotationDialogOpen = false">取消</UiButton>
          <UiButton type="submit" :disabled="Boolean(annotationActionLoading)">
            {{ annotationActionLoading ? '保存中...' : '保存批注' }}
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
