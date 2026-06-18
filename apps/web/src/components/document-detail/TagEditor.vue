<script setup lang="ts">
import { Plus, Tag, X } from 'lucide-vue-next'
import { ref } from 'vue'
import type { TagDto } from '@lumi/shared'
import UiBadge from '../ui/Badge.vue'
import UiButton from '../ui/Button.vue'
import UiInput from '../ui/Input.vue'

const props = defineProps<{
  tags: TagDto[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  add: [name: string]
  remove: [tagId: string]
}>()

const tagName = ref('')

function submit() {
  const name = tagName.value.trim()
  if (!name) return
  emit('add', name)
  tagName.value = ''
}
</script>

<template>
  <section v-if="tags" class="sidebar-section">
    <div class="sidebar-title">标签管理</div>
    <div class="sidebar-tag-list">
      <UiBadge v-for="item in tags" :key="item.id" variant="neutral">
        <Tag :size="12" />
        {{ item.name }}
        <button
          class="badge-delete"
          :disabled="disabled"
          title="删除标签"
          type="button"
          @click="emit('remove', item.id)"
        >
          <X :size="12" />
        </button>
      </UiBadge>
      <p v-if="tags.length === 0" class="sidebar-empty">暂无标签</p>
    </div>
    <form class="tag-form" @submit.prevent="submit">
      <UiInput v-model="tagName" placeholder="添加标签" />
      <UiButton size="icon" variant="secondary" :disabled="disabled" type="submit">
        <Plus :size="15" />
      </UiButton>
    </form>
  </section>
</template>
