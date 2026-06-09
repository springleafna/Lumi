<script setup lang="ts">
import {
  Bot,
  CheckCircle2,
  FileText,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Trash2,
  XCircle,
} from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LumiApiError } from '@lumi/api-client'
import type {
  AiSettingsDto,
  DocumentEmbeddingJobDto,
  DocumentEmbeddingStatus,
  UpdateAiProviderConfigRequest,
} from '@lumi/shared'
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import UiCard from '../components/ui/Card.vue'
import UiInput from '../components/ui/Input.vue'
import UiSelect from '../components/ui/Select.vue'
import UiTabs from '../components/ui/Tabs.vue'
import { useToast } from '../composables/useToast'
import lumiLogo from '../assets/lumi-logo.svg'
import { client } from '../lib/client'

type SettingsTab = 'ai' | 'jobs'

type ProviderForm = {
  providerPreset: string
  baseUrl: string
  model: string
  apiKey: string
}

const route = useRoute()
const router = useRouter()
const { toast } = useToast()

const tabs = [
  { value: 'ai', label: 'AI 设置' },
  { value: 'jobs', label: '索引任务' },
]

const chatPresets = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'custom', label: 'OpenAI-Compatible' },
]

const embeddingPresets = [
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'custom', label: 'OpenAI-Compatible' },
]

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'succeeded', label: '成功' },
  { value: 'failed', label: '失败' },
]

const currentTab = ref<SettingsTab>(normalizeTab(route.query.tab))
const aiSettings = ref<AiSettingsDto | null>(null)
const loading = ref(false)
const actionLoading = ref('')
const chatForm = ref<ProviderForm>({
  providerPreset: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: '',
})
const embeddingForm = ref<ProviderForm>({
  providerPreset: 'siliconflow',
  baseUrl: 'https://api.siliconflow.cn/v1',
  model: '',
  apiKey: '',
})

const jobs = ref<DocumentEmbeddingJobDto[]>([])
const jobsTotal = ref(0)
const jobsLoading = ref(false)
const jobsStatus = ref('')
const jobsKeyword = ref('')
const jobsPage = ref(1)

const chatConfigured = computed(() => aiSettings.value?.chat.configured)
const embeddingConfigured = computed(() => aiSettings.value?.embedding.configured)

onMounted(async () => {
  await Promise.all([loadAiSettings(), loadJobs()])
})

watch(
  () => route.query.tab,
  (value) => {
    currentTab.value = normalizeTab(value)
  },
)

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

async function loadAiSettings() {
  loading.value = true
  try {
    const settings = await client.settings.getAiSettings()
    aiSettings.value = settings
    applySettingsToForms(settings)
  } catch (error) {
    notifyError(error, 'AI 设置加载失败')
  } finally {
    loading.value = false
  }
}

function applySettingsToForms(settings: AiSettingsDto) {
  if (settings.chat.baseUrl || settings.chat.model) {
    chatForm.value = {
      providerPreset: settings.chat.providerPreset || 'custom',
      baseUrl: settings.chat.baseUrl || '',
      model: settings.chat.model || '',
      apiKey: '',
    }
  }
  if (settings.embedding.baseUrl || settings.embedding.model) {
    embeddingForm.value = {
      providerPreset: settings.embedding.providerPreset || 'custom',
      baseUrl: settings.embedding.baseUrl || '',
      model: settings.embedding.model || '',
      apiKey: '',
    }
  }
}

async function saveChatConfig() {
  await runAction('chat-save', 'Chat 配置保存失败', async () => {
    aiSettings.value = await client.settings.updateChatConfig(toConfigPayload(chatForm.value))
    chatForm.value.apiKey = ''
    toast({ title: 'Chat 配置已保存', variant: 'success' })
  })
}

async function saveEmbeddingConfig() {
  await runAction('embedding-save', 'Embedding 配置保存失败', async () => {
    aiSettings.value = await client.settings.updateEmbeddingConfig(
      toConfigPayload(embeddingForm.value),
    )
    embeddingForm.value.apiKey = ''
    toast({ title: 'Embedding 配置已保存', variant: 'success' })
  })
}

async function testChatConfig() {
  await runAction('chat-test', 'Chat 测试失败', async () => {
    const result = await client.settings.testChatConfig()
    await loadAiSettings()
    toast({
      title: result.status === 'succeeded' ? 'Chat 连接成功' : 'Chat 连接失败',
      description: result.message || undefined,
      variant: result.status === 'succeeded' ? 'success' : 'destructive',
    })
  })
}

async function testEmbeddingConfig() {
  await runAction('embedding-test', 'Embedding 测试失败', async () => {
    const result = await client.settings.testEmbeddingConfig()
    await loadAiSettings()
    toast({
      title: result.status === 'succeeded' ? 'Embedding 连接成功' : 'Embedding 连接失败',
      description: result.message || undefined,
      variant: result.status === 'succeeded' ? 'success' : 'destructive',
    })
  })
}

async function clearChatConfig() {
  if (!window.confirm('确认清除 Chat 配置吗？')) return
  await runAction('chat-clear', 'Chat 配置清除失败', async () => {
    aiSettings.value = await client.settings.clearChatConfig()
    toast({ title: 'Chat 配置已清除', variant: 'success' })
  })
}

async function clearEmbeddingConfig() {
  if (!window.confirm('确认清除 Embedding 配置吗？')) return
  await runAction('embedding-clear', 'Embedding 配置清除失败', async () => {
    aiSettings.value = await client.settings.clearEmbeddingConfig()
    toast({ title: 'Embedding 配置已清除', variant: 'success' })
  })
}

function toConfigPayload(form: ProviderForm): UpdateAiProviderConfigRequest {
  return {
    providerPreset: form.providerPreset,
    baseUrl: form.baseUrl,
    model: form.model,
    apiKey: form.apiKey || undefined,
  }
}

function applyChatPreset(value: string) {
  if (value === 'deepseek') {
    chatForm.value.baseUrl = 'https://api.deepseek.com'
    chatForm.value.model = chatForm.value.model || 'deepseek-chat'
  }
  if (value === 'siliconflow') {
    chatForm.value.baseUrl = 'https://api.siliconflow.cn/v1'
  }
}

function applyEmbeddingPreset(value: string) {
  if (value === 'siliconflow') {
    embeddingForm.value.baseUrl = 'https://api.siliconflow.cn/v1'
  }
}

function normalizeTab(value: unknown): SettingsTab {
  return value === 'jobs' ? 'jobs' : 'ai'
}

async function loadJobs() {
  jobsLoading.value = true
  try {
    const result = await client.embeddingJobs.list({
      status: (jobsStatus.value || undefined) as DocumentEmbeddingStatus | undefined,
      keyword: jobsKeyword.value || undefined,
      page: jobsPage.value,
      pageSize: 20,
    })
    jobs.value = result.items
    jobsTotal.value = result.total
  } catch (error) {
    notifyError(error, '索引任务加载失败')
  } finally {
    jobsLoading.value = false
  }
}

async function retryJob(job: DocumentEmbeddingJobDto) {
  await runAction(`retry-${job.id}`, '索引任务重试失败', async () => {
    await client.embeddingJobs.retry(job.id)
    toast({ title: '已重新加入索引队列', variant: 'success' })
    await loadJobs()
  })
}

async function applyJobFilters() {
  jobsPage.value = 1
  await loadJobs()
}

async function runAction(name: string, fallback: string, action: () => Promise<void>) {
  actionLoading.value = name
  try {
    await action()
  } catch (error) {
    notifyError(error, fallback)
  } finally {
    actionLoading.value = ''
  }
}

function statusLabel(status: DocumentEmbeddingStatus) {
  if (status === 'pending') return '待处理'
  if (status === 'processing') return '处理中'
  if (status === 'succeeded') return '成功'
  return '失败'
}

function statusVariant(status: DocumentEmbeddingStatus) {
  if (status === 'failed') return 'destructive'
  return 'neutral'
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

function notifyError(error: unknown, fallback: string) {
  const message = error instanceof LumiApiError ? error.message : fallback
  toast({ title: fallback, description: message, variant: 'destructive' })
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
            <div class="settings-panel-header">
              <div>
                <p class="kicker">Chat</p>
                <h2>Chat Provider</h2>
              </div>
              <UiBadge :variant="chatConfigured ? 'neutral' : 'outline'">
                {{ chatConfigured ? '已配置' : '未配置' }}
              </UiBadge>
            </div>

            <form class="settings-form" @submit.prevent="saveChatConfig">
              <label class="field-group">
                <span>Provider</span>
                <UiSelect
                  v-model="chatForm.providerPreset"
                  :options="chatPresets"
                  @change="applyChatPreset"
                />
              </label>
              <label class="field-group">
                <span>Base URL</span>
                <UiInput v-model="chatForm.baseUrl" placeholder="https://api.example.com/v1" />
              </label>
              <label class="field-group">
                <span>Model</span>
                <UiInput v-model="chatForm.model" placeholder="deepseek-chat" />
              </label>
              <label class="field-group">
                <span>API Key</span>
                <UiInput
                  v-model="chatForm.apiKey"
                  placeholder="留空表示保留现有密钥"
                  type="password"
                />
              </label>
              <div class="settings-actions">
                <UiButton type="submit" :disabled="Boolean(actionLoading)">
                  <KeyRound :size="15" />
                  保存 Chat
                </UiButton>
                <UiButton variant="secondary" :disabled="Boolean(actionLoading)" @click="testChatConfig">
                  <RefreshCw :size="15" />
                  测试
                </UiButton>
                <UiButton variant="ghost" :disabled="Boolean(actionLoading)" @click="clearChatConfig">
                  <Trash2 :size="15" />
                  清除
                </UiButton>
              </div>
              <p class="settings-muted">
                最近测试：
                {{ aiSettings?.chat.lastTestStatus || '未测试' }}
                <span v-if="aiSettings?.chat.lastTestedAt"> · {{ formatDate(aiSettings.chat.lastTestedAt) }}</span>
              </p>
              <p v-if="aiSettings?.chat.lastTestError" class="settings-error">
                {{ aiSettings.chat.lastTestError }}
              </p>
            </form>
          </UiCard>

          <UiCard class="settings-panel">
            <div class="settings-panel-header">
              <div>
                <p class="kicker">Embedding</p>
                <h2>Embedding Provider</h2>
              </div>
              <UiBadge :variant="embeddingConfigured ? 'neutral' : 'outline'">
                {{ embeddingConfigured ? '已配置' : '未配置' }}
              </UiBadge>
            </div>

            <form class="settings-form" @submit.prevent="saveEmbeddingConfig">
              <label class="field-group">
                <span>Provider</span>
                <UiSelect
                  v-model="embeddingForm.providerPreset"
                  :options="embeddingPresets"
                  @change="applyEmbeddingPreset"
                />
              </label>
              <label class="field-group">
                <span>Base URL</span>
                <UiInput v-model="embeddingForm.baseUrl" placeholder="https://api.example.com/v1" />
              </label>
              <label class="field-group">
                <span>Model</span>
                <UiInput v-model="embeddingForm.model" placeholder="BAAI/bge-m3" />
              </label>
              <label class="field-group">
                <span>API Key</span>
                <UiInput
                  v-model="embeddingForm.apiKey"
                  placeholder="留空表示保留现有密钥"
                  type="password"
                />
              </label>
              <div class="settings-actions">
                <UiButton type="submit" :disabled="Boolean(actionLoading)">
                  <KeyRound :size="15" />
                  保存 Embedding
                </UiButton>
                <UiButton
                  variant="secondary"
                  :disabled="Boolean(actionLoading)"
                  @click="testEmbeddingConfig"
                >
                  <RefreshCw :size="15" />
                  测试
                </UiButton>
                <UiButton
                  variant="ghost"
                  :disabled="Boolean(actionLoading)"
                  @click="clearEmbeddingConfig"
                >
                  <Trash2 :size="15" />
                  清除
                </UiButton>
              </div>
              <p class="settings-muted">
                最近测试：
                {{ aiSettings?.embedding.lastTestStatus || '未测试' }}
                <span v-if="aiSettings?.embedding.dimension">
                  · {{ aiSettings.embedding.dimension }} 维
                </span>
                <span v-if="aiSettings?.embedding.lastTestedAt">
                  · {{ formatDate(aiSettings.embedding.lastTestedAt) }}
                </span>
              </p>
              <p v-if="aiSettings?.embedding.lastTestError" class="settings-error">
                {{ aiSettings.embedding.lastTestError }}
              </p>
            </form>
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
            <article v-for="job in jobs" v-else :key="job.id" class="job-row">
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
                <UiButton
                  v-if="job.status === 'failed'"
                  variant="secondary"
                  size="sm"
                  :disabled="Boolean(actionLoading)"
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
                :disabled="jobs.length < 20"
                @click="jobsPage += 1; loadJobs()"
              >
                下一页
              </UiButton>
            </div>
          </div>
        </section>
      </main>
    </div>
  </main>
</template>
