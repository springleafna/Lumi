<script setup lang="ts">
import { ref } from 'vue'
import { LumiApiError } from '@lumi/api-client'
import UiButton from '../ui/Button.vue'
import UiDialog from '../ui/Dialog.vue'
import UiInput from '../ui/Input.vue'
import UiTabs from '../ui/Tabs.vue'
import { useToast } from '../../composables/useToast'
import { client } from '../../lib/client'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  imported: [documentId: string]
}>()

const { toast } = useToast()

const importTabs = [
  { value: 'url', label: 'URL' },
  { value: 'file', label: '文件' },
]

const importMode = ref('url')
const importUrl = ref('')
const selectedFile = ref<File | null>(null)
const importLoading = ref(false)

function selectFile(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] || null
}

function notifyError(error: unknown, fallback: string) {
  const message = error instanceof LumiApiError ? error.message : fallback
  toast({
    title: fallback,
    description: message,
    variant: 'destructive',
  })
}

async function importDocument() {
  importLoading.value = true
  try {
    const result = await client.ingest.url({ url: importUrl.value })
    emit('update:open', false)
    importUrl.value = ''
    toast({
      title: '导入任务已创建',
      description: '文章会先进入解析队列，完成后自动生成 AI 摘要和标签。',
      variant: 'success',
    })
    emit('imported', result.document.id)
  } catch (error) {
    notifyError(error, '导入失败')
  } finally {
    importLoading.value = false
  }
}

async function importFile() {
  if (!selectedFile.value) {
    toast({ title: '请选择文件', variant: 'destructive' })
    return
  }

  importLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    const result = await client.ingest.file(formData)
    emit('update:open', false)
    selectedFile.value = null
    toast({
      title: '文件已导入',
      description: '文档已保存，Lumi 会尝试自动生成 AI 阅读卡片。',
      variant: 'success',
    })
    emit('imported', result.document.id)
  } catch (error) {
    notifyError(error, '文件导入失败')
  } finally {
    importLoading.value = false
  }
}
</script>

<template>
  <UiDialog
    :open="open"
    title="导入文章"
    description="输入 URL，或上传 Markdown / 文本文档。"
    @update:open="emit('update:open', $event)"
  >
    <div class="dialog-form">
      <UiTabs
        :model-value="importMode"
        :items="importTabs"
        @update:model-value="(value) => (importMode = value)"
      />

      <form v-if="importMode === 'url'" class="dialog-form" @submit.prevent="importDocument">
        <label class="field-group">
          <span>URL</span>
          <UiInput
            v-model.trim="importUrl"
            autocomplete="url"
            placeholder="https://example.com/article"
          />
        </label>
        <div class="dialog-actions">
          <UiButton variant="ghost" @click="emit('update:open', false)">取消</UiButton>
          <UiButton type="submit" :disabled="importLoading">
            {{ importLoading ? '导入中...' : '确认导入' }}
          </UiButton>
        </div>
      </form>

      <form v-else class="dialog-form" @submit.prevent="importFile">
        <label class="field-group">
          <span>文件</span>
          <input
            class="ui-input"
            type="file"
            accept=".md,.txt,text/markdown,text/plain"
            @change="selectFile"
          />
        </label>
        <p class="field-hint">支持 .md / .txt，最大 2MB。</p>
        <div class="dialog-actions">
          <UiButton variant="ghost" @click="emit('update:open', false)">取消</UiButton>
          <UiButton type="submit" :disabled="importLoading || !selectedFile">
            {{ importLoading ? '导入中...' : '导入文件' }}
          </UiButton>
        </div>
      </form>
    </div>
  </UiDialog>
</template>
