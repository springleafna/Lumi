<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import type { AnnotationDto, DocumentDetail } from '@lumi/shared'
import { showConfirmDialog, showImagePreview, showToast } from 'vant'
import AnnotationListSheet from '../components/AnnotationListSheet.vue'
import ReaderAiSheet from '../components/ReaderAiSheet.vue'
import AnnotationNoteSheet from '../components/reader/AnnotationNoteSheet.vue'
import AiAnalysisCard from '../components/reader/AiAnalysisCard.vue'
import SelectionToolbar from '../components/reader/SelectionToolbar.vue'
import type { ReaderAiExchange } from '../lib/ai-exchange'
import TocSheet from '../components/TocSheet.vue'
import { useMarkdownRenderer } from '../composables/useMarkdownRenderer'
import { useReaderSelection, type SelectionDraft } from '../composables/useReaderSelection'
import { useRuntimeToc } from '../composables/useRuntimeToc'
import { useTheme } from '../composables/useTheme'
import { applyReaderHighlights } from '../lib/highlight-dom'
import { loadReaderPosition, saveReaderPosition } from '../lib/reader-position'
import { client } from '../lib/client'

const FONT_SIZE_KEY = 'lumi_reader_font_size'
const FONT_OPTIONS = [
  { value: '15', text: '小字号' },
  { value: '17', text: '标准' },
  { value: '19', text: '大字号' },
]

// 组件内 ref 名为 document 时会遮蔽全局 document，DOM 访问统一走 globalThis.document。
const route = useRoute()
const router = useRouter()

const { shikiHighlighter, initShiki, render } = useMarkdownRenderer({ html: true })
const { tocItems, activeTocId, refresh: refreshToc, scrollToHeading } = useRuntimeToc()
const { resolved: resolvedTheme } = useTheme()

const document = ref<DocumentDetail | null>(null)
const loading = ref(false)
const loadError = ref('')
const annotations = ref<AnnotationDto[]>([])
const annotationsLoading = ref(false)
const retryingIngest = ref(false)

const contentRef = ref<HTMLElement | null>(null)
const tocOpen = ref(false)
const annotationsOpen = ref(false)
const aiOpen = ref(false)
const fontPopoverOpen = ref(false)
const moreActionsOpen = ref(false)
const fontSize = ref(Number(localStorage.getItem(FONT_SIZE_KEY)) || 17)

const aiExchange = ref<ReaderAiExchange | null>(null)
const aiQuestion = ref('')

// 划词批注：选区检测 → 浮条（高亮/写笔记）→ 笔记弹层（新建/编辑共用）
const {
  draft: selectionDraft,
  toolbar: selectionToolbar,
  clearSelection,
  attach: attachSelection,
} = useReaderSelection({
  container: () => contentRef.value,
  annotations: () => annotations.value,
  onOverlap: () => showToast('该区域已有高亮'),
  onTooLong: () => showToast('高亮内容过长，请缩短选择范围'),
})

const noteSheetOpen = ref(false)
const noteSheetNote = ref('')
const editingAnnotation = ref<AnnotationDto | null>(null)
const annotationActionLoading = ref(false)
// 弹层里输入会把正文选区收起并触发 selectionchange 清掉草稿，打开弹层前先快照
const pendingNoteDraft = ref<SelectionDraft | null>(null)

let pollingTimer: number | undefined
let savePositionTimer: number | undefined
let positionRestoredFor = ''

const isIngestSucceeded = computed(() => document.value?.ingestStatus === 'succeeded')
const isIngestPending = computed(
  () => document.value?.ingestStatus === 'pending' || document.value?.ingestStatus === 'processing',
)
const isIngestFailed = computed(() => document.value?.ingestStatus === 'failed')

const sortedAnnotations = computed(() =>
  [...annotations.value].sort((a, b) => a.startOffset - b.startOffset),
)

const renderedHtml = computed(() => {
  const current = document.value
  // 引用 shikiHighlighter 触发 highlighter 就绪后重算。
  Boolean(shikiHighlighter.value)
  if (!current || current.ingestStatus !== 'succeeded') return ''
  const html = render(current.markdown)
  return applyReaderHighlights(html, sortedAnnotations.value, null)
})

/** 仅在分析成功时露出阅读卡，模板里避免深层可空链判断。 */
const aiAnalysis = computed(() => {
  const analysis = document.value?.aiAnalysis
  return analysis && analysis.status === 'succeeded' ? analysis : null
})

const moreActions = computed(() => {
  const current = document.value
  if (!current) return []
  const actions: Array<{ text: string; value: string }> = []
  if (current.url) actions.push({ text: '浏览器打开', value: 'open' })
  actions.push({ text: current.favoritedAt ? '取消收藏' : '收藏', value: 'favorite' })
  actions.push({ text: '删除文章', value: 'delete' })
  return actions
})

onMounted(async () => {
  void initShiki(resolvedTheme.value)
  await loadDocument()
  pollingTimer = window.setInterval(() => {
    if (isIngestPending.value && !loading.value) void loadDocument({ silent: true })
  }, 4000)
  window.addEventListener('scroll', onReaderScroll, { passive: true })
  attachSelection()
})

// 深浅切换时重建 Shiki highlighter（github-light / github-dark）
watch(resolvedTheme, (theme) => {
  void initShiki(theme)
})

onBeforeUnmount(() => {
  if (pollingTimer) window.clearInterval(pollingTimer)
  window.removeEventListener('scroll', onReaderScroll)
  if (savePositionTimer !== undefined) window.clearTimeout(savePositionTimer)
  saveScrollPosition()
})

// loading 置回 false 后正文容器才挂载，需一并监听再刷新目录。
// 位置恢复必须等 loading 结束且正文渲染后执行：过早 scrollTo 会因
// 页面高度不足被钳到 0，且每篇只恢复一次。
watch([renderedHtml, loading], async () => {
  await nextTick()
  refreshToc(contentRef.value, isIngestSucceeded.value)
  if (renderedHtml.value && !loading.value) restoreScrollPosition()
})

/** 滚过一屏才记位置，防抖 400ms。 */
function onReaderScroll() {
  if (savePositionTimer !== undefined) return
  savePositionTimer = window.setTimeout(() => {
    savePositionTimer = undefined
    saveScrollPosition()
  }, 400)
}

function saveScrollPosition() {
  const current = document.value
  if (!current || !isIngestSucceeded.value) return
  if (window.scrollY > window.innerHeight) {
    saveReaderPosition(current.id, window.scrollY)
  }
}

function restoreScrollPosition() {
  const current = document.value
  if (!current || !isIngestSucceeded.value || positionRestoredFor === current.id) return
  positionRestoredFor = current.id
  const saved = loadReaderPosition(current.id)
  if (saved <= 0) return

  void (async () => {
    const container = contentRef.value
    // 图片加载会持续撑高版面，等图片就绪（上限 3s 兜底）再恢复，否则 scrollTo 会被钳制
    if (container) {
      const pending = Array.from(container.querySelectorAll('img')).filter((img) => !img.complete)
      if (pending.length) {
        await Promise.race([
          Promise.all(
            pending.map(
              (img) =>
                new Promise<void>((resolve) => {
                  img.addEventListener('load', () => resolve(), { once: true })
                  img.addEventListener('error', () => resolve(), { once: true })
                }),
            ),
          ),
          new Promise((resolve) => window.setTimeout(resolve, 3000)),
        ])
      }
    }
    // 等待期间用户已经开始滚动则不打扰
    if (window.scrollY > 10) return
    window.scrollTo({ top: saved })
  })()
}

/** 点正文图片全屏预览，从被点的图开始。 */
function onContentClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.tagName !== 'IMG') return
  const images = Array.from(contentRef.value?.querySelectorAll('img') || [])
    .map((img) => img.getAttribute('src'))
    .filter((src): src is string => Boolean(src))
  if (!images.length) return
  const index = images.indexOf(target.getAttribute('src') || '')
  void showImagePreview({ images, startPosition: Math.max(0, index), closeable: true })
}

function backToLibrary() {
  const back = router.options.history.state.back
  if (typeof back === 'string') router.back()
  else router.replace('/library')
}

async function loadDocument(options: { silent?: boolean } = {}) {
  if (!options.silent) loading.value = true
  loadError.value = ''
  try {
    const loaded = await client.documents.get(String(route.params.id))
    document.value = loaded
    await markAsReadIfNeeded(loaded)
    if (loaded.ingestStatus === 'succeeded') {
      await loadAnnotations({ silent: true })
    }
    await nextTick()
    refreshToc(contentRef.value, isIngestSucceeded.value)
  } catch (error) {
    loadError.value = error instanceof LumiApiError ? error.message : '文章加载失败'
  } finally {
    if (!options.silent) loading.value = false
  }
}

async function markAsReadIfNeeded(current: DocumentDetail) {
  if (current.ingestStatus !== 'succeeded' || current.deletedAt || current.readingStatus !== 'unread') {
    return
  }
  try {
    document.value = await client.documents.updateReadingStatus(current.id, { readingStatus: 'read' })
  } catch {
    // 打开文章不应因已读标记失败而中断。
  }
}

async function loadAnnotations(options: { silent?: boolean } = {}) {
  if (!document.value || document.value.ingestStatus !== 'succeeded') return
  if (!options.silent) annotationsLoading.value = true
  try {
    annotations.value = await client.documents.listAnnotations(document.value.id)
  } catch {
    // 批注加载失败不阻塞阅读，列表内再提示。
  } finally {
    if (!options.silent) annotationsLoading.value = false
  }
}

async function retryIngest() {
  if (!document.value) return
  retryingIngest.value = true
  try {
    document.value = { ...document.value, ingestStatus: 'pending' }
    await client.documents.retryIngest(document.value.id)
    showToast('已重新加入解析队列')
  } catch (error) {
    showToast(error instanceof LumiApiError ? error.message : '重试失败')
  } finally {
    retryingIngest.value = false
  }
}

async function askAi() {
  if (!document.value) return
  const question = aiQuestion.value.trim()
  if (!question) return

  const exchange = reactive<ReaderAiExchange>({
    question,
    answer: '',
    streaming: true,
    failed: false,
  })
  aiExchange.value = exchange
  aiQuestion.value = ''

  try {
    await client.documents.streamAiConversation(document.value.id, { question }, (chunk) => {
      exchange.answer += chunk
    })
    exchange.streaming = false
  } catch (error) {
    exchange.streaming = false
    exchange.failed = true
    showToast(error instanceof LumiApiError ? error.message : 'AI 问答失败')
  }
}

function scrollToAnnotation(id: string) {
  annotationsOpen.value = false
  const element = globalThis.document.querySelector(`[data-annotation-id="${id}"]`)
  if (!element) return
  element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  element.classList.remove('is-flashing')
  // 强制重排，让连续点击同一标记时动画能重新播放。
  void (element as HTMLElement).offsetWidth
  element.classList.add('is-flashing')
  window.setTimeout(() => element.classList.remove('is-flashing'), 1300)
}

/** 创建批注；note 为空即纯高亮。草稿可能来自划词（高亮）或弹层快照（写批注）。 */
async function createAnnotation(draft: SelectionDraft | null, note: string | null) {
  const current = document.value
  if (!current || !draft) return
  annotationActionLoading.value = true
  try {
    const annotation = await client.documents.createAnnotation(current.id, {
      ...draft,
      note,
    })
    annotations.value = [...annotations.value, annotation]
    noteSheetOpen.value = false
    clearSelection()
    showToast(note ? '批注已添加' : '高亮已添加')
  } catch (error) {
    showToast(error instanceof LumiApiError ? error.message : '高亮保存失败')
  } finally {
    annotationActionLoading.value = false
  }
}

function onToolbarHighlight() {
  void createAnnotation(selectionDraft.value, null)
}

function onToolbarNote() {
  const draft = selectionDraft.value
  if (!draft) return
  // 草稿快照给弹层保存用，正文选区随后会因输入框聚焦而收起
  pendingNoteDraft.value = draft
  selectionToolbar.value = { ...selectionToolbar.value, visible: false }
  editingAnnotation.value = null
  noteSheetNote.value = ''
  noteSheetOpen.value = true
}

function onEditNote(annotation: AnnotationDto) {
  editingAnnotation.value = annotation
  noteSheetNote.value = annotation.note || ''
  noteSheetOpen.value = true
}
async function onSaveNote(note: string) {
  const editing = editingAnnotation.value
  const current = document.value
  if (editing && current) {
    annotationActionLoading.value = true
    try {
      const updated = await client.documents.updateAnnotation(current.id, editing.id, {
        note: note || null,
      })
      annotations.value = annotations.value.map((item) =>
        item.id === updated.id ? updated : item,
      )
      noteSheetOpen.value = false
      showToast(note ? '批注已更新' : '已改为纯高亮')
    } catch (error) {
      showToast(error instanceof LumiApiError ? error.message : '批注保存失败')
    } finally {
      annotationActionLoading.value = false
    }
    return
  }
  const draft = pendingNoteDraft.value
  pendingNoteDraft.value = null
  await createAnnotation(draft, note || null)
}

async function onRequestDeleteAnnotation(annotation: AnnotationDto) {
  const preview = annotation.selectedText.slice(0, 20)
  try {
    await showConfirmDialog({
      title: '删除批注',
      message: `确认删除该批注吗？高亮「${preview}」会一并移除，且不可恢复。`,
    })
  } catch {
    return
  }
  const current = document.value
  if (!current) return
  annotationActionLoading.value = true
  try {
    await client.documents.deleteAnnotation(current.id, annotation.id)
    annotations.value = annotations.value.filter((item) => item.id !== annotation.id)
    showToast('高亮已删除')
  } catch (error) {
    showToast(error instanceof LumiApiError ? error.message : '删除高亮失败')
  } finally {
    annotationActionLoading.value = false
  }
}

function onTocNavigate(id: string) {
  tocOpen.value = false
  scrollToHeading(id)
}

function onFontSelect(action: { text: string; value: string }) {
  fontSize.value = Number(action.value)
  localStorage.setItem(FONT_SIZE_KEY, action.value)
}

async function onMoreSelect(action: { text: string; value: string }) {
  moreActionsOpen.value = false
  const current = document.value
  if (!current) return

  if (action.value === 'open') {
    if (current.url) window.open(current.url, '_blank', 'noopener')
    return
  }

  if (action.value === 'favorite') {
    try {
      const updated = await client.documents.updateFavorite(current.id, {
        favorite: !current.favoritedAt,
      })
      document.value = updated
      showToast(updated.favoritedAt ? '已收藏' : '已取消收藏')
    } catch (error) {
      showToast(error instanceof LumiApiError ? error.message : '收藏操作失败')
    }
    return
  }

  if (action.value === 'delete') {
    try {
      await showConfirmDialog({
        title: '删除文章',
        message: `确认删除《${current.title}》吗？文章会进入回收站。`,
      })
    } catch {
      return
    }
    try {
      await client.documents.delete(current.id)
      showToast('已移入回收站')
      router.replace('/library')
    } catch (error) {
      showToast(error instanceof LumiApiError ? error.message : '删除失败')
    }
  }
}
</script>

<template>
  <div class="reader-page">
    <van-nav-bar
      fixed
      placeholder
      left-arrow
      :title="document?.title || '阅读'"
      class="reader-navbar"
      @click-left="backToLibrary"
    >
      <template #right>
        <van-popover
          v-model:show="moreActionsOpen"
          placement="bottom-end"
          :actions="moreActions"
          @select="onMoreSelect"
        >
          <template #reference>
            <van-icon name="ellipsis" size="18" />
          </template>
        </van-popover>
      </template>
    </van-nav-bar>

    <div class="reader-body">
      <div v-if="loading" class="reader-state">
        <van-loading vertical>加载中...</van-loading>
      </div>

      <div v-else-if="loadError" class="reader-state">
        <van-empty image="error" :description="loadError">
          <van-button size="small" round @click="loadDocument()">重试</van-button>
        </van-empty>
      </div>

      <div v-else-if="isIngestPending" class="reader-state">
        <van-loading vertical>正在解析文章，完成后自动刷新...</van-loading>
      </div>

      <div v-else-if="isIngestFailed" class="reader-state">
        <van-empty
          image="error"
          :description="document?.ingestErrorMessage || '文章解析失败，可稍后重试。'"
        >
          <van-button size="small" round :loading="retryingIngest" @click="retryIngest">
            重新解析
          </van-button>
        </van-empty>
      </div>

      <template v-else>
        <AiAnalysisCard v-if="aiAnalysis" :key="document?.id" :analysis="aiAnalysis" />
        <article
          ref="contentRef"
          class="reader-content"
          :style="{ '--reader-font-size': `${fontSize}px` }"
          v-html="renderedHtml"
          @click="onContentClick"
        ></article>
      </template>
    </div>

    <nav v-if="isIngestSucceeded" class="reader-toolbar safe-area-bottom">
      <button class="toolbar-btn" type="button" @click="tocOpen = Boolean(tocItems.length)">
        <van-icon name="bars" />
        <span>目录</span>
      </button>
      <van-popover
        v-model:show="fontPopoverOpen"
        placement="top"
        :actions="FONT_OPTIONS.map((option) => ({ ...option, value: option.value }))"
        @select="onFontSelect"
      >
        <template #reference>
          <button class="toolbar-btn" type="button">
            <span class="toolbar-aa">Aa</span>
            <span>字号</span>
          </button>
        </template>
      </van-popover>
      <button class="toolbar-btn" type="button" @click="aiOpen = true">
        <van-icon name="chat-o" />
        <span>问 AI</span>
      </button>
      <button class="toolbar-btn" type="button" @click="annotationsOpen = true">
        <van-badge :content="annotations.length ? String(annotations.length) : ''">
          <van-icon name="edit" />
        </van-badge>
        <span>批注</span>
      </button>
    </nav>

    <TocSheet
      v-model:open="tocOpen"
      :items="tocItems"
      :active-id="activeTocId"
      @navigate="onTocNavigate"
    />
    <AnnotationListSheet
      v-model:open="annotationsOpen"
      :annotations="annotations"
      :loading="annotationsLoading"
      @locate="scrollToAnnotation"
      @request-edit="onEditNote"
      @request-delete="onRequestDeleteAnnotation"
    />
    <ReaderAiSheet
      v-model:open="aiOpen"
      v-model:question="aiQuestion"
      :ingest-succeeded="isIngestSucceeded"
      :exchange="aiExchange"
      @ask="askAi"
    />

    <SelectionToolbar
      :state="selectionToolbar"
      @highlight="onToolbarHighlight"
      @note="onToolbarNote"
    />
    <AnnotationNoteSheet
      v-model:open="noteSheetOpen"
      :note="noteSheetNote"
      :editing="Boolean(editingAnnotation)"
      @save="onSaveNote"
    />
  </div>
</template>

<style scoped>
.reader-page {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  background: var(--lumi-bg-primary);
}

.reader-navbar {
  --van-nav-bar-title-font-size: 15px;
}

.reader-body {
  flex: 1;
  min-height: 0;
}

.reader-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
}

.reader-content {
  min-height: 50vh;
}

.reader-toolbar {
  position: fixed;
  z-index: 20;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: stretch;
  border-top: 1px solid var(--lumi-border-muted);
  background: var(--lumi-bg-primary);
}

.toolbar-btn {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: var(--lumi-fg-secondary);
  font-size: 11px;
}

.toolbar-btn .van-icon {
  font-size: 18px;
}

/* popover 会在 reference 外包一层 wrapper span，需同样参与 flex 分栏 */
.reader-toolbar :deep(.van-popover__wrapper) {
  display: flex;
  flex: 1;
}

/* Aa 文字充当图标位，与 van-icon 的 18px 高度对齐 */
.toolbar-aa {
  color: var(--lumi-fg-secondary);
  font-size: 15px;
  font-weight: 600;
  line-height: 18px;
}

.toolbar-btn .van-badge {
  font-weight: 400;
}

.reader-page:has(.reader-toolbar) .reader-content {
  padding-bottom: 96px;
}
</style>
