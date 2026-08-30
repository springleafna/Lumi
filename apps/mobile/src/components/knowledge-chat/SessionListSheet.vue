<script setup lang="ts">
import type { KnowledgeChatSessionDto } from '@lumi/shared'

const props = defineProps<{
  open: boolean
  sessions: KnowledgeChatSessionDto[]
  activeId: string
  loading: boolean
  streaming: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [id: string]
  new: []
  'request-delete': [session: KnowledgeChatSessionDto]
}>()

function formatDate(value?: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <van-popup
    :show="open"
    position="bottom"
    round
    class="session-sheet"
    :style="{ height: '62%' }"
    @update:show="emit('update:open', $event)"
  >
    <header class="session-sheet-header">
      <h3>问答会话</h3>
      <van-button
        size="small"
        icon="plus"
        :disabled="streaming"
        @click="emit('new')"
      >
        新会话
      </van-button>
    </header>

    <div class="session-sheet-body safe-area-bottom">
      <div v-if="loading" class="session-sheet-loading">
        <van-loading size="18" />
      </div>
      <van-empty v-else-if="sessions.length === 0" description="暂无会话" />
      <van-swipe-cell v-else v-for="session in sessions" :key="session.id">
        <button
          class="session-item"
          :class="{ active: session.id === activeId }"
          type="button"
          :disabled="streaming"
          @click="emit('select', session.id)"
        >
          <span class="session-item-title">{{ session.title }}</span>
          <small class="session-item-time">{{ formatDate(session.updatedAt) }}</small>
        </button>
        <template #right>
          <van-button
            class="session-item-delete"
            square
            type="danger"
            text="删除"
            :disabled="streaming && session.id === activeId"
            @click="emit('request-delete', session)"
          />
        </template>
      </van-swipe-cell>
      <p v-if="streaming" class="session-sheet-hint">回答生成中，暂不能切换会话</p>
    </div>
  </van-popup>
</template>
