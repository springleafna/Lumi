<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { computed } from 'vue'
import { buildPaginationItems } from '../../lib/pagination'

const props = defineProps<{
  page: number
  pageSize: number
  total: number
}>()

const emit = defineEmits<{
  'update:page': [value: number]
}>()

const totalPages = computed(() =>
  Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))),
)
const items = computed(() => buildPaginationItems(props.page, totalPages.value))

function goTo(target: number) {
  if (target < 1 || target > totalPages.value || target === props.page) return
  emit('update:page', target)
}
</script>

<template>
  <nav v-if="totalPages > 1" class="ui-pagination" aria-label="分页">
    <button
      type="button"
      class="ui-pagination-page"
      :disabled="page <= 1"
      aria-label="上一页"
      @click="goTo(page - 1)"
    >
      <ChevronLeft :size="15" />
    </button>
    <template v-for="(item, index) in items" :key="index">
      <span v-if="item === 'ellipsis'" class="ui-pagination-ellipsis">…</span>
      <button
        v-else
        type="button"
        class="ui-pagination-page"
        :class="{ 'is-active': item === page }"
        :aria-current="item === page ? 'page' : undefined"
        @click="goTo(item)"
      >
        {{ item }}
      </button>
    </template>
    <button
      type="button"
      class="ui-pagination-page"
      :disabled="page >= totalPages"
      aria-label="下一页"
      @click="goTo(page + 1)"
    >
      <ChevronRight :size="15" />
    </button>
  </nav>
</template>
