<script setup lang="ts">
import { computed, ref } from 'vue'
import { ExternalLink, Play } from 'lucide-vue-next'
import { formatVideoDuration, parseBilibiliVideoUrl } from '../../lib/video-anchor'

const props = defineProps<{
  url: string
  coverImage?: string | null
  durationSeconds?: number | null
  source?: string | null
}>()

const link = computed(() => parseBilibiliVideoUrl(props.url))
const embedded = ref(false)
const startSeconds = ref(0)
const coverFailed = ref(false)

// B 站外链播放器没有外部控制接口：seek 通过带 t 参数重挂 iframe 实现，
// 参数表见官方文档 https://player.bilibili.com/（t 秒 / autoplay / poster / page）
const iframeSrc = computed(() => {
  if (!link.value) return ''
  const params = new URLSearchParams({
    autoplay: '1',
    t: String(startSeconds.value),
    poster: '1',
  })
  if (link.value.videoId.startsWith('BV')) {
    params.set('bvid', link.value.videoId)
  } else {
    params.set('aid', link.value.videoId.replace(/^av/i, ''))
  }
  if (link.value.page > 1) {
    params.set('page', String(link.value.page))
  }
  return `https://player.bilibili.com/player.html?${params.toString()}`
})

function embedAt(seconds = 0) {
  startSeconds.value = Math.max(0, Math.floor(seconds))
  embedded.value = true
}

defineExpose({
  seekTo(seconds: number) {
    embedAt(seconds)
  },
})
</script>

<template>
  <section v-if="link" class="video-header-card">
    <div v-if="!embedded" class="video-cover" role="button" tabindex="0" @click="embedAt(0)" @keydown.enter="embedAt(0)">
      <img
        v-if="coverImage && !coverFailed"
        class="video-cover-image"
        :src="coverImage || undefined"
        alt=""
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="coverFailed = true"
      />
      <div v-else class="video-cover-fallback">Bilibili</div>
      <span class="video-cover-play">
        <Play :size="16" />
        播放
      </span>
      <span v-if="durationSeconds" class="video-cover-duration">
        {{ formatVideoDuration(durationSeconds) }}
      </span>
    </div>
    <div v-else class="video-embed">
      <iframe
        :key="startSeconds"
        :src="iframeSrc"
        allow="autoplay; fullscreen"
        allowfullscreen
        scrolling="no"
        frameborder="0"
      ></iframe>
    </div>

    <div class="video-header-meta">
      <span>{{ source || '哔哩哔哩' }}</span>
      <span v-if="durationSeconds">{{ formatVideoDuration(durationSeconds) }}</span>
      <a class="video-origin-link" :href="url" rel="noreferrer" target="_blank">
        打开原视频
        <ExternalLink :size="12" />
      </a>
    </div>
  </section>
</template>

<style scoped>
.video-header-card {
  margin-bottom: var(--space-8);
}

.video-cover {
  position: relative;
  display: flex;
  min-height: 200px;
  max-height: 420px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  cursor: pointer;
  aspect-ratio: 16 / 9;
}

.video-cover-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-cover-fallback {
  color: var(--fg-muted);
  font-size: var(--text-sm);
  letter-spacing: 2px;
}

.video-cover-play {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border-radius: 999px;
  padding: var(--space-2) var(--space-4);
  color: #ffffff;
  background: rgba(24, 24, 27, 0.82);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: background 150ms cubic-bezier(0.2, 0, 0, 1);
}

.video-cover:hover .video-cover-play {
  background: rgba(24, 24, 27, 0.95);
}

.video-cover-duration {
  position: absolute;
  right: var(--space-3);
  bottom: var(--space-3);
  z-index: 1;
  border-radius: var(--radius-sm);
  padding: 2px var(--space-2);
  color: #ffffff;
  background: rgba(24, 24, 27, 0.82);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.video-embed {
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: #000000;
}

.video-embed iframe {
  display: block;
  width: 100%;
  height: 100%;
}

.video-header-meta {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-2);
  color: var(--fg-tertiary);
  font-size: var(--text-sm);
}

.video-origin-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  margin-left: auto;
  color: var(--fg-tertiary);
  text-decoration: none;
}

.video-origin-link:hover {
  color: var(--fg-primary);
}
</style>
