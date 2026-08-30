<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import type { AnnotationDto, DocumentDetail } from '@lumi/shared'
import { showConfirmDialog, showToast } from 'vant'
import AnnotationListSheet from '../components/AnnotationListSheet.vue'
import ReaderAiSheet from '../components/ReaderAiSheet.vue'
import type { ReaderAiExchange } from '../lib/ai-exchange'
import TocSheet from '../components/TocSheet.vue'
import { useMarkdownRenderer } from '../composables/useMarkdownRenderer'
import { useRuntimeToc } from '../composables/useRuntimeToc'
import { applyReaderHighlights } from '../lib/highlight-dom'
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

let pollingTimer: number | undefined

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
  initShiki()
  await loadDocument()
  pollingTimer = window.setInterval(() => {
    if (isIngestPending.value && !loading.value) void loadDocument({ silent: true })
  }, 4000)
})

onBeforeUnmount(() => {
  if (pollingTimer) window.clearInterval(pollingTimer)
})

// loading 置回 false 后正文容器才挂载，需一并监听再刷新目录。
watch([renderedHtml, loading], async () => {
  await nextTick()
  refreshToc(contentRef.value, isIngestSucceeded.value)
})

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

      <article
        v-else
        ref="contentRef"
        class="reader-content"
        :style="{ '--reader-font-size': `${fontSize}px` }"
        v-html="renderedHtml"
      ></article>
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
    />
    <ReaderAiSheet
      v-model:open="aiOpen"
      v-model:question="aiQuestion"
      :ingest-succeeded="isIngestSucceeded"
      :exchange="aiExchange"
      @ask="askAi"
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
