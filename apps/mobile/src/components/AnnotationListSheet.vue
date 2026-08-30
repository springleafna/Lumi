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
  'request-edit': [annotation: AnnotationDto]
  'request-delete': [annotation: AnnotationDto]
}>()

const sorted = computed(() =>
  [...props.annotations].sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  }),
)

// 条目上的显式「⋯」菜单：左滑在鼠标环境（桌面调试）里不可用，保证删除始终可达
const ITEM_ACTIONS = [
  { text: '编辑批注', value: 'request-edit' },
  { text: '删除', value: 'request-delete', color: 'var(--lumi-danger)' },
]

function onItemAction(action: { value: string }, annotation: AnnotationDto) {
  if (action.value === 'request-edit') emit('request-edit', annotation)
  else if (action.value === 'request-delete') emit('request-delete', annotation)
}
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
        还没有批注，长按选中正文文字即可添加。
      </p>
      <van-swipe-cell v-for="item in sorted" :key="item.id">
        <div class="annotation-sheet-item">
          <button
            class="annotation-sheet-main"
            type="button"
            @click="emit('locate', item.id)"
          >
            <span class="annotation-sheet-text clamp-2">{{ item.selectedText }}</span>
            <span v-if="item.note" class="annotation-sheet-note clamp-2">{{ item.note }}</span>
            <span v-else class="annotation-sheet-note is-muted">未添加批注内容</span>
          </button>
          <van-popover
            placement="left"
            actions-direction="horizontal"
            :actions="ITEM_ACTIONS"
            @select="(action: { value: string }) => onItemAction(action, item)"
          >
            <template #reference>
              <button
                class="annotation-sheet-more"
                type="button"
                aria-label="批注操作"
              >
                <van-icon name="ellipsis" size="16" />
              </button>
            </template>
          </van-popover>
        </div>
        <template #right>
          <van-button
            class="annotation-sheet-action is-edit"
            square
            text="编辑"
            @click="emit('request-edit', item)"
          />
          <van-button
            class="annotation-sheet-action is-delete"
            square
            text="删除"
            @click="emit('request-delete', item)"
          />
        </template>
      </van-swipe-cell>
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
  display: flex;
  align-items: stretch;
  border: 1px solid var(--lumi-border-muted);
  border-radius: 10px;
  background: var(--lumi-bg-page);
}

.annotation-sheet-main {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 6px;
  align-content: center;
  padding: 12px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.annotation-sheet-more {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: var(--lumi-fg-tertiary);
  cursor: pointer;
}

.annotation-sheet-action {
  width: 68px;
  height: 100%;
  border: 0;
  border-radius: 0;
  font-weight: 400;
}

/* 滑动操作与文章库同款语言：编辑中性灰、删除红 */
.annotation-sheet-action.is-edit {
  color: var(--lumi-fg-primary);
  background: var(--lumi-bg-secondary);
}

.annotation-sheet-action.is-delete {
  color: #ffffff;
  background: var(--lumi-danger);
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
