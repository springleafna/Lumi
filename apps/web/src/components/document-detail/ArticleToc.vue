<script setup lang="ts">
import type { TocItem } from '../../composables/useRuntimeToc'

defineProps<{
  items: TocItem[]
  activeId: string
}>()

const emit = defineEmits<{
  navigate: [id: string]
}>()
</script>

<template>
  <aside
    v-if="items.length"
    class="article-toc"
    aria-label="文章目录"
  >
    <p class="article-toc-title">目录</p>
    <nav class="article-toc-nav">
      <button
        v-for="item in items"
        :key="item.id"
        class="article-toc-link"
        :class="[`level-${item.level}`, { active: activeId === item.id }]"
        type="button"
        @click="emit('navigate', item.id)"
      >
        {{ item.title }}
      </button>
    </nav>
  </aside>
</template>
