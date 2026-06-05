<script setup lang="ts">
import DOMPurify from 'dompurify'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ExternalLink,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-vue-next'
import MarkdownIt from 'markdown-it'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import type { DocumentDetail } from '@lumi/shared'
import { client } from '../lib/client'

const route = useRoute()
const router = useRouter()
const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

const document = ref<DocumentDetail | null>(null)
const loading = ref(false)
const actionLoading = ref(false)
const tagName = ref('')
const errorMessage = ref('')

const renderedMarkdown = computed(() => {
  if (!document.value) return ''
  return DOMPurify.sanitize(markdown.render(document.value.markdown))
})

const isTrash = computed(() => Boolean(document.value?.deletedAt))
const isArchived = computed(() => Boolean(document.value?.archivedAt) && !isTrash.value)

onMounted(loadDocument)

async function loadDocument() {
  loading.value = true
  errorMessage.value = ''
  try {
    document.value = await client.documents.get(String(route.params.id))
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '文章加载失败')
  } finally {
    loading.value = false
  }
}

async function archiveDocument() {
  if (!document.value) return
  await runDetailAction(async () => {
    document.value = await client.documents.archive(document.value!.id)
  }, '归档失败')
}

async function unarchiveDocument() {
  if (!document.value) return
  await runDetailAction(async () => {
    document.value = await client.documents.unarchive(document.value!.id)
  }, '取消归档失败')
}

async function restoreDocument() {
  if (!document.value) return
  await runDetailAction(async () => {
    document.value = await client.documents.restore(document.value!.id)
  }, '恢复失败')
}

async function deleteDocument() {
  if (!document.value) return
  if (!confirm(`确认删除《${document.value.title}》吗？文章会进入回收站。`)) return
  await runDetailAction(async () => {
    await client.documents.delete(document.value!.id)
    await router.push('/documents')
  }, '删除失败')
}

async function permanentlyDeleteDocument() {
  if (!document.value) return
  if (!confirm(`确认永久删除《${document.value.title}》吗？此操作不可恢复。`)) return
  await runDetailAction(async () => {
    await client.documents.permanentDelete(document.value!.id)
    await router.push('/documents')
  }, '永久删除失败')
}

async function addTag() {
  if (!document.value) return
  const name = tagName.value.trim()
  if (!name) return
  if (document.value.tags.some((tag) => tag.name === name)) {
    errorMessage.value = '标签已存在'
    return
  }

  await runDetailAction(async () => {
    document.value = await client.documents.addTag(document.value!.id, { name })
    tagName.value = ''
  }, '添加标签失败')
}

async function removeTag(tagId: string) {
  if (!document.value) return
  await runDetailAction(async () => {
    document.value = await client.documents.removeTag(document.value!.id, tagId)
  }, '删除标签失败')
}

async function runDetailAction(action: () => Promise<void>, fallback: string) {
  actionLoading.value = true
  errorMessage.value = ''
  try {
    await action()
  } catch (error) {
    errorMessage.value = getErrorMessage(error, fallback)
  } finally {
    actionLoading.value = false
  }
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : ''
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof LumiApiError ? error.message : fallback
}
</script>

<template>
  <main class="reader-shell">
    <header class="reader-header">
      <button class="secondary-button" type="button" @click="router.push('/documents')">
        <ArrowLeft :size="18" />
        返回
      </button>
      <div class="reader-actions" v-if="document">
        <a
          v-if="document.url"
          class="secondary-button"
          :href="document.url"
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink :size="18" />
          原文
        </a>
        <button
          v-if="!isTrash && !isArchived"
          class="secondary-button"
          :disabled="actionLoading"
          type="button"
          @click="archiveDocument"
        >
          <Archive :size="18" />
          归档
        </button>
        <button
          v-if="!isTrash && isArchived"
          class="secondary-button"
          :disabled="actionLoading"
          type="button"
          @click="unarchiveDocument"
        >
          <ArchiveRestore :size="18" />
          取消归档
        </button>
        <button
          v-if="isTrash"
          class="secondary-button"
          :disabled="actionLoading"
          type="button"
          @click="restoreDocument"
        >
          <RotateCcw :size="18" />
          恢复
        </button>
        <button
          v-if="!isTrash"
          class="danger-button"
          :disabled="actionLoading"
          type="button"
          @click="deleteDocument"
        >
          <Trash2 :size="18" />
          删除
        </button>
        <button
          v-if="isTrash"
          class="danger-button"
          :disabled="actionLoading"
          type="button"
          @click="permanentlyDeleteDocument"
        >
          <Trash2 :size="18" />
          永久删除
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    <div v-if="loading" class="empty-state">正在加载...</div>

    <article v-else-if="document" class="reader-article">
      <div class="status-row">
        <span v-if="isTrash" class="status-badge danger">回收站</span>
        <span v-else-if="isArchived" class="status-badge">已归档</span>
        <span v-else class="status-badge ok">阅读中</span>
      </div>

      <p class="eyebrow">{{ document.source || '未知来源' }}</p>
      <h1>{{ document.title }}</h1>
      <div class="meta-line reader-meta">
        <span>创建：{{ formatDate(document.createdAt) }}</span>
        <span v-if="document.updatedAt">更新：{{ formatDate(document.updatedAt) }}</span>
        <span v-if="document.publishedAt">发布：{{ formatDate(document.publishedAt) }}</span>
        <span v-if="document.author">{{ document.author }}</span>
        <span v-if="document.wordCount">{{ document.wordCount }} 字</span>
      </div>

      <section class="tag-editor">
        <div class="tag-row">
          <span v-for="item in document.tags" :key="item.id" class="tag-pill editable">
            {{ item.name }}
            <button
              :disabled="actionLoading"
              title="删除标签"
              type="button"
              @click="removeTag(item.id)"
            >
              <X :size="13" />
            </button>
          </span>
          <span v-if="document.tags.length === 0" class="muted-text">暂无标签</span>
        </div>
        <form class="tag-form" @submit.prevent="addTag">
          <input v-model="tagName" placeholder="添加标签" />
          <button class="secondary-button compact-icon" :disabled="actionLoading" type="submit">
            <Plus :size="17" />
          </button>
        </form>
      </section>

      <div class="prose" v-html="renderedMarkdown"></div>
    </article>
  </main>
</template>
