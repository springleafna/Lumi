<script setup lang="ts">
import type { TocItem } from '../composables/useRuntimeToc'

defineProps<{
  open: boolean
  items: TocItem[]
  activeId: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  navigate: [id: string]
}>()
</script>

<template>
  <van-popup
    :show="open"
    position="right"
    class="toc-sheet"
    :style="{ width: '72%', height: '100%' }"
    @update:show="emit('update:open', $event)"
  >
    <header class="toc-sheet-header safe-area-top">
      <h3>目录</h3>
      <van-icon name="cross" @click="emit('update:open', false)" />
    </header>
    <nav class="toc-sheet-nav safe-area-bottom">
      <button
        v-for="item in items"
        :key="item.id"
        class="toc-sheet-link"
        :class="[`is-level-${item.level}`, { 'is-active': item.id === activeId }]"
        type="button"
        @click="emit('navigate', item.id)"
      >
        {{ item.title }}
      </button>
    </nav>
  </van-popup>
</template>

<style scoped>
.toc-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--lumi-border-muted);
}

.toc-sheet-header h3 {
  color: var(--lumi-fg-primary);
  font-size: 15px;
  font-weight: 600;
}

.toc-sheet-header .van-icon {
  padding: 4px;
  color: var(--lumi-fg-muted);
  font-size: 16px;
}

.toc-sheet-nav {
  display: grid;
  padding: 10px 8px;
  gap: 2px;
  overflow-y: auto;
}

.toc-sheet-link {
  padding: 10px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--lumi-fg-secondary);
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
}

.toc-sheet-link.is-level-3 {
  padding-left: 24px;
}

.toc-sheet-link.is-active {
  color: var(--lumi-fg-primary);
  background: var(--lumi-bg-secondary);
  font-weight: 600;
}
</style>
