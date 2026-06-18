<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Star,
  Trash2,
} from 'lucide-vue-next'
import { computed } from 'vue'
import type { DocumentStatus, DocumentSummary, DocumentType } from '@lumi/shared'
import UiBadge from '../ui/Badge.vue'
import UiButton from '../ui/Button.vue'
import UiCard from '../ui/Card.vue'

const props = defineProps<{
  document: DocumentSummary
  status: DocumentStatus
  actionLoadingId: string
  maxCardTagCount?: number
}>()

const emit = defineEmits<{
  open: [document: DocumentSummary]
  toggleFavorite: [document: DocumentSummary]
  retryIngest: [document: DocumentSummary]
  archive: [document: DocumentSummary]
  unarchive: [document: DocumentSummary]
  restore: [document: DocumentSummary]
  requestDelete: [document: DocumentSummary]
  requestPermanentDelete: [document: DocumentSummary]
}>()

const MAX_CARD_TAG_COUNT = props.maxCardTagCount ?? 3

const documentTypes: Array<{ value: DocumentType; label: string }> = [
  { value: 'article', label: '文章' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'pdf', label: 'PDF' },
  { value: 'fragment', label: '片段' },
]

const isLoading = computed(() => props.actionLoadingId === props.document.id)
const canManage = computed(() => props.document.ingestStatus === 'succeeded')
const canEditReadingMarkers = computed(
  () => props.status !== 'trash' && props.document.ingestStatus === 'succeeded',
)

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function documentTypeLabel(value: DocumentType) {
  return documentTypes.find((item) => item.value === value)?.label || value
}

function documentStatusVariant(document: DocumentSummary) {
  if (document.ingestStatus === 'failed') return 'destructive'
  if (document.deletedAt) return 'destructive'
  return 'neutral'
}

function documentStatusLabel(document: DocumentSummary) {
  if (document.ingestStatus === 'pending') return '等待解析'
  if (document.ingestStatus === 'processing') return '解析中'
  if (document.ingestStatus === 'failed') return '解析失败'
  if (document.deletedAt) return '回收站'
  if (document.archivedAt) return '已归档'
  return ''
}

function shouldShowDocumentStatus(document: DocumentSummary) {
  return Boolean(document.deletedAt || document.archivedAt || document.ingestStatus !== 'succeeded')
}

function documentExcerpt(document: DocumentSummary) {
  if (document.ingestStatus === 'pending') return '文章已进入导入队列，正在等待解析。'
  if (document.ingestStatus === 'processing') return '正在提取正文并转换为 Markdown。'
  if (document.ingestStatus === 'failed') {
    return document.ingestErrorMessage || '解析失败，可以稍后重试。'
  }
  return document.excerpt || '暂无摘要'
}

function readingStatusLabel(value: DocumentSummary['readingStatus']) {
  return value === 'read' ? '已读' : '未读'
}

function readingStatusClass(value: DocumentSummary['readingStatus']) {
  return value === 'unread' ? 'reading-status-badge is-unread' : 'reading-status-badge'
}

function visibleDocumentTags(document: DocumentSummary) {
  return document.tags.slice(0, MAX_CARD_TAG_COUNT)
}

function hasHiddenDocumentTags(document: DocumentSummary) {
  return document.tags.length > MAX_CARD_TAG_COUNT
}
</script>

<template>
  <UiCard class="article-card-shell card-interactive">
    <article class="article-card">
      <div class="article-card-header">
        <button class="article-card-title-button" type="button" @click="emit('open', document)">
          <h3 class="article-card-title">{{ document.title }}</h3>
        </button>
        <div class="article-card-actions">
          <UiButton
            v-if="canEditReadingMarkers"
            variant="ghost"
            size="icon"
            :disabled="isLoading"
            :title="document.favoritedAt ? '取消收藏' : '收藏'"
            @click.stop="emit('toggleFavorite', document)"
          >
            <Star :size="15" :class="{ 'is-filled-icon': document.favoritedAt }" />
          </UiButton>
          <UiButton
            v-if="status === 'trash'"
            variant="ghost"
            size="icon"
            :disabled="isLoading"
            title="恢复"
            @click="emit('restore', document)"
          >
            <RotateCcw :size="15" />
          </UiButton>
          <UiButton
            v-if="status === 'trash'"
            variant="ghost"
            size="icon"
            :disabled="isLoading"
            title="永久删除"
            @click="emit('requestPermanentDelete', document)"
          >
            <Trash2 :size="15" />
          </UiButton>
          <UiButton
            v-if="document.ingestStatus === 'failed'"
            variant="ghost"
            size="icon"
            :disabled="isLoading"
            title="重新解析"
            @click="emit('retryIngest', document)"
          >
            <RefreshCw :size="15" />
          </UiButton>
          <UiButton
            v-if="status === 'archived' && canManage"
            variant="ghost"
            size="icon"
            :disabled="isLoading"
            title="取消归档"
            @click="emit('unarchive', document)"
          >
            <ArchiveRestore :size="15" />
          </UiButton>
          <UiButton
            v-if="status === 'active' && canManage"
            variant="ghost"
            size="icon"
            :disabled="isLoading"
            title="归档"
            @click="emit('archive', document)"
          >
            <Archive :size="15" />
          </UiButton>
          <UiButton
            v-if="status !== 'trash'"
            variant="ghost"
            size="icon"
            :disabled="isLoading"
            title="删除"
            @click="emit('requestDelete', document)"
          >
            <Trash2 :size="15" />
          </UiButton>
          <a
            v-if="document.url"
            class="ui-button ui-button--ghost ui-button--size-icon"
            :href="document.url"
            rel="noreferrer"
            target="_blank"
            title="打开原文"
            @click.stop
          >
            <ExternalLink :size="15" />
          </a>
        </div>
      </div>

      <button class="article-card-body" type="button" @click="emit('open', document)">
        <p class="article-card-excerpt">{{ documentExcerpt(document) }}</p>
        <div class="article-card-footer">
          <div class="article-card-meta">
            <span class="article-card-meta-item">{{ document.source || '未知来源' }}</span>
            <span class="article-card-meta-item">{{ formatDate(document.createdAt) }}</span>
            <span v-if="document.wordCount" class="article-card-meta-item">
              {{ document.wordCount }} 字
            </span>
          </div>
          <div class="article-card-tags">
            <UiBadge
              class="article-card-badge article-card-badge-state"
              :class="readingStatusClass(document.readingStatus)"
              variant="neutral"
            >
              {{ readingStatusLabel(document.readingStatus) }}
            </UiBadge>
            <UiBadge
              v-if="shouldShowDocumentStatus(document)"
              class="article-card-badge article-card-badge-state"
              :variant="documentStatusVariant(document)"
            >
              {{ documentStatusLabel(document) }}
            </UiBadge>
            <UiBadge class="article-card-badge article-card-badge-type" variant="strong">
              {{ documentTypeLabel(document.type) }}
            </UiBadge>
            <UiBadge
              v-if="document.aiAnalysisStatus === 'pending' || document.aiAnalysisStatus === 'processing'"
              class="article-card-badge article-card-badge-ai"
              variant="outline"
            >
              AI 生成中
            </UiBadge>
            <UiBadge
              v-else-if="document.aiAnalysisStatus === 'succeeded'"
              class="article-card-badge article-card-badge-ai"
              variant="outline"
            >
              AI 已生成
            </UiBadge>
            <UiBadge
              v-for="item in visibleDocumentTags(document)"
              :key="item.id"
              class="article-card-badge article-card-badge-tag"
              variant="neutral"
            >
              {{ item.name }}
            </UiBadge>
            <UiBadge
              v-if="hasHiddenDocumentTags(document)"
              class="article-card-badge article-card-badge-more"
              variant="neutral"
            >
              ...
            </UiBadge>
          </div>
        </div>
      </button>
    </article>
  </UiCard>
</template>
