<script setup lang="ts">
import { computed } from 'vue'
import type { AnnotationDto } from '@lumi/shared'

const props = defineProps<{
  open: boolean
  annotations: AnnotationDto[]
  loading: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  locate: [id: string]
}>()

const sorted = computed(() =>
  [...props.annotations].sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  }),
)
</script>

<template>
  <van-popup
    :show="open"
    position="bottom"
    round
    class="annotation-sheet"
    :style="{ maxHeight: '65%' }"
    @update:show="emit('update:open', $event)"
  >
    <header class="annotation-sheet-header">
      <h3>批注（{{ annotations.length }}）</h3>
    </header>
    <div class="annotation-sheet-list safe-area-bottom">
      <p v-if="loading" class="annotation-sheet-muted">正在加载批注...</p>
      <p v-else-if="annotations.length === 0" class="annotation-sheet-muted">
        这篇文章还没有批注（可在桌面端创建）。
      </p>
      <button
        v-for="item in sorted"
        :key="item.id"
        class="annotation-sheet-item"
        type="button"
        @click="emit('locate', item.id)"
      >
        <span class="annotation-sheet-text clamp-2">{{ item.selectedText }}</span>
        <span v-if="item.note" class="annotation-sheet-note clamp-2">{{ item.note }}</span>
        <span v-else class="annotation-sheet-note is-muted">未添加批注内容</span>
      </button>
    </div>
  </van-popup>
</template>

<style scoped>
.annotation-sheet-header {
  padding: 16px 16px 8px;
  text-align: center;
}

.annotation-sheet-header h3 {
  color: var(--lumi-fg-primary);
  font-size: 15px;
  font-weight: 600;
}

.annotation-sheet-list {
  display: grid;
  gap: 10px;
  padding: 8px 16px 16px;
  overflow-y: auto;
}

.annotation-sheet-muted {
  padding: 24px 0;
  color: var(--lumi-fg-tertiary);
  font-size: 13px;
  text-align: center;
}

.annotation-sheet-item {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--lumi-border-muted);
  border-radius: 10px;
  background: var(--lumi-bg-page);
  text-align: left;
}

.annotation-sheet-text {
  color: var(--lumi-fg-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}

.annotation-sheet-note {
  color: var(--lumi-fg-muted);
  font-size: 12px;
  line-height: 1.5;
}

.annotation-sheet-note.is-muted {
  color: var(--lumi-fg-disabled);
}
</style>
