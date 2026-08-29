<script setup lang="ts">
import DOMPurify from 'dompurify'
import { computed, nextTick, ref, watch } from 'vue'
import { MessageSquare, PencilLine, RefreshCw, Trash2, X } from 'lucide-vue-next'
import type {
  AiAnalysisDto,
  AnnotationDto,
} from '@lumi/shared'
import UiBadge from '../ui/Badge.vue'
import UiButton from '../ui/Button.vue'
import UiInput from '../ui/Input.vue'
import UiTabs from '../ui/Tabs.vue'
import { useMarkdownRenderer } from '../../composables/useMarkdownRenderer'

type DrawerTab = 'ai' | 'annotations'

type AiExchange = {
  question: string
  answer: string
  streaming: boolean
  failed: boolean
}

const props = defineProps<{
  open: boolean
  tab: DrawerTab
  ingestSucceeded: boolean
  isTrash: boolean
  canEditAnnotations: boolean
  aiAnalysis: AiAnalysisDto | null
  aiStatusLabel: string
  aiActionLoading: boolean
  aiExchange: AiExchange | null
  aiQuestion: string
  annotations: AnnotationDto[]
  annotationsLoading: boolean
  annotationActionLoading: string
  activeAnnotationId: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:tab': [value: DrawerTab]
  'update:aiQuestion': [value: string]
  retryAiAnalysis: []
  askAi: []
  editAnnotation: [annotation: AnnotationDto]
  deleteAnnotation: [annotation: AnnotationDto]
  scrollToAnnotation: [id: string]
}>()

const drawerTabs = [
  { value: 'ai', label: 'AI' },
  { value: 'annotations', label: '批注' },
]

const sortedAnnotations = computed(() =>
  [...props.annotations].sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  }),
)

// 与知识库问答同一套渲染管线：html 关闭 + DOMPurify 双保险。
const { render: renderAnswerRaw } = useMarkdownRenderer({ html: false })
const renderedAnswer = computed(() => {
  const answer = props.aiExchange?.answer
  return answer ? DOMPurify.sanitize(renderAnswerRaw(answer)) : ''
})

// 问答区自动滚动：提问即到底，流式期间跟随底部；用户上滑超过阈值则暂停跟随。
const aiBodyRef = ref<HTMLElement | null>(null)
const pinnedToBottom = ref(true)

function handleBodyScroll() {
  const el = aiBodyRef.value
  if (!el) return
  pinnedToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

function scrollChatToBottom() {
  const el = aiBodyRef.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  () => props.aiExchange?.question,
  async (question) => {
    if (!question) return
    pinnedToBottom.value = true
    await nextTick()
    scrollChatToBottom()
  },
)

watch(
  () => props.aiExchange?.answer,
  async () => {
    if (!props.aiExchange?.streaming || !pinnedToBottom.value) return
    await nextTick()
    scrollChatToBottom()
  },
)

watch([() => props.open, () => props.tab], async ([open, tab]) => {
  if (open && tab === 'ai' && props.aiExchange) {
    await nextTick()
    scrollChatToBottom()
  }
})

function aiList(items?: string[] | null) {
  return items?.filter(Boolean) || []
}
</script>

<template>
  <aside class="ai-drawer" :class="{ open }">
    <header class="ai-drawer-header">
      <div>
        <p class="kicker">Lumi</p>
        <h2>辅助阅读</h2>
      </div>
      <UiButton variant="ghost" size="icon" title="关闭辅助区" @click="emit('update:open', false)">
        <X :size="16" />
      </UiButton>
    </header>

    <div class="drawer-tabs">
      <UiTabs
        :model-value="tab"
        :items="drawerTabs"
        @update:model-value="(value) => emit('update:tab', value as DrawerTab)"
      />
    </div>

    <div
      v-if="tab === 'ai'"
      ref="aiBodyRef"
      class="ai-drawer-body"
      @scroll.passive="handleBodyScroll"
    >
      <section class="ai-section">
        <div class="ai-section-header">
          <h3>分析状态</h3>
          <UiBadge variant="neutral">{{ aiStatusLabel }}</UiBadge>
        </div>
        <p v-if="!ingestSucceeded" class="ai-muted">
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
          v-if="ingestSucceeded && (!aiAnalysis || aiAnalysis.status === 'failed')"
          variant="secondary"
          size="sm"
          :disabled="aiActionLoading"
          @click="emit('retryAiAnalysis')"
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

        <p v-if="!ingestSucceeded" class="ai-muted">文章解析完成后即可提问。</p>
        <p v-else-if="!aiExchange" class="ai-muted">
          输入问题，AI 会基于文章内容即时回答；问答仅保留当前一轮，不会保存历史。
        </p>
        <div v-else class="ai-chat-item">
          <h4>{{ aiExchange.question }}</h4>
          <div
            v-if="aiExchange.answer"
            class="ai-answer-markdown markdown-reader"
            v-html="renderedAnswer"
          ></div>
          <p v-else class="ai-answer">{{ aiExchange.streaming ? '正在生成...' : '暂无回答' }}</p>
          <p v-if="aiExchange.failed" class="ai-muted">回答生成失败，可以重新提问。</p>
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
        <article
          v-for="item in sortedAnnotations"
          v-else
          :key="item.id"
          class="annotation-item"
          :class="{ 'is-active': item.id === activeAnnotationId }"
          :data-annotation-item="item.id"
        >
          <button class="annotation-text" type="button" @click="emit('scrollToAnnotation', item.id)">
            {{ item.selectedText }}
          </button>
          <p v-if="item.note" class="annotation-note">{{ item.note }}</p>
          <p v-else class="annotation-note muted">未添加批注</p>
          <div v-if="canEditAnnotations" class="annotation-actions">
            <UiButton
              variant="ghost"
              size="sm"
              :disabled="Boolean(annotationActionLoading)"
              @click="emit('editAnnotation', item)"
            >
              <PencilLine :size="13" />
              编辑
            </UiButton>
            <UiButton
              variant="ghost"
              size="sm"
              :disabled="Boolean(annotationActionLoading)"
              @click="emit('deleteAnnotation', item)"
            >
              <Trash2 :size="13" />
              删除
            </UiButton>
          </div>
        </article>
      </section>
    </div>

    <form v-if="tab === 'ai'" class="ai-question-form" @submit.prevent="emit('askAi')">
      <UiInput
        :model-value="aiQuestion"
        :disabled="!ingestSucceeded || Boolean(aiExchange?.streaming)"
        placeholder="围绕当前文章提问..."
        @update:model-value="(value) => emit('update:aiQuestion', value)"
      />
      <UiButton
        type="submit"
        size="icon"
        :disabled="!ingestSucceeded || !aiQuestion.trim() || Boolean(aiExchange?.streaming)"
      >
        <MessageSquare :size="15" />
      </UiButton>
    </form>
  </aside>
</template>
