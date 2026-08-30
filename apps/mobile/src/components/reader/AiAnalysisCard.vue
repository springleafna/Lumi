<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AiAnalysisDto } from '@lumi/shared'

/**
 * AI 阅读卡：正文顶部折叠卡，一句话摘要常显，展开看摘要与要点。
 * 仅在分析成功时由阅读器渲染；移动端只读，不提供重试。
 */
const props = defineProps<{
  analysis: AiAnalysisDto
}>()

const expanded = ref(false)

const keyPoints = computed(() => props.analysis.keyPoints || [])
</script>

<template>
  <section class="reader-ai-card">
    <button class="reader-ai-card-head" type="button" @click="expanded = !expanded">
      <span class="reader-ai-card-badge">AI 导读</span>
      <span class="reader-ai-card-summary">
        {{ analysis.oneSentenceSummary || analysis.summary || 'AI 已生成这篇文章的阅读卡片' }}
      </span>
      <van-icon :name="expanded ? 'arrow-up' : 'arrow-down'" size="14" />
    </button>

    <div v-if="expanded" class="reader-ai-card-body">
      <p v-if="analysis.summary && analysis.oneSentenceSummary" class="reader-ai-card-text">
        {{ analysis.summary }}
      </p>
      <template v-if="keyPoints.length">
        <p class="reader-ai-card-label">要点</p>
        <ul class="reader-ai-card-points">
          <li v-for="(point, index) in keyPoints" :key="index">{{ point }}</li>
        </ul>
      </template>
    </div>
  </section>
</template>

<style scoped>
.reader-ai-card {
  margin: 12px 16px 0;
  background: var(--lumi-bg-secondary);
  border-radius: 12px;
}

.reader-ai-card-head {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.reader-ai-card-badge {
  flex: 0 0 auto;
  padding: 2px 6px;
  background: var(--lumi-bg-primary);
  border-radius: 6px;
  color: var(--lumi-fg-secondary);
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
}

.reader-ai-card-summary {
  flex: 1;
  color: var(--lumi-fg-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.reader-ai-card-head .van-icon {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--lumi-fg-tertiary);
}

.reader-ai-card-body {
  padding: 2px 12px 12px;
}

.reader-ai-card-text {
  color: var(--lumi-fg-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.reader-ai-card-label {
  margin: 10px 0 4px;
  color: var(--lumi-fg-tertiary);
  font-size: 11px;
  font-weight: 600;
}

.reader-ai-card-points {
  display: grid;
  gap: 5px;
  padding-left: 1.2em;
}

.reader-ai-card-points li {
  color: var(--lumi-fg-secondary);
  font-size: 13px;
  line-height: 1.6;
}
</style>
