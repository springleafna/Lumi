<script setup lang="ts">
import { computed } from 'vue'
import { LoaderCircle, RefreshCw } from 'lucide-vue-next'
import type { AiAnalysisDto, AiAnalysisStatus, VideoSummaryMode } from '@lumi/shared'
import UiBadge from '../ui/Badge.vue'
import UiButton from '../ui/Button.vue'

// 视频总结模式工具条：贴在正文上方，展示当前模式并切换/重新生成。
// 速览/精读正文就是文档正文，所以操作放在详情页而非 AI 抽屉。
const props = defineProps<{
  aiAnalysis: AiAnalysisDto | null
  /** 详情页上的分析状态（aiAnalysis 行尚未创建时兜底，如排队中） */
  aiStatus?: AiAnalysisStatus | null
  actionLoading: boolean
}>()

const emit = defineEmits<{
  regenerate: [mode: VideoSummaryMode]
}>()

const status = computed(() => props.aiAnalysis?.status ?? props.aiStatus ?? null)
const isGenerating = computed(
  () => status.value === 'pending' || status.value === 'processing',
)
const mode = computed<VideoSummaryMode>(() =>
  props.aiAnalysis?.mode === 'standard' ? 'standard' : 'brief',
)
const modeLabel = computed(() => (mode.value === 'standard' ? '精读笔记' : '速览总结'))
const generatingLabel = computed(() =>
  mode.value === 'standard' ? '正在生成精读笔记，可能需要几分钟…' : '正在生成总结…',
)
// 另一份正文已存档 → 免生成的「切换」；未存档 → 需要调用的「生成」
const switchActionLabel = computed(() => {
  if (mode.value === 'brief') {
    return props.aiAnalysis?.hasStandardBody ? '切换精读' : '生成精读笔记'
  }
  return props.aiAnalysis?.hasBriefBody ? '切换速览' : '生成速览总结'
})
</script>

<template>
  <div v-if="aiAnalysis || aiStatus" class="video-summary-mode-bar">
    <div class="video-summary-mode-info">
      <UiBadge v-if="!isGenerating && status !== 'failed'" variant="neutral">
        {{ modeLabel }}
      </UiBadge>
      <span v-if="isGenerating" class="video-summary-generating">
        <LoaderCircle :size="14" />
        {{ generatingLabel }}
      </span>
      <span v-else-if="status === 'failed'" class="video-summary-failed">
        总结生成失败，可在辅助阅读抽屉中重试。
      </span>
      <span v-else-if="aiAnalysis?.errorMessage" class="video-summary-failed">
        上次生成失败，已保留当前内容。
      </span>
    </div>
    <div v-if="status === 'succeeded'" class="video-summary-mode-actions">
      <UiButton
        variant="ghost"
        size="icon"
        :disabled="actionLoading"
        :title="`重新生成${modeLabel}`"
        @click="emit('regenerate', mode)"
      >
        <RefreshCw :size="14" />
      </UiButton>
      <UiButton
        v-if="mode === 'brief'"
        variant="secondary"
        size="sm"
        :disabled="actionLoading"
        @click="emit('regenerate', 'standard')"
      >
        {{ switchActionLabel }}
      </UiButton>
      <UiButton
        v-else
        variant="ghost"
        size="sm"
        :disabled="actionLoading"
        @click="emit('regenerate', 'brief')"
      >
        {{ switchActionLabel }}
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.video-summary-mode-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin: var(--space-3) 0;
}

.video-summary-mode-info {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.video-summary-generating,
.video-summary-failed {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--fg-muted);
  font-size: var(--text-sm);
}

.video-summary-generating svg {
  animation: video-summary-spin 1.2s linear infinite;
}

@keyframes video-summary-spin {
  to {
    transform: rotate(360deg);
  }
}

.video-summary-mode-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
</style>
