<script setup lang="ts">
import DOMPurify from 'dompurify'
import { ArrowLeft, ExternalLink, Trash2 } from 'lucide-vue-next'
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
const deleting = ref(false)
const showDeleteConfirm = ref(false)
const errorMessage = ref('')

const renderedMarkdown = computed(() => {
  if (!document.value) return ''
  return DOMPurify.sanitize(markdown.render(document.value.markdown))
})

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

async function deleteDocument() {
  if (!document.value) return
  deleting.value = true
  errorMessage.value = ''
  try {
    await client.documents.delete(document.value.id)
    await router.push('/documents')
  } catch (error) {
    errorMessage.value = getErrorMessage(error, '删除失败')
  } finally {
    deleting.value = false
    showDeleteConfirm.value = false
  }
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
      <button
        class="danger-button"
        :disabled="!document"
        type="button"
        @click="showDeleteConfirm = true"
      >
        <Trash2 :size="18" />
        删除
      </button>
    </header>

    <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    <div v-if="loading" class="empty-state">正在加载...</div>

    <article v-else-if="document" class="reader-article">
      <p class="eyebrow">{{ document.source || '未知来源' }}</p>
      <h1>{{ document.title }}</h1>
      <div class="meta-line">
        <span>{{ new Date(document.createdAt).toLocaleString() }}</span>
        <span v-if="document.author">{{ document.author }}</span>
        <a v-if="document.url" :href="document.url" rel="noreferrer" target="_blank">
          原文链接
          <ExternalLink :size="15" />
        </a>
      </div>
      <div class="prose" v-html="renderedMarkdown"></div>
    </article>

    <div v-if="showDeleteConfirm" class="dialog-backdrop" @click.self="showDeleteConfirm = false">
      <section class="dialog-panel small">
        <h2>删除文章</h2>
        <p>删除后文章会被软删除，不会再出现在列表和详情中。</p>
        <div class="dialog-actions">
          <button class="secondary-button" type="button" @click="showDeleteConfirm = false">
            取消
          </button>
          <button class="danger-button" :disabled="deleting" type="button" @click="deleteDocument">
            {{ deleting ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>
