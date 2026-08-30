<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import { showToast } from 'vant'
import { client, hasServerUrl, TOKEN_KEY } from '../lib/client'
import { extractFirstUrl, initShareReceiver, type SharedPayload } from '../lib/share-receiver'

/**
 * 全局分享接收确认框：收到系统分享后先预览识别结果，确认才导入。
 * 未配置服务器 / 未登录时直接丢弃（D3），走正常 setup → login 流程。
 */
const route = useRoute()

const open = ref(false)
const importing = ref(false)
const share = ref<SharedPayload | null>(null)

const detected = computed(() => {
  if (!share.value) return null
  const url = extractFirstUrl(share.value.text)
  return url ? { kind: 'url' as const, url } : { kind: 'text' as const }
})

const preview = computed(() => {
  if (!share.value) return ''
  const target = detected.value
  if (target?.kind === 'url') return target.url
  const text = share.value.text.replace(/\s+/g, ' ').trim()
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
})

async function beforeClose(action: string): Promise<boolean> {
  if (action !== 'confirm') return true
  const target = detected.value
  if (!target || !share.value) return true

  importing.value = true
  try {
    if (target.kind === 'url') {
      await client.ingest.url({ url: target.url })
    } else {
      await client.ingest.selection({
        title: share.value.title,
        selectedText: share.value.text,
      })
    }
    showToast({ type: 'success', message: '导入任务已创建' })
    // 冷启动分享落在文章库，刷新列表；热启动在别的页面则原地不打扰
    if (route.path === '/library') {
      window.dispatchEvent(new Event('lumi:library-refresh'))
    }
    return true
  } catch (error) {
    showToast(error instanceof LumiApiError ? error.message : '导入失败')
    return false
  } finally {
    importing.value = false
  }
}

watch(open, (value) => {
  if (!value) share.value = null
})

onMounted(() => {
  void initShareReceiver((payload) => {
    if (!hasServerUrl() || !localStorage.getItem(TOKEN_KEY)) return
    share.value = payload
    open.value = true
  })
})
</script>

<template>
  <van-dialog
    v-model:show="open"
    title="导入分享内容"
    show-cancel-button
    confirm-button-text="导入"
    :before-close="beforeClose"
  >
    <div v-if="detected" class="share-dialog-body">
      <p class="share-dialog-kind">
        {{ detected.kind === 'url' ? '识别为链接' : '识别为文本' }}
      </p>
      <p class="share-dialog-preview">{{ preview }}</p>
    </div>
  </van-dialog>
</template>

<style scoped>
.share-dialog-body {
  padding: 4px 20px 20px;
}

.share-dialog-kind {
  color: var(--lumi-fg-tertiary);
  font-size: 11px;
}

.share-dialog-preview {
  margin-top: 6px;
  padding: 8px 10px;
  background: var(--lumi-bg-secondary);
  border-radius: 8px;
  color: var(--lumi-fg-primary);
  font-size: 13px;
  line-height: 1.55;
  word-break: break-all;
}
</style>
