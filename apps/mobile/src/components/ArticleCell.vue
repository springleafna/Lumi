<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DocumentSummary } from '@lumi/shared'
import { formatDate, formatWordCount } from '../lib/format'

const props = defineProps<{ article: DocumentSummary }>()

const emit = defineEmits<{
  open: []
  'toggle-favorite': []
  archive: []
  'request-delete': []
}>()

// SwipeCell 实例类型未导出 close，这里用无泛型 ref 规避模板引用的类型检查
const swipeRef = ref()

/** 触发滑动操作前先收起滑动区，避免确认/操作后卡片停留在展开态。 */
function act(action: 'toggle-favorite' | 'archive' | 'request-delete') {
  swipeRef.value?.close?.()
  if (action === 'toggle-favorite') emit('toggle-favorite')
  else if (action === 'archive') emit('archive')
  else emit('request-delete')
}

const ingestLabel = computed(() => {
  if (props.article.ingestStatus === 'pending' || props.article.ingestStatus === 'processing') {
    return '解析中'
  }
  if (props.article.ingestStatus === 'failed') return '解析失败'
  return ''
})

const favoriteLabel = computed(() => (props.article.favoritedAt ? '取消收藏' : '收藏'))

const coverLetter = computed(() => (props.article.title || 'L').charAt(0).toUpperCase())

const metaLine = computed(() =>
  [
    props.article.source || '未知来源',
    formatDate(props.article.createdAt),
    formatWordCount(props.article.wordCount),
  ]
    .filter(Boolean)
    .join(' · '),
)
</script>

<template>
  <van-swipe-cell ref="swipeRef" class="article-cell">
    <article class="cell-body" @click="emit('open')">
      <div class="cell-main">
        <h3 class="cell-title clamp-2" :class="{ 'is-unread': article.readingStatus === 'unread' }">
          {{ article.title }}
        </h3>
        <p v-if="article.excerpt" class="cell-excerpt ellipsis">{{ article.excerpt }}</p>
        <div class="cell-meta">
          <span>{{ metaLine }}</span>
          <span v-if="ingestLabel" class="cell-flag" :class="{ 'is-failed': article.ingestStatus === 'failed' }">
            {{ ingestLabel }}
          </span>
          <van-icon v-if="article.favoritedAt" name="star" class="cell-star" />
        </div>
      </div>
      <van-image
        v-if="article.coverImage"
        class="cell-cover"
        width="72"
        height="72"
        radius="8"
        fit="cover"
        lazy-load
        :src="article.coverImage"
      >
        <template #error>
          <div class="cell-cover-fallback">{{ coverLetter }}</div>
        </template>
      </van-image>
    </article>

    <template #right>
      <van-button class="cell-action is-favorite" square @click="act('toggle-favorite')">
        {{ favoriteLabel }}
      </van-button>
      <van-button class="cell-action is-archive" square @click="act('archive')">归档</van-button>
      <van-button class="cell-action is-delete" square @click="act('request-delete')">删除</van-button>
    </template>
  </van-swipe-cell>
</template>

<style scoped>
.article-cell {
  display: block;
  margin: 0 12px;
  /* 右缘内缩 1px 裁剪：SwipeCell 收起位换算的亚像素前缘落在裁剪区外，杜绝黑色细线 */
  clip-path: inset(0 1px 0 0 round 12px);
}

.article-cell + .article-cell {
  margin-top: 10px;
}

.cell-body {
  display: flex;
  gap: 12px;
  padding: 14px;
  background: var(--lumi-bg-primary);
  border-radius: 12px;
}

.cell-main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 6px;
  align-content: start;
}

.cell-title {
  color: var(--lumi-fg-primary);
  font-size: 15px;
  font-weight: 400;
  line-height: 1.4;
}

.cell-title.is-unread {
  font-weight: 600;
}

.cell-title.is-unread::before {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--lumi-fg-primary);
  content: '';
  vertical-align: 3px;
}

.cell-excerpt {
  color: var(--lumi-fg-muted);
  font-size: 13px;
  line-height: 1.4;
}

.cell-meta {
  display: flex;
  gap: 8px;
  color: var(--lumi-fg-tertiary);
  font-size: 12px;
}

.cell-flag {
  color: var(--lumi-fg-muted);
}

.cell-flag.is-failed {
  color: var(--lumi-danger);
}

.cell-star {
  margin-left: auto;
  color: #f59e0b;
  font-size: 12px;
}

.cell-cover {
  flex: 0 0 auto;
}

.cell-cover-fallback {
  display: flex;
  width: 72px;
  height: 72px;
  align-items: center;
  justify-content: center;
  color: var(--lumi-fg-tertiary);
  background: var(--lumi-bg-secondary);
  font-size: 24px;
  font-weight: 600;
}

.cell-action {
  width: 68px;
  height: 100%;
  border: 0;
  border-radius: 0;
  font-weight: 400;
}

/* 滑动操作功能色：收藏琥珀 / 归档蓝 / 删除红（红沿用 --lumi-danger） */
.cell-action.is-favorite {
  color: #ffffff;
  background: #f59e0b;
}

.cell-action.is-archive {
  color: #ffffff;
  background: #3b82f6;
}

.cell-action.is-delete {
  color: #ffffff;
  background: var(--lumi-danger);
}
</style>
