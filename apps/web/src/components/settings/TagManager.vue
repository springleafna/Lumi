<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ArrowRightLeft, Check, Pencil, RefreshCw, Trash2, X } from 'lucide-vue-next'
import type { TagDto } from '@lumi/shared'
import { LumiApiError } from '@lumi/api-client'
import { client } from '../../lib/client'
import UiBadge from '../ui/Badge.vue'
import UiButton from '../ui/Button.vue'
import UiCard from '../ui/Card.vue'
import UiDialog from '../ui/Dialog.vue'
import UiSelect from '../ui/Select.vue'
import { useToast } from '../../composables/useToast'

const { toast } = useToast()

const tags = ref<TagDto[]>([])
const loading = ref(false)
const busy = ref(false)

const renamingId = ref('')
const renameDraft = ref('')
const mergingId = ref('')
const mergeTargetId = ref('')
const pendingDelete = ref<TagDto>()

const mergeOptions = computed(() =>
  tags.value
    .filter((tag) => tag.id !== mergingId.value)
    .map((tag) => ({
      value: tag.id,
      label: tag.count ? `${tag.name}（${tag.count} 篇）` : tag.name,
    })),
)

onMounted(load)

async function load() {
  loading.value = true
  try {
    const facets = await client.documents.facets()
    tags.value = [...facets.tags].sort(
      (a, b) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name, 'zh-CN'),
    )
  } catch (error) {
    showError(error, '标签加载失败')
  } finally {
    loading.value = false
  }
}

function startRename(tag: TagDto) {
  cancelMerge()
  renamingId.value = tag.id
  renameDraft.value = tag.name
}

function cancelRename() {
  renamingId.value = ''
  renameDraft.value = ''
}

async function submitRename() {
  const tag = tags.value.find((item) => item.id === renamingId.value)
  const name = renameDraft.value.trim()
  if (!tag || !name || name === tag.name) {
    cancelRename()
    return
  }
  await run(async () => {
    await client.tags.rename(tag.id, { name })
    toast({ title: `标签已重命名为「${name}」` })
  })
  cancelRename()
}

function startMerge(tag: TagDto) {
  cancelRename()
  mergingId.value = tag.id
  mergeTargetId.value = ''
}

function cancelMerge() {
  mergingId.value = ''
  mergeTargetId.value = ''
}

async function submitMerge() {
  const tag = tags.value.find((item) => item.id === mergingId.value)
  if (!tag || !mergeTargetId.value) return
  await run(async () => {
    const result = await client.tags.merge(tag.id, { targetId: mergeTargetId.value })
    toast({
      title: `已合并到「${result.tag.name}」`,
      description: `${result.movedDocuments} 篇文章的标签已迁移。`,
    })
  })
  cancelMerge()
}

async function confirmDelete() {
  const tag = pendingDelete.value
  if (!tag) return
  await run(async () => {
    await client.tags.remove(tag.id)
    toast({ title: '标签已删除' })
  })
  pendingDelete.value = undefined
}

async function run(action: () => Promise<void>) {
  busy.value = true
  try {
    await action()
    await load()
  } catch (error) {
    showError(error, '操作失败')
  } finally {
    busy.value = false
  }
}

function showError(error: unknown, fallback: string) {
  toast({
    title: fallback,
    description: error instanceof LumiApiError ? error.message : undefined,
    variant: 'destructive',
  })
}
</script>

<template>
  <UiCard class="settings-panel tag-manager">
    <header class="tag-manager-header">
      <div>
        <h2>标签管理</h2>
        <p>AI 打标会优先复用已有标签。在这里重命名、合并或删除标签，保持标签体系干净；删除标签只影响标签本身，文章不会受影响。</p>
      </div>
      <UiButton variant="ghost" size="icon" :disabled="loading" title="刷新" @click="load">
        <RefreshCw :size="15" />
      </UiButton>
    </header>

    <p v-if="loading && !tags.length" class="tag-manager-empty">加载中...</p>
    <p v-else-if="!tags.length" class="tag-manager-empty">暂无标签。</p>

    <ul v-else class="tag-list">
      <li v-for="tag in tags" :key="tag.id" class="tag-row">
        <template v-if="renamingId === tag.id">
          <input
            v-model="renameDraft"
            class="tag-rename-input"
            maxlength="30"
            :disabled="busy"
            @keyup.enter="submitRename"
            @keyup.esc="cancelRename"
          />
          <div class="tag-row-actions">
            <UiButton size="sm" variant="secondary" :disabled="busy || !renameDraft.trim()" @click="submitRename">
              <Check :size="14" />
              保存
            </UiButton>
            <UiButton size="sm" variant="ghost" :disabled="busy" @click="cancelRename">取消</UiButton>
          </div>
        </template>

        <template v-else-if="mergingId === tag.id">
          <span class="tag-merge-label">「{{ tag.name }}」合并到</span>
          <UiSelect v-model="mergeTargetId" :options="mergeOptions" aria-label="选择目标标签" />
          <div class="tag-row-actions">
            <UiButton size="sm" variant="secondary" :disabled="busy || !mergeTargetId" @click="submitMerge">
              确认合并
            </UiButton>
            <UiButton size="sm" variant="ghost" :disabled="busy" @click="cancelMerge">取消</UiButton>
          </div>
        </template>

        <template v-else>
          <span class="tag-row-name">{{ tag.name }}</span>
          <UiBadge variant="neutral">{{ tag.count ?? 0 }} 篇</UiBadge>
          <div class="tag-row-actions">
            <UiButton variant="ghost" size="icon" :disabled="busy" title="重命名" @click="startRename(tag)">
              <Pencil :size="15" />
            </UiButton>
            <UiButton
              v-if="tags.length > 1"
              variant="ghost"
              size="icon"
              :disabled="busy"
              title="合并到其他标签"
              @click="startMerge(tag)"
            >
              <ArrowRightLeft :size="15" />
            </UiButton>
            <UiButton variant="ghost" size="icon" :disabled="busy" title="删除标签" @click="pendingDelete = tag">
              <Trash2 :size="15" />
            </UiButton>
          </div>
        </template>
      </li>
    </ul>

    <UiDialog
      :open="Boolean(pendingDelete)"
      :title="`删除标签「${pendingDelete?.name ?? ''}」？`"
      :description="`会从 ${pendingDelete?.count ?? 0} 篇文章上移除该标签，文章本身不受影响。`"
      @update:open="pendingDelete = undefined"
    >
      <template #footer>
        <UiButton variant="ghost" :disabled="busy" @click="pendingDelete = undefined">
          <X :size="15" />
          取消
        </UiButton>
        <UiButton variant="destructive" :disabled="busy" @click="confirmDelete">
          <Trash2 :size="15" />
          删除标签
        </UiButton>
      </template>
    </UiDialog>
  </UiCard>
</template>

<style scoped>
/* .ui-card 是 overflow:hidden，作为 flex 子项会被压缩到容器高度导致内容裁切，需禁止收缩让 .content 正常滚动 */
.tag-manager {
  flex-shrink: 0;
}

.tag-manager-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.tag-manager-header h2 {
  margin: 0;
  color: var(--fg-primary);
  font-size: 16px;
  font-weight: 600;
}

.tag-manager-header p {
  margin: var(--space-2) 0 0;
  color: var(--fg-tertiary);
  font-size: 13px;
  line-height: 1.6;
}

.tag-manager-empty {
  margin: var(--space-6) 0 0;
  color: var(--fg-muted);
  font-size: 13px;
}

.tag-list {
  display: grid;
  gap: 2px;
  margin: var(--space-5) 0 0;
  padding: 0;
  list-style: none;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 42px;
  border-radius: var(--radius-sm);
  padding: 2px var(--space-2);
}

.tag-row:hover {
  background: var(--bg-secondary);
}

.tag-row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--fg-primary);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-merge-label {
  flex: 0 0 auto;
  color: var(--fg-secondary);
  font-size: 13px;
}

.tag-row-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-1);
  margin-left: auto;
}

.tag-rename-input {
  width: 220px;
  min-height: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  color: var(--fg-primary);
  background: var(--bg-primary);
  font-size: 13px;
  outline: none;
}

.tag-rename-input:focus {
  border-color: var(--fg-primary);
}
</style>
