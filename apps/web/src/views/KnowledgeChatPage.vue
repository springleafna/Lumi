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
import { nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { KnowledgeChatMessageDto, KnowledgeChatSessionDto } from '@lumi/shared'
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import UiCard from '../components/ui/Card.vue'
import UiDialog from '../components/ui/Dialog.vue'
import UiEmptyState from '../components/ui/EmptyState.vue'
import UiInput from '../components/ui/Input.vue'
import { useMarkdownRenderer } from '../composables/useMarkdownRenderer'
import { useKnowledgeChat } from '../composables/useKnowledgeChat'
import lumiLogo from '../assets/lumi-logo.svg'

const router = useRouter()

const {
  sessions,
  activeSession,
  sessionsLoading,
  sessionLoading,
  actionLoading,
  question,
  streaming,
  errorMessage,
  messages,
  hasSessions,
  loadSessions,
  loadSession,
  startNewSession,
  submitQuestion,
  regenerateMessage,
  stopStreaming,
  renameSession,
  deleteSessionById,
  canOpenCitation,
  openCitation,
} = useKnowledgeChat()

// 知识库问答的答案是纯文本 Markdown，不需要允许 HTML，但 DOMPurify 仍做一次清洗。
const { render: renderAnswer } = useMarkdownRenderer({ html: false })

const chatPanelRef = ref<HTMLElement | null>(null)
const renameDialog = ref<{ id: string; title: string } | null>(null)
const renameTitle = ref('')
const deleteDialog = ref<KnowledgeChatSessionDto | null>(null)
let scrollFrame: number | undefined

function openRenameDialog(session: KnowledgeChatSessionDto) {
  renameDialog.value = { id: session.id, title: session.title }
  renameTitle.value = session.title
}

async function submitRename() {
  const target = renameDialog.value
  if (!target) return
  const session = sessions.value.find((item) => item.id === target.id)
  if (!session) {
    renameDialog.value = null
    return
  }
  await renameSession(session, renameTitle.value)
  renameDialog.value = null
}

async function submitDelete() {
  const target = deleteDialog.value
  if (!target) return
  await deleteSessionById(target)
  deleteDialog.value = null
}

onMounted(async () => {
  await loadSessions()
})

// 答案增量到达或新消息出现时自动滚到底部。
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

watch(messages, () => scheduleScrollToBottom('auto'), { deep: true })

function handleSubmit() {
  void submitQuestion().then(() => scheduleScrollToBottom())
}

function messageStatusLabel(status: KnowledgeChatMessageDto['status']) {
  if (status === 'processing') return '生成中'
  if (status === 'failed') return '失败'
  if (status === 'aborted') return '已停止'
  return '已完成'
}

function renderAnswerMarkdown(answer?: string | null) {
  if (!answer) return ''
  return DOMPurify.sanitize(renderAnswer(answer))
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
          <div
            v-for="session in sessions"
            :key="session.id"
            class="knowledge-session-item"
            :class="{ active: activeSession?.id === session.id }"
          >
            <button class="knowledge-session-button" type="button" @click="loadSession(session.id)">
              <span>{{ session.title }}</span>
              <small>{{ formatDate(session.updatedAt) }}</small>
            </button>
            <div class="knowledge-session-item-actions">
              <button
                class="knowledge-session-icon-button"
                type="button"
                title="重命名"
                :disabled="Boolean(actionLoading)"
                @click.stop="openRenameDialog(session)"
              >
                <PencilLine :size="13" />
              </button>
              <button
                class="knowledge-session-icon-button"
                type="button"
                title="删除会话"
                :disabled="Boolean(actionLoading) || (streaming && activeSession?.id === session.id)"
                @click.stop="deleteDialog = session"
              >
                <Trash2 :size="13" />
              </button>
            </div>
          </div>
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
                :disabled="streaming || Boolean(actionLoading) || !activeSession"
                title="重命名"
                @click="activeSession && openRenameDialog(activeSession)"
              >
                <PencilLine :size="15" />
              </UiButton>
              <UiButton
                variant="ghost"
                size="icon"
                :disabled="streaming || Boolean(actionLoading) || !activeSession"
                title="删除会话"
                @click="activeSession && (deleteDialog = activeSession)"
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

        <form class="knowledge-question-form" @submit.prevent="handleSubmit">
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

    <UiDialog
      :open="Boolean(renameDialog)"
      title="重命名会话"
      @update:open="renameDialog = null"
    >
      <form class="dialog-form" @submit.prevent="submitRename">
        <label class="field-group">
          <span>会话标题</span>
          <UiInput v-model="renameTitle" maxlength="80" placeholder="输入新的会话标题" />
        </label>
        <div class="dialog-actions">
          <UiButton variant="ghost" type="button" @click="renameDialog = null">取消</UiButton>
          <UiButton
            type="submit"
            :disabled="!renameTitle.trim() || Boolean(actionLoading)"
          >
            {{ actionLoading === 'rename' ? '保存中...' : '保存' }}
          </UiButton>
        </div>
      </form>
    </UiDialog>

    <UiDialog
      :open="Boolean(deleteDialog)"
      title="删除会话"
      :description="
        deleteDialog ? `确认删除「${deleteDialog.title}」吗？会话内的问答记录将一并删除。` : ''
      "
      @update:open="deleteDialog = null"
    >
      <div class="dialog-actions">
        <UiButton variant="ghost" @click="deleteDialog = null">取消</UiButton>
        <UiButton variant="destructive" :disabled="Boolean(actionLoading)" @click="submitDelete">
          {{ actionLoading === 'delete' ? '删除中...' : '删除' }}
        </UiButton>
      </div>
    </UiDialog>
  </main>
</template>
