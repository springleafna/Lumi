<script setup lang="ts">
import DOMPurify from 'dompurify'
import { nextTick, onMounted, ref, watch } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import type { KnowledgeChatMessageDto, KnowledgeChatSessionDto } from '@lumi/shared'
import SessionListSheet from '../components/knowledge-chat/SessionListSheet.vue'
import { useKnowledgeChat } from '../composables/useKnowledgeChat'
import { useMarkdownRenderer } from '../composables/useMarkdownRenderer'

const {
  sessions,
  activeSession,
  sessionsLoading,
  sessionLoading,
  actionLoading,
  question,
  streaming,
  messages,
  loadSessions,
  loadSession,
  startNewSession,
  submitQuestion,
  regenerateMessage,
  stopStreaming,
  deleteSessionById,
  canOpenCitation,
  openCitation,
} = useKnowledgeChat({
  notify: (message) => showToast(message),
})

// 答案是纯文本 Markdown（html 关闭），DOMPurify 仍做一次清洗，与文章问答同管线。
const { render: renderAnswerRaw } = useMarkdownRenderer({ html: false })

const listRef = ref<HTMLElement | null>(null)
const sheetOpen = ref(false)
let scrollFrame: number | undefined

function renderAnswerMarkdown(answer?: string | null) {
  if (!answer) return ''
  return DOMPurify.sanitize(renderAnswerRaw(answer))
}

function messageStatusLabel(status: KnowledgeChatMessageDto['status']) {
  // processing 阶段由「正在生成...」占位，不再重复显示状态行
  if (status === 'failed') return '失败'
  if (status === 'aborted') return '已停止'
  return ''
}

function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
  if (scrollFrame !== undefined) {
    window.cancelAnimationFrame(scrollFrame)
  }
  void nextTick(() => {
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = undefined
      const panel = listRef.value
      if (!panel) return
      panel.scrollTo({ top: panel.scrollHeight, behavior })
    })
  })
}

watch(messages, () => scrollToBottom('auto'), { deep: true })

function handleSubmit() {
  void submitQuestion().then(() => scrollToBottom())
}

async function onSelectSession(id: string) {
  sheetOpen.value = false
  await loadSession(id)
  scrollToBottom('auto')
}

function onNewSession() {
  sheetOpen.value = false
  startNewSession()
}

async function onRequestDeleteSession(session: KnowledgeChatSessionDto) {
  try {
    await showConfirmDialog({
      title: '删除会话',
      message: `确认删除「${session.title}」吗？会话内的问答记录将一并删除。`,
    })
  } catch {
    return
  }
  await deleteSessionById(session)
}

onMounted(() => {
  void loadSessions().then(() => scrollToBottom('auto'))
})
</script>

<template>
  <div class="chat-page">
    <van-nav-bar class="chat-nav" :title="activeSession?.title || '知识库问答'">
      <template #left>
        <span class="chat-nav-icon" role="button" aria-label="会话列表" @click="sheetOpen = true">
          <van-icon name="chat-o" size="20" />
        </span>
      </template>
      <template #right>
        <span
          class="chat-nav-icon"
          :class="{ disabled: streaming }"
          role="button"
          aria-label="新会话"
          @click="!streaming && startNewSession()"
        >
          <van-icon name="plus" size="20" />
        </span>
      </template>
    </van-nav-bar>

    <div ref="listRef" class="chat-list">
      <div v-if="sessionLoading" class="chat-list-loading">
        <van-loading size="20">加载中...</van-loading>
      </div>

      <van-empty
        v-else-if="messages.length === 0"
        image="search"
        description="向你的知识库提问，回答基于已完成索引的文章生成"
      />

      <template v-else>
        <article v-for="message in messages" :key="message.id" class="chat-message">
          <div class="chat-question">{{ message.question }}</div>

          <div class="chat-answer-block">
            <div
              v-if="message.answer"
              class="chat-answer ai-sheet-answer"
              v-html="renderAnswerMarkdown(message.answer)"
            ></div>
            <p v-else class="chat-muted">
              {{ message.status === 'processing' ? '正在生成...' : '暂无回答' }}
            </p>
            <p v-if="message.errorMessage" class="chat-error">
              {{ message.errorMessage }}
            </p>
            <p v-if="messageStatusLabel(message.status)" class="chat-status">
              {{ messageStatusLabel(message.status) }}
            </p>

            <div v-if="message.citations.length" class="chat-citations">
              <div class="chat-citations-label">来源</div>
              <button
                v-for="citation in message.citations"
                :key="citation.id"
                class="chat-citation"
                :class="{ 'is-deleted': !canOpenCitation(citation) }"
                type="button"
                :disabled="!canOpenCitation(citation)"
                @click="openCitation(citation)"
              >
                <span class="chat-citation-title">
                  [{{ citation.index }}] {{ citation.documentTitle }}
                  <span v-if="citation.sourceDeleted"> · 来源已删除</span>
                </span>
                <span class="chat-citation-excerpt">{{ citation.excerpt }}</span>
              </button>
            </div>

            <van-button
              v-if="['failed', 'aborted'].includes(message.status)"
              class="chat-regenerate"
              size="small"
              plain
              icon="replay"
              :disabled="streaming || actionLoading"
              @click="regenerateMessage(message)"
            >
              重新生成
            </van-button>
          </div>
        </article>
      </template>
    </div>

    <form class="chat-form" @submit.prevent="handleSubmit">
      <van-field
        v-model="question"
        class="chat-field"
        maxlength="2000"
        placeholder="向知识库提问..."
        :disabled="streaming"
        @keyup.enter="handleSubmit"
      />
      <van-button
        v-if="streaming"
        class="chat-send"
        plain
        native-type="button"
        @click="stopStreaming"
      >
        停止
      </van-button>
      <van-button
        v-else
        class="chat-send"
        type="primary"
        native-type="submit"
        :disabled="!question.trim()"
      >
        发送
      </van-button>
    </form>

    <SessionListSheet
      v-model:open="sheetOpen"
      :sessions="sessions"
      :active-id="activeSession?.id || ''"
      :loading="sessionsLoading"
      :streaming="streaming"
      @select="onSelectSession"
      @new="onNewSession"
      @request-delete="onRequestDeleteSession"
    />
  </div>
</template>
