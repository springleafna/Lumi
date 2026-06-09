<script setup lang="ts">
import DOMPurify from 'dompurify'
import {
  Bot,
  ExternalLink,
  FileText,
  LoaderCircle,
  MessageSquare,
  PencilLine,
  Plus,
  RefreshCw,
  Settings,
  Square,
  Trash2,
} from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LumiApiError, type LumiSseEvent } from '@lumi/api-client'
import type {
  KnowledgeChatCitationDto,
  KnowledgeChatMessageDto,
  KnowledgeChatSessionDto,
} from '@lumi/shared'
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import UiCard from '../components/ui/Card.vue'
import UiEmptyState from '../components/ui/EmptyState.vue'
import UiInput from '../components/ui/Input.vue'
import { useToast } from '../composables/useToast'
import lumiLogo from '../assets/lumi-logo.svg'
import { client } from '../lib/client'

const router = useRouter()
const { toast } = useToast()
const answerMarkdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

const sessions = ref<KnowledgeChatSessionDto[]>([])
const activeSession = ref<KnowledgeChatSessionDto | null>(null)
const sessionsLoading = ref(false)
const sessionLoading = ref(false)
const actionLoading = ref('')
const question = ref('')
const streaming = ref(false)
const streamingMessageId = ref('')
const errorMessage = ref('')
const chatPanelRef = ref<HTMLElement | null>(null)
let abortController: AbortController | null = null
let abortedByUser = false
let scrollFrame: number | undefined

const messages = computed(() => activeSession.value?.messages || [])
const hasSessions = computed(() => sessions.value.length > 0)

onMounted(async () => {
  await loadSessions()
})

onBeforeUnmount(() => {
  abortController?.abort()
  if (scrollFrame !== undefined) {
    window.cancelAnimationFrame(scrollFrame)
  }
})

async function loadSessions(options: { silent?: boolean; selectFirst?: boolean } = {}) {
  if (!options.silent) sessionsLoading.value = true
  try {
    sessions.value = await client.knowledgeChat.listSessions()
    const activeId = activeSession.value?.id
    if (activeId) {
      const latest = sessions.value.find((item) => item.id === activeId)
      if (latest && activeSession.value) {
        activeSession.value = {
          ...activeSession.value,
          title: latest.title,
          updatedAt: latest.updatedAt,
        }
      }
    } else if (options.selectFirst !== false && sessions.value[0]) {
      await loadSession(sessions.value[0].id, { silent: true })
    }
  } catch (error) {
    notifyError(error, '会话列表加载失败')
  } finally {
    if (!options.silent) sessionsLoading.value = false
  }
}

async function loadSession(id: string, options: { silent?: boolean } = {}) {
  if (!options.silent) sessionLoading.value = true
  errorMessage.value = ''
  try {
    activeSession.value = await client.knowledgeChat.getSession(id)
    scheduleScrollToBottom('auto')
  } catch (error) {
    notifyError(error, '会话加载失败')
  } finally {
    if (!options.silent) sessionLoading.value = false
  }
}

function startNewSession() {
  if (streaming.value) return
  activeSession.value = null
  question.value = ''
  errorMessage.value = ''
}

async function submitQuestion() {
  const text = question.value.trim()
  if (!text || streaming.value) return

  const submittedQuestion = text
  question.value = ''
  errorMessage.value = ''
  streaming.value = true
  abortedByUser = false
  abortController = new AbortController()
  scheduleScrollToBottom()

  try {
    if (activeSession.value?.id) {
      await client.knowledgeChat.askInSession(
        activeSession.value.id,
        { question: submittedQuestion },
        handleSseEvent,
        abortController.signal,
      )
    } else {
      await client.knowledgeChat.askNewSession(
        { question: submittedQuestion },
        handleSseEvent,
        abortController.signal,
      )
    }
  } catch (error) {
    if (!abortedByUser) {
      question.value = submittedQuestion
      markStreamingMessageFailed(getErrorMessage(error, '知识库问答失败'))
      notifyError(error, '知识库问答失败')
    }
  } finally {
    const sessionId = activeSession.value?.id
    streaming.value = false
    streamingMessageId.value = ''
    abortController = null
    if (sessionId) {
      window.setTimeout(() => {
        void reloadActiveSession(sessionId)
      }, abortedByUser ? 500 : 0)
    }
  }
}

async function regenerateMessage(message: KnowledgeChatMessageDto) {
  if (streaming.value || !['failed', 'aborted'].includes(message.status)) return

  errorMessage.value = ''
  streaming.value = true
  streamingMessageId.value = message.id
  abortedByUser = false
  abortController = new AbortController()
  updateMessage(message.id, {
    answer: '',
    status: 'processing',
    errorMessage: null,
    citations: [],
  })

  try {
    await client.knowledgeChat.regenerate(message.id, handleSseEvent, abortController.signal)
  } catch (error) {
    if (!abortedByUser) {
      markStreamingMessageFailed(getErrorMessage(error, '重新生成失败'))
      notifyError(error, '重新生成失败')
    }
  } finally {
    const sessionId = activeSession.value?.id
    streaming.value = false
    streamingMessageId.value = ''
    abortController = null
    if (sessionId) {
      window.setTimeout(() => {
        void reloadActiveSession(sessionId)
      }, abortedByUser ? 500 : 0)
    }
  }
}

function stopStreaming() {
  if (!streaming.value || !abortController) return
  abortedByUser = true
  abortController.abort()
  if (streamingMessageId.value) {
    updateMessage(streamingMessageId.value, { status: 'aborted' })
  }
}

async function renameActiveSession() {
  if (!activeSession.value || streaming.value) return
  const title = window.prompt('会话标题', activeSession.value.title)?.trim()
  if (!title || title === activeSession.value.title) return

  await runAction('rename', '会话重命名失败', async () => {
    const updated = await client.knowledgeChat.updateSession(activeSession.value!.id, { title })
    activeSession.value = {
      ...activeSession.value!,
      title: updated.title,
      updatedAt: updated.updatedAt,
    }
    sessions.value = sessions.value.map((item) =>
      item.id === updated.id ? { ...item, title: updated.title, updatedAt: updated.updatedAt } : item,
    )
    toast({ title: '会话标题已更新', variant: 'success' })
  })
}

async function deleteActiveSession() {
  if (!activeSession.value || streaming.value) return
  if (!window.confirm(`确认删除「${activeSession.value.title}」吗？`)) return

  await runAction('delete', '会话删除失败', async () => {
    const deletedId = activeSession.value!.id
    await client.knowledgeChat.deleteSession(deletedId)
    sessions.value = sessions.value.filter((item) => item.id !== deletedId)
    activeSession.value = null
    if (sessions.value[0]) {
      await loadSession(sessions.value[0].id, { silent: true })
    }
    toast({ title: '会话已删除', variant: 'success' })
  })
}

async function reloadActiveSession(sessionId: string) {
  await Promise.all([loadSession(sessionId, { silent: true }), loadSessions({ silent: true })])
}

async function runAction(name: string, fallback: string, action: () => Promise<void>) {
  actionLoading.value = name
  try {
    await action()
  } catch (error) {
    notifyError(error, fallback)
  } finally {
    actionLoading.value = ''
  }
}

function handleSseEvent(event: LumiSseEvent) {
  if (event.event === 'session_created') {
    const session = event.data as KnowledgeChatSessionDto
    activeSession.value = { ...session, messages: [] }
    sessions.value = [session, ...sessions.value.filter((item) => item.id !== session.id)]
    return
  }

  if (event.event === 'message_created') {
    const payload = asRecord(event.data)
    const id = typeof payload.id === 'string' ? payload.id : `draft-${Date.now()}`
    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : activeSession.value?.id
    const text = typeof payload.question === 'string' ? payload.question : ''
    streamingMessageId.value = id
    if (sessionId && activeSession.value?.id !== sessionId) {
      activeSession.value = {
        id: sessionId,
        title: '新的问答',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      }
    }
    upsertMessage({
      id,
      question: text,
      answer: '',
      status: 'processing',
      citations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    scheduleScrollToBottom()
    return
  }

  if (event.event === 'answer_delta') {
    const payload = asRecord(event.data)
    appendAnswer(typeof payload.text === 'string' ? payload.text : '')
    scheduleScrollToBottom('auto')
    return
  }

  if (event.event === 'citations') {
    const citations = Array.isArray(event.data)
      ? (event.data as KnowledgeChatCitationDto[])
      : []
    if (streamingMessageId.value) {
      updateMessage(streamingMessageId.value, { citations })
      scheduleScrollToBottom('auto')
    }
    return
  }

  if (event.event === 'title_updated') {
    const payload = asRecord(event.data)
    const title = typeof payload.title === 'string' ? payload.title : ''
    if (title && activeSession.value) {
      activeSession.value = { ...activeSession.value, title }
      sessions.value = sessions.value.map((item) =>
        item.id === activeSession.value?.id ? { ...item, title } : item,
      )
    }
    return
  }

  if (event.event === 'done' || event.event === 'aborted') {
    if (streamingMessageId.value) {
      updateMessage(streamingMessageId.value, {
        status: event.event === 'done' ? 'succeeded' : 'aborted',
      })
      scheduleScrollToBottom('auto')
    }
    return
  }

  if (event.event === 'error') {
    const payload = asRecord(event.data)
    const message = typeof payload.message === 'string' ? payload.message : '知识库问答失败'
    markStreamingMessageFailed(message)
    errorMessage.value = message
    scheduleScrollToBottom()
  }
}

function scheduleScrollToBottom(behavior: ScrollBehavior = 'smooth') {
  if (scrollFrame !== undefined) {
    window.cancelAnimationFrame(scrollFrame)
  }

  void nextTick(() => {
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = undefined
      const panel = chatPanelRef.value
      if (!panel) return
      panel.scrollTo({ top: panel.scrollHeight, behavior })
    })
  })
}

function upsertMessage(message: Partial<KnowledgeChatMessageDto> & { id: string; question: string }) {
  const now = new Date().toISOString()
  const next: KnowledgeChatMessageDto = {
    id: message.id,
    question: message.question,
    answer: message.answer ?? null,
    status: message.status || 'processing',
    provider: message.provider ?? null,
    model: message.model ?? null,
    errorMessage: message.errorMessage ?? null,
    citations: message.citations || [],
    createdAt: message.createdAt || now,
    updatedAt: message.updatedAt || now,
    finishedAt: message.finishedAt ?? null,
  }
  const current = activeSession.value
  if (!current) return
  const existing = current.messages || []
  const index = existing.findIndex((item) => item.id === next.id)
  const messages =
    index >= 0
      ? existing.map((item) => (item.id === next.id ? { ...item, ...next } : item))
      : [...existing, next]
  activeSession.value = { ...current, messages }
}

function updateMessage(id: string, patch: Partial<KnowledgeChatMessageDto>) {
  const current = activeSession.value
  if (!current) return
  activeSession.value = {
    ...current,
    messages: (current.messages || []).map((item) =>
      item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
    ),
  }
}

function appendAnswer(text: string) {
  if (!text || !streamingMessageId.value) return
  const current = activeSession.value
  if (!current) return
  activeSession.value = {
    ...current,
    messages: (current.messages || []).map((item) =>
      item.id === streamingMessageId.value
        ? { ...item, answer: `${item.answer || ''}${text}`, status: 'processing' }
        : item,
    ),
  }
}

function markStreamingMessageFailed(message: string) {
  if (!streamingMessageId.value) return
  updateMessage(streamingMessageId.value, {
    status: 'failed',
    errorMessage: message,
  })
}

function canOpenCitation(citation: KnowledgeChatCitationDto) {
  return Boolean(citation.documentId && !citation.sourceDeleted)
}

function openCitation(citation: KnowledgeChatCitationDto) {
  if (!canOpenCitation(citation) || !citation.documentId) return
  const query: Record<string, string> = {}
  if (typeof citation.startOffset === 'number' && typeof citation.endOffset === 'number') {
    query.citationStart = String(citation.startOffset)
    query.citationEnd = String(citation.endOffset)
  }
  router.push({ path: `/documents/${citation.documentId}`, query })
}

function messageStatusLabel(status: KnowledgeChatMessageDto['status']) {
  if (status === 'processing') return '生成中'
  if (status === 'failed') return '失败'
  if (status === 'aborted') return '已停止'
  return '已完成'
}

function renderAnswerMarkdown(answer?: string | null) {
  if (!answer) return ''
  return DOMPurify.sanitize(answerMarkdown.render(answer))
}

function formatDate(value?: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function notifyError(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback)
  errorMessage.value = message
  toast({ title: fallback, description: message, variant: 'destructive' })
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof LumiApiError) {
    return normalizeApiErrorMessage(error.message) || fallback
  }
  if (error instanceof Error) return error.message || fallback
  return fallback
}

function normalizeApiErrorMessage(value: string) {
  const raw = value.trim()
  if (!raw.startsWith('{')) return raw
  try {
    const parsed = JSON.parse(raw) as { message?: unknown }
    if (Array.isArray(parsed.message)) return parsed.message.join('；')
    return typeof parsed.message === 'string' ? parsed.message : raw
  } catch {
    return raw
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
</script>

<template>
  <main class="app-shell">
    <aside class="sidebar knowledge-sidebar">
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
          <button class="sidebar-link" type="button" @click="router.push('/documents')">
            <FileText class="sidebar-link-icon" />
            <span>文章库</span>
          </button>
          <button class="sidebar-link active" type="button">
            <Bot class="sidebar-link-icon" />
            <span>知识库问答</span>
          </button>
          <button class="sidebar-link" type="button" @click="router.push('/settings')">
            <Settings class="sidebar-link-icon" />
            <span>设置</span>
          </button>
        </nav>
      </section>

      <section class="sidebar-section knowledge-session-section">
        <div class="sidebar-title">会话</div>
        <div class="knowledge-session-actions">
          <UiButton variant="secondary" size="sm" :disabled="streaming" @click="startNewSession">
            <Plus :size="14" />
            新会话
          </UiButton>
          <UiButton variant="ghost" size="sm" :disabled="sessionsLoading" @click="loadSessions">
            <RefreshCw :size="14" />
            刷新
          </UiButton>
        </div>
        <div v-if="sessionsLoading" class="knowledge-session-loading">
          <LoaderCircle :size="15" />
          加载中...
        </div>
        <nav v-else-if="hasSessions" class="knowledge-session-list">
          <button
            v-for="session in sessions"
            :key="session.id"
            class="knowledge-session-button"
            :class="{ active: activeSession?.id === session.id }"
            type="button"
            @click="loadSession(session.id)"
          >
            <span>{{ session.title }}</span>
            <small>{{ formatDate(session.updatedAt) }}</small>
          </button>
        </nav>
        <p v-else class="sidebar-empty">暂无会话</p>
      </section>
    </aside>

    <div class="main">
      <header class="header">
        <div>
          <h1 class="page-title">知识库问答</h1>
        </div>
        <div class="header-spacer"></div>
        <div class="header-actions">
          <UiButton variant="secondary" :disabled="streaming" @click="startNewSession">
            <Plus :size="15" />
            新会话
          </UiButton>
          <UiButton variant="secondary" @click="router.push('/settings')">
            <Settings :size="15" />
            设置
          </UiButton>
        </div>
      </header>

      <main class="content knowledge-content">
        <section ref="chatPanelRef" class="knowledge-chat-panel">
          <div v-if="activeSession" class="knowledge-chat-titlebar">
            <div>
              <h2>{{ activeSession.title }}</h2>
              <p>{{ formatDate(activeSession.updatedAt) }}</p>
            </div>
            <div class="knowledge-title-actions">
              <UiButton
                variant="ghost"
                size="icon"
                :disabled="streaming || Boolean(actionLoading)"
                title="重命名"
                @click="renameActiveSession"
              >
                <PencilLine :size="15" />
              </UiButton>
              <UiButton
                variant="ghost"
                size="icon"
                :disabled="streaming || Boolean(actionLoading)"
                title="删除会话"
                @click="deleteActiveSession"
              >
                <Trash2 :size="15" />
              </UiButton>
            </div>
          </div>

          <p v-if="errorMessage" class="inline-alert">{{ errorMessage }}</p>

          <UiCard v-if="sessionLoading" class="knowledge-loading-card loading-card">
            <span class="loading-line"></span>
            <span class="loading-line short"></span>
            <span class="loading-line soft"></span>
          </UiCard>

          <UiEmptyState
            v-else-if="messages.length === 0"
            title="开始一次知识库问答"
            description="回答会基于已完成索引的文章与摘录生成。"
          >
            <template #icon>
              <MessageSquare :size="28" />
            </template>
            <template #actions>
              <UiButton variant="secondary" @click="router.push('/settings')">
                <Settings :size="15" />
                检查 AI 设置
              </UiButton>
            </template>
          </UiEmptyState>

          <div v-else class="knowledge-message-list">
            <article v-for="message in messages" :key="message.id" class="knowledge-message">
              <div class="knowledge-question">
                <span>你</span>
                <p>{{ message.question }}</p>
              </div>

              <div class="knowledge-answer">
                <div class="knowledge-answer-header">
                  <div>
                    <Bot :size="16" />
                    <span>Lumi</span>
                  </div>
                  <UiBadge :variant="message.status === 'failed' ? 'destructive' : 'neutral'">
                    {{ messageStatusLabel(message.status) }}
                  </UiBadge>
                </div>
                <div
                  v-if="message.answer"
                  class="knowledge-answer-markdown markdown-reader"
                  v-html="renderAnswerMarkdown(message.answer)"
                ></div>
                <p v-else class="knowledge-answer-text">
                  {{ message.answer || (message.status === 'processing' ? '正在生成...' : '暂无回答') }}
                </p>
                <p v-if="message.errorMessage" class="settings-error">
                  {{ message.errorMessage }}
                </p>

                <div v-if="message.citations.length" class="knowledge-citation-list">
                  <button
                    v-for="citation in message.citations"
                    :key="citation.id"
                    class="knowledge-citation-card"
                    :disabled="!canOpenCitation(citation)"
                    type="button"
                    @click="openCitation(citation)"
                  >
                    <span class="knowledge-citation-title">
                      [{{ citation.index }}] {{ citation.documentTitle }}
                      <ExternalLink v-if="canOpenCitation(citation)" :size="13" />
                    </span>
                    <span class="knowledge-citation-meta">
                      {{ citation.documentSource || '本地' }}
                      <span v-if="citation.sourceDeleted"> · 来源已删除</span>
                    </span>
                    <span class="knowledge-citation-excerpt">{{ citation.excerpt }}</span>
                  </button>
                </div>

                <div v-if="['failed', 'aborted'].includes(message.status)" class="knowledge-message-actions">
                  <UiButton
                    variant="secondary"
                    size="sm"
                    :disabled="streaming"
                    @click="regenerateMessage(message)"
                  >
                    <RefreshCw :size="14" />
                    重新生成
                  </UiButton>
                </div>
              </div>
            </article>
          </div>
        </section>

        <form class="knowledge-question-form" @submit.prevent="submitQuestion">
          <UiInput
            v-model="question"
            :disabled="streaming"
            maxlength="2000"
            placeholder="向你的知识库提问..."
          />
          <UiButton v-if="streaming" variant="secondary" type="button" @click="stopStreaming">
            <Square :size="14" />
            停止
          </UiButton>
          <UiButton v-else type="submit" :disabled="!question.trim()">
            <MessageSquare :size="15" />
            发送
          </UiButton>
        </form>
      </main>
    </div>
  </main>
</template>
