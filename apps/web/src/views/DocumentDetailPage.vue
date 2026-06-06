<script setup lang="ts">
import DOMPurify from 'dompurify'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  BookOpenText,
  CalendarDays,
  ExternalLink,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  X,
} from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import type { DocumentDetail, DocumentType } from '@lumi/shared'
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import UiCard from '../components/ui/Card.vue'
import UiDialog from '../components/ui/Dialog.vue'
import UiEmptyState from '../components/ui/EmptyState.vue'
import UiInput from '../components/ui/Input.vue'
import { useToast } from '../composables/useToast'
import { client } from '../lib/client'

type ConfirmDialogState = {
  title: string
  description: string
  actionLabel: string
  run: () => Promise<void>
}

const route = useRoute()
const router = useRouter()
const { toast } = useToast()
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

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
const tagName = ref('')
const errorMessage = ref('')
const confirmDialog = ref<ConfirmDialogState | null>(null)
const confirmLoading = ref(false)

const renderedMarkdown = computed(() => {
  if (!document.value) return ''
  return DOMPurify.sanitize(markdown.render(document.value.markdown))
})

const isTrash = computed(() => Boolean(document.value?.deletedAt))
const isArchived = computed(() => Boolean(document.value?.archivedAt) && !isTrash.value)

const statusLabel = computed(() => {
  if (isTrash.value) return '回收站'
  if (isArchived.value) return '已归档'
  return '阅读中'
})

const statusVariant = computed(() => {
  if (isTrash.value) return 'destructive'
  if (isArchived.value) return 'neutral'
  return 'strong'
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

onMounted(loadDocument)

async function loadDocument() {
  loading.value = true
  errorMessage.value = ''
  try {
    document.value = await client.documents.get(String(route.params.id))
  } catch (error) {
    notifyError(error, '文章加载失败')
  } finally {
    loading.value = false
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
            <BookOpenText :size="18" />
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

        <article v-else class="article-detail">
          <header class="article-detail-header">
            <div class="article-detail-status">
              <UiBadge :variant="statusVariant">{{ statusLabel }}</UiBadge>
              <UiBadge variant="outline">{{ documentTypeLabel(document.type) }}</UiBadge>
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
            <div v-if="document.tags.length" class="article-detail-tags">
              <UiBadge v-for="item in document.tags" :key="item.id" variant="neutral">
                {{ item.name }}
              </UiBadge>
            </div>
          </header>

          <div class="article-detail-content markdown-reader" v-html="renderedMarkdown"></div>
        </article>
      </main>
    </div>

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
