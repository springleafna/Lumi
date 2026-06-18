import { computed, onMounted, ref } from 'vue'
import { LumiApiError } from '@lumi/api-client'
import type {
  AiSettingsDto,
  UpdateAiProviderConfigRequest,
} from '@lumi/shared'
import { useToast } from './useToast'
import { client } from '../lib/client'

type ProviderForm = {
  providerPreset: string
  baseUrl: string
  model: string
  apiKey: string
}

const CHAT_PRESETS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'custom', label: 'OpenAI-Compatible' },
]

const EMBEDDING_PRESETS = [
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'custom', label: 'OpenAI-Compatible' },
]

/**
 * AI 配置中心的状态与操作：Chat / Embedding 两套 Provider 表单的加载、
 * 保存、测试、清除，以及 preset 选中后回填默认 base url。
 */
export function useAiSettings() {
  const { toast } = useToast()

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

  const chatConfigured = computed(() => aiSettings.value?.chat.configured)
  const embeddingConfigured = computed(() => aiSettings.value?.embedding.configured)

  onMounted(loadAiSettings)

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

  function toConfigPayload(form: ProviderForm): UpdateAiProviderConfigRequest {
    return {
      providerPreset: form.providerPreset,
      baseUrl: form.baseUrl,
      model: form.model,
      apiKey: form.apiKey || undefined,
    }
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

  function notifyError(error: unknown, fallback: string) {
    const message = error instanceof LumiApiError ? error.message : fallback
    toast({ title: fallback, description: message, variant: 'destructive' })
  }

  return {
    aiSettings,
    loading,
    actionLoading,
    chatForm,
    embeddingForm,
    chatConfigured,
    embeddingConfigured,
    chatPresets: CHAT_PRESETS,
    embeddingPresets: EMBEDDING_PRESETS,
    saveChatConfig,
    saveEmbeddingConfig,
    testChatConfig,
    testEmbeddingConfig,
    clearChatConfig,
    clearEmbeddingConfig,
    applyChatPreset,
    applyEmbeddingPreset,
  }
}
