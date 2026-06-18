<script setup lang="ts">
import type { AnnotationDto } from '@lumi/shared'
import UiButton from '../ui/Button.vue'
import UiDialog from '../ui/Dialog.vue'

defineProps<{
  toolbar: { visible: boolean; x: number; y: number }
  dialogOpen: boolean
  editingAnnotation: AnnotationDto | null
  note: string
  actionLoading: string
}>()

const emit = defineEmits<{
  'update:dialogOpen': [value: boolean]
  'update:note': [value: string]
  createHighlight: []
  openAnnotationDialog: []
  submit: []
}>()
</script>

<template>
  <div
    v-if="toolbar.visible"
    class="selection-toolbar"
    :style="{ left: `${toolbar.x}px`, top: `${toolbar.y}px` }"
    @mousedown.prevent
  >
    <button type="button" @click="emit('createHighlight')">高亮</button>
    <button type="button" @click="emit('openAnnotationDialog')">批注</button>
  </div>

  <UiDialog
    :open="dialogOpen"
    :title="editingAnnotation ? '编辑批注' : '添加批注'"
    description="批注会绑定到当前选中的正文。"
    @update:open="emit('update:dialogOpen', $event)"
  >
    <form class="dialog-form" @submit.prevent="emit('submit')">
      <label class="field-group">
        <span>批注</span>
        <textarea
          :value="note"
          class="ui-input annotation-textarea"
          maxlength="1000"
          placeholder="写下这段内容给你的提示..."
          @input="emit('update:note', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
      </label>
      <div class="dialog-actions">
        <UiButton variant="ghost" @click="emit('update:dialogOpen', false)">取消</UiButton>
        <UiButton type="submit" :disabled="Boolean(actionLoading)">
          {{ actionLoading ? '保存中...' : '保存批注' }}
        </UiButton>
      </div>
    </form>
  </UiDialog>
</template>
