import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LumiApiError, type LumiSseEvent } from '@lumi/api-client'
import type {
  KnowledgeChatCitationDto,
  KnowledgeChatMessageDto,
  KnowledgeChatSessionDto,
} from '@lumi/shared'
import { client } from '../lib/client'

/**
 * 知识库问答的会话、消息与 SSE 流式状态（移动端适配自 web 同名组合式函数）。
 *
 * 与 web 的差异：不做重命名；错误提示由调用方注入 notify（页面用 vant toast）；
 * 引用跳转走移动端阅读器路由 /article/:id（不携带偏移量）。其余 SSE 事件
 * 处理、停止与重新生成语义与 web 保持一致。
 */
export function useKnowledgeChat(options: { notify?: (message: string) => void } = {}) {
  const router = useRouter()
  const notify = options.notify || (() => {})

  const sessions = ref<KnowledgeChatSessionDto[]>([])
  const activeSession = ref<KnowledgeChatSessionDto | null>(null)
  const sessionsLoading = ref(false)
  const sessionLoading = ref(false)
  const actionLoading = ref(false)
  const question = ref('')
  const streaming = ref(false)
  const streamingMessageId = ref('')
  let abortController: AbortController | null = null
  let abortedByUser = false

  const messages = computed(() => activeSession.value?.messages || [])
  const hasSessions = computed(() => sessions.value.length > 0)

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
      notify(getErrorMessage(error, '会话列表加载失败'))
    } finally {
      if (!options.silent) sessionsLoading.value = false
    }
  }

  async function loadSession(id: string, options: { silent?: boolean } = {}) {
    if (!options.silent) sessionLoading.value = true
    try {
      activeSession.value = await client.knowledgeChat.getSession(id)
    } catch (error) {
      notify(getErrorMessage(error, '会话加载失败'))
    } finally {
      if (!options.silent) sessionLoading.value = false
    }
  }

  function startNewSession() {
    if (streaming.value) return
    activeSession.value = null
    question.value = ''
  }

  async function submitQuestion() {
    const text = question.value.trim()
    if (!text || streaming.value) return

    const submittedQuestion = text
    question.value = ''
    streaming.value = true
    abortedByUser = false
    abortController = new AbortController()

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
        notify(getErrorMessage(error, '知识库问答失败'))
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
        notify(getErrorMessage(error, '重新生成失败'))
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

  async function deleteSessionById(session: KnowledgeChatSessionDto) {
    // 正在流式输出的会话不允许删除，避免与 SSE 回写冲突。
    if (streaming.value && activeSession.value?.id === session.id) return

    actionLoading.value = true
    try {
      await client.knowledgeChat.deleteSession(session.id)
      sessions.value = sessions.value.filter((item) => item.id !== session.id)
      if (activeSession.value?.id === session.id) {
        activeSession.value = null
        if (sessions.value[0]) {
          await loadSession(sessions.value[0].id, { silent: true })
        }
      }
    } catch (error) {
      notify(getErrorMessage(error, '会话删除失败'))
    } finally {
      actionLoading.value = false
    }
  }

  async function reloadActiveSession(sessionId: string) {
    await Promise.all([loadSession(sessionId, { silent: true }), loadSessions({ silent: true })])
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
      return
    }

    if (event.event === 'answer_delta') {
      const payload = asRecord(event.data)
      appendAnswer(typeof payload.text === 'string' ? payload.text : '')
      return
    }

    if (event.event === 'citations') {
      const citations = Array.isArray(event.data)
        ? (event.data as KnowledgeChatCitationDto[])
        : []
      if (streamingMessageId.value) {
        updateMessage(streamingMessageId.value, { citations })
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
      }
      return
    }

    if (event.event === 'error') {
      const payload = asRecord(event.data)
      const message = typeof payload.message === 'string' ? payload.message : '知识库问答失败'
      markStreamingMessageFailed(message)
    }
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
    const nextMessages =
      index >= 0
        ? existing.map((item) => (item.id === next.id ? { ...item, ...next } : item))
        : [...existing, next]
    activeSession.value = { ...current, messages: nextMessages }
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

  /** 引用跳移动端阅读器；会话已落库，返回时载入最近会话即可恢复现场。 */
  function openCitation(citation: KnowledgeChatCitationDto) {
    if (!canOpenCitation(citation) || !citation.documentId) return
    void router.push(`/article/${citation.documentId}`)
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

  onBeforeUnmount(() => {
    abortController?.abort()
  })

  return {
    sessions,
    activeSession,
    sessionsLoading,
    sessionLoading,
    actionLoading,
    question,
    streaming,
    streamingMessageId,
    messages,
    hasSessions,
    loadSessions,
    loadSession,
    startNewSession,
    submitQuestion,
    regenerateMessage,
    stopStreaming,
    deleteSessionById,
    canOpenCitation,
    openCitation,
  }
}
