import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { LumiApiError, type LumiSseEvent } from '@lumi/api-client'
import type {
  KnowledgeChatCitationDto,
  KnowledgeChatMessageDto,
  KnowledgeChatSessionDto,
} from '@lumi/shared'
import { useToast } from './useToast'
import { client } from '../lib/client'

/**
 * 知识库问答的会话、消息与 SSE 流式状态。
 *
 * 提问 / 重新生成通过 SSE 接收增量答案与引用，AbortController 支持中途
 * 停止；停止后会延迟重载当前会话以拿到 aborted 终态。会话标题由服务端
 * 在首条消息后异步回传 title_updated 事件更新。
 */
export function useKnowledgeChat() {
  const router = useRouter()
  const { toast } = useToast()

  const sessions = ref<KnowledgeChatSessionDto[]>([])
  const activeSession = ref<KnowledgeChatSessionDto | null>(null)
  const sessionsLoading = ref(false)
  const sessionLoading = ref(false)
  const actionLoading = ref('')
  const question = ref('')
  const streaming = ref(false)
  const streamingMessageId = ref('')
  const errorMessage = ref('')
  let abortController: AbortController | null = null
  let abortedByUser = false
  let scrollFrame: number | undefined

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
      errorMessage.value = message
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

  onBeforeUnmount(() => {
    abortController?.abort()
    if (scrollFrame !== undefined) {
      window.cancelAnimationFrame(scrollFrame)
    }
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
    errorMessage,
    messages,
    hasSessions,
    loadSessions,
    loadSession,
    startNewSession,
    submitQuestion,
    regenerateMessage,
    stopStreaming,
    renameActiveSession,
    deleteActiveSession,
    canOpenCitation,
    openCitation,
    nextTick,
  }
}
