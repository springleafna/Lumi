<script setup lang="ts">
import {
  Bot,
  CheckCircle2,
  FileText,
  LoaderCircle,
  RefreshCw,
  Rows3,
  Search,
  Settings as SettingsIcon,
  XCircle,
} from 'lucide-vue-next'
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import UiCard from '../components/ui/Card.vue'
import UiDialog from '../components/ui/Dialog.vue'
import UiInput from '../components/ui/Input.vue'
import UiSelect from '../components/ui/Select.vue'
import UiTabs from '../components/ui/Tabs.vue'
import ProviderConfigForm from '../components/settings/ProviderConfigForm.vue'
import { useAiSettings } from '../composables/useAiSettings'
import {
  useEmbeddingJobs,
  statusLabel,
  statusVariant,
  formatChunkMeta,
} from '../composables/useEmbeddingJobs'
import lumiLogo from '../assets/lumi-logo.svg'

type SettingsTab = 'ai' | 'jobs'

const route = useRoute()
const router = useRouter()

const tabs = [
  { value: 'ai', label: 'AI 设置' },
  { value: 'jobs', label: '索引任务' },
]

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'succeeded', label: '成功' },
  { value: 'failed', label: '失败' },
]

const currentTab = ref<SettingsTab>(normalizeTab(route.query.tab))

const {
  aiSettings,
  actionLoading: aiActionLoading,
  chatForm,
  embeddingForm,
  chatConfigured,
  embeddingConfigured,
  chatPresets,
  embeddingPresets,
  saveChatConfig,
  saveEmbeddingConfig,
  testChatConfig,
  testEmbeddingConfig,
  clearChatConfig,
  clearEmbeddingConfig,
  applyChatPreset,
  applyEmbeddingPreset,
} = useAiSettings()

const {
  jobs,
  jobsTotal,
  jobsLoading,
  jobsStatus,
  jobsKeyword,
  jobsPage,
  pageSize,
  chunkDialogOpen,
  selectedJob,
  jobChunks,
  jobChunksLoading,
  actionLoading: jobsActionLoading,
  chunkDialogTitle,
  chunkDialogDescription,
  loadJobs,
  retryJob,
  openJobChunks,
  updateChunkDialogOpen,
  handleJobRowKeydown,
  applyJobFilters,
} = useEmbeddingJobs()

watch(
  () => route.query.tab,
  (value) => {
    currentTab.value = normalizeTab(value)
  },
)

onMounted(async () => {
  await loadJobs()
})

async function changeTab(value: string) {
  currentTab.value = normalizeTab(value)
  await router.replace({
    path: '/settings',
    query: currentTab.value === 'jobs' ? { tab: 'jobs' } : {},
  })
  if (currentTab.value === 'jobs' && jobs.value.length === 0) {
    await loadJobs()
  }
}

function normalizeTab(value: unknown): SettingsTab {
  return value === 'jobs' ? 'jobs' : 'ai'
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <main class="app-shell">
    <aside class="sidebar">
      <section class="sidebar-section">
        <div class="sidebar-brand-link">
          <div class="brand-mark">
            <img class="brand-logo" :src="lumiLogo" alt="" />
          </div>
          <span>Lumi</span>
        </div>
      </section>
      <section class="sidebar-section">
        <div class="sidebar-title">导航</div>
        <nav class="sidebar-nav">
          <button class="sidebar-link" type="button" @click="router.push('/documents')">
            <FileText class="sidebar-link-icon" />
            <span>文章库</span>
          </button>
          <button class="sidebar-link" type="button" @click="router.push('/knowledge-chat')">
            <Bot class="sidebar-link-icon" />
            <span>知识库问答</span>
          </button>
          <button class="sidebar-link active" type="button">
            <SettingsIcon class="sidebar-link-icon" />
            <span>设置</span>
          </button>
        </nav>
      </section>
    </aside>

    <div class="main">
      <header class="header">
        <div>
          <p class="kicker">Settings</p>
          <h1 class="page-title">设置</h1>
        </div>
      </header>

      <main class="content settings-content">
        <UiTabs
          :model-value="currentTab"
          :items="tabs"
          @update:model-value="changeTab"
        />

        <section v-if="currentTab === 'ai'" class="settings-grid">
          <UiCard v-if="aiSettings && !aiSettings.encryptionReady" class="settings-warning">
            <XCircle :size="18" />
            <span>需要先在服务端环境变量中配置 AI_CONFIG_ENCRYPTION_KEY，才能保存 API Key。</span>
          </UiCard>

          <UiCard class="settings-panel">
            <ProviderConfigForm
              kicker="Chat"
              title="Chat Provider"
              :configured="chatConfigured"
              :form="chatForm"
              :presets="chatPresets"
              :action-loading="aiActionLoading"
              :last-test-status="aiSettings?.chat.lastTestStatus"
              :last-tested-at="aiSettings?.chat.lastTestedAt"
              :last-test-error="aiSettings?.chat.lastTestError"
              @update:form="chatForm = $event"
              @apply-preset="applyChatPreset"
              @save="saveChatConfig"
              @test="testChatConfig"
              @clear="clearChatConfig"
            />
          </UiCard>

          <UiCard class="settings-panel">
            <ProviderConfigForm
              kicker="Embedding"
              title="Embedding Provider"
              :configured="embeddingConfigured"
              :form="embeddingForm"
              :presets="embeddingPresets"
              :action-loading="aiActionLoading"
              :last-test-status="aiSettings?.embedding.lastTestStatus"
              :last-tested-at="aiSettings?.embedding.lastTestedAt"
              :last-test-error="aiSettings?.embedding.lastTestError"
              :dimension="aiSettings?.embedding.dimension"
              @update:form="embeddingForm = $event"
              @apply-preset="applyEmbeddingPreset"
              @save="saveEmbeddingConfig"
              @test="testEmbeddingConfig"
              @clear="clearEmbeddingConfig"
            />
          </UiCard>
        </section>

        <section v-else class="settings-panel-list">
          <div class="settings-toolbar">
            <UiSelect v-model="jobsStatus" :options="statusOptions" @change="applyJobFilters" />
            <div class="settings-search">
              <Search :size="15" />
              <UiInput
                v-model="jobsKeyword"
                placeholder="搜索文档标题"
                @keyup.enter="applyJobFilters"
              />
            </div>
            <UiButton variant="secondary" :disabled="jobsLoading" @click="loadJobs">
              <RefreshCw :size="15" />
              刷新
            </UiButton>
          </div>

          <UiCard class="jobs-table-card">
            <div v-if="jobsLoading" class="settings-loading">
              <LoaderCircle :size="18" />
              正在加载索引任务...
            </div>
            <div v-else-if="jobs.length === 0" class="settings-empty">
              <SettingsIcon :size="24" />
              <p>暂无索引任务</p>
            </div>
            <article
              v-for="job in jobs"
              v-else
              :key="job.id"
              class="job-row"
              :class="{ 'is-clickable': job.status === 'succeeded' }"
              :tabindex="job.status === 'succeeded' ? 0 : undefined"
              :role="job.status === 'succeeded' ? 'button' : undefined"
              @click="openJobChunks(job)"
              @keydown="handleJobRowKeydown($event, job)"
            >
              <div class="job-main">
                <div class="job-title-line">
                  <h3>{{ job.documentTitle }}</h3>
                  <UiBadge :variant="statusVariant(job.status)">
                    {{ statusLabel(job.status) }}
                  </UiBadge>
                </div>
                <p class="settings-muted">
                  {{ job.documentType }} · {{ job.model || '未记录模型' }} ·
                  {{ job.chunkCount }} 个片段 · {{ formatDate(job.createdAt) }}
                </p>
                <p v-if="job.errorMessage" class="settings-error">{{ job.errorMessage }}</p>
              </div>
              <div class="job-actions">
                <CheckCircle2 v-if="job.status === 'succeeded'" :size="18" />
                <span
                  v-if="job.status === 'succeeded'"
                  class="job-view-hint"
                >
                  <Rows3 :size="14" />
                  {{ jobChunksLoading && selectedJob?.id === job.id ? '加载中' : '查看分片' }}
                </span>
                <UiButton
                  v-if="job.status === 'failed'"
                  variant="secondary"
                  size="sm"
                  :disabled="Boolean(jobsActionLoading)"
                  @click="retryJob(job)"
                >
                  <RefreshCw :size="14" />
                  重试
                </UiButton>
              </div>
            </article>
          </UiCard>

          <div class="settings-pagination">
            <span>共 {{ jobsTotal }} 条</span>
            <div>
              <UiButton
                variant="secondary"
                size="sm"
                :disabled="jobsPage <= 1"
                @click="jobsPage -= 1; loadJobs()"
              >
                上一页
              </UiButton>
              <UiButton
                variant="secondary"
                size="sm"
                :disabled="jobs.length < pageSize"
                @click="jobsPage += 1; loadJobs()"
              >
                下一页
              </UiButton>
            </div>
          </div>
        </section>
      </main>
    </div>

    <UiDialog
      :open="chunkDialogOpen"
      :title="chunkDialogTitle"
      :description="chunkDialogDescription"
      panel-class="embedding-chunks-dialog-panel"
      @update:open="updateChunkDialogOpen"
    >
      <div v-if="jobChunksLoading" class="settings-loading embedding-chunks-loading">
        <LoaderCircle :size="18" />
        正在加载分片内容...
      </div>
      <div v-else-if="jobChunks?.chunks.length" class="embedding-chunks-dialog">
        <div class="embedding-chunks-summary">
          <UiBadge variant="success">成功</UiBadge>
          <span>
            {{ jobChunks.chunks.length }} / {{ jobChunks.job.chunkCount }} 个分片
          </span>
          <span v-if="jobChunks.job.dimension">{{ jobChunks.job.dimension }} 维</span>
        </div>

        <div class="embedding-chunk-list">
          <article
            v-for="chunk in jobChunks.chunks"
            :key="chunk.id"
            class="embedding-chunk-item"
          >
            <div class="embedding-chunk-header">
              <h3>分片 #{{ chunk.chunkIndex + 1 }}</h3>
              <span>{{ formatChunkMeta(chunk) }}</span>
            </div>
            <pre>{{ chunk.content }}</pre>
          </article>
        </div>
      </div>
      <div v-else class="settings-empty embedding-chunks-empty">
        <Rows3 :size="24" />
        <p>暂无分片内容</p>
      </div>

      <template #footer>
        <UiButton variant="secondary" @click="updateChunkDialogOpen(false)">关闭</UiButton>
      </template>
    </UiDialog>
  </main>
</template>
