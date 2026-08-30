<script setup lang="ts">
import DOMPurify from 'dompurify'
import { computed } from 'vue'
import type { ReaderAiExchange } from '../lib/ai-exchange'
import { useMarkdownRenderer } from '../composables/useMarkdownRenderer'

const props = defineProps<{
  open: boolean
  ingestSucceeded: boolean
  exchange: ReaderAiExchange | null
  question: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:question': [value: string]
  ask: []
}>()

// 与 web 抽屉同一套渲染管线：html 关闭 + DOMPurify 双保险。
const { render: renderAnswerRaw } = useMarkdownRenderer({ html: false })
const renderedAnswer = computed(() => {
  const answer = props.exchange?.answer
  return answer ? DOMPurify.sanitize(renderAnswerRaw(answer)) : ''
})
</script>

<template>
  <van-popup
    :show="open"
    position="bottom"
    round
    class="ai-sheet"
    :style="{ height: '78%' }"
    @update:show="emit('update:open', $event)"
  >
    <header class="ai-sheet-header">
      <h3>文章问答</h3>
      <p class="ai-sheet-hint">即时回答，不会保存历史</p>
    </header>

    <div class="ai-sheet-body safe-area-bottom">
      <p v-if="!ingestSucceeded" class="ai-sheet-muted">文章解析完成后即可提问。</p>
      <template v-else>
        <div v-if="exchange" class="ai-sheet-exchange">
          <p class="ai-sheet-question">{{ exchange.question }}</p>
          <div v-if="exchange.answer" class="ai-sheet-answer" v-html="renderedAnswer"></div>
          <p v-else class="ai-sheet-muted">
            {{ exchange.streaming ? '正在生成...' : '暂无回答' }}
          </p>
          <p v-if="exchange.failed" class="ai-sheet-muted">回答生成失败，可以重新提问。</p>
        </div>
        <p v-else class="ai-sheet-muted">基于这篇文章的全文提问，回答仅保留当前一轮。</p>

        <div class="ai-sheet-form safe-area-bottom">
          <van-field
            :model-value="question"
            class="ai-sheet-field"
            placeholder="围绕当前文章提问..."
            :disabled="Boolean(exchange?.streaming)"
            @update:model-value="emit('update:question', $event as string)"
            @keyup.enter="emit('ask')"
          />
          <van-button
            type="primary"
            :disabled="!ingestSucceeded || !question.trim() || Boolean(exchange?.streaming)"
            @click="emit('ask')"
          >
            发送
          </van-button>
        </div>
      </template>
    </div>
  </van-popup>
</template>

<style scoped>
.ai-sheet {
  display: flex;
  flex-direction: column;
}

.ai-sheet-header {
  padding: 16px 16px 4px;
  text-align: center;
}

.ai-sheet-header h3 {
  color: var(--lumi-fg-primary);
  font-size: 15px;
  font-weight: 600;
}

.ai-sheet-hint {
  margin-top: 2px;
  color: var(--lumi-fg-tertiary);
  font-size: 11px;
}

.ai-sheet-body {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  padding: 8px 16px 12px;
}

.ai-sheet-muted {
  margin-top: 24px;
  color: var(--lumi-fg-tertiary);
  font-size: 13px;
  text-align: center;
}

.ai-sheet-exchange {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.ai-sheet-question {
  margin-bottom: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--lumi-bg-secondary);
  color: var(--lumi-fg-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
}

.ai-sheet-answer {
  color: var(--lumi-fg-secondary);
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.ai-sheet-form {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 10px;
}

.ai-sheet-field {
  flex: 1;
  background: var(--lumi-bg-secondary);
  border-radius: 8px;
}

.ai-sheet-form .van-button {
  flex: 0 0 auto;
  height: 36px;
  border-radius: 8px;
}
</style>
