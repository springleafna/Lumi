<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  open: boolean
  /** 编辑时传入已有笔记；新建时为空串。 */
  note: string
  /** 编辑已有批注（即使笔记为空，标题也显示「编辑批注」）。 */
  editing?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [note: string]
}>()

const text = ref('')

watch(
  () => props.open,
  (open) => {
    if (open) text.value = props.note
  },
)

function save() {
  emit('save', text.value.trim())
}

const title = computed(() => (props.editing ? '编辑批注' : '写批注'))
</script>

<template>
  <van-popup
    :show="open"
    position="bottom"
    round
    class="note-sheet"
    @update:show="emit('update:open', $event)"
  >
    <header class="note-sheet-header">
      <h3>{{ title }}</h3>
    </header>
    <div class="note-sheet-body safe-area-bottom">
      <van-field
        v-model="text"
        type="textarea"
        rows="3"
        autosize
        maxlength="1000"
        show-word-limit
        placeholder="记录你的想法（留空则只保留高亮）..."
      />
      <div class="note-sheet-actions">
        <van-button size="small" plain @click="emit('update:open', false)">取消</van-button>
        <van-button size="small" type="primary" @click="save">保存</van-button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.note-sheet-header {
  padding: 16px 16px 6px;
  text-align: center;
}

.note-sheet-header h3 {
  color: var(--lumi-fg-primary);
  font-size: 15px;
  font-weight: 600;
}

.note-sheet-body {
  padding: 6px 16px 16px;
}

.note-sheet-body :deep(.van-field) {
  background: var(--lumi-bg-secondary);
  border-radius: 10px;
  padding: 10px 12px;
}

.note-sheet-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 10px;
}
</style>
