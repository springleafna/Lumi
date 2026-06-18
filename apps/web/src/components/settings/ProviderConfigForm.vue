<script setup lang="ts">
import { KeyRound, RefreshCw, Trash2 } from 'lucide-vue-next'
import UiBadge from '../ui/Badge.vue'
import UiButton from '../ui/Button.vue'
import UiInput from '../ui/Input.vue'
import UiSelect from '../ui/Select.vue'

type ProviderForm = {
  providerPreset: string
  baseUrl: string
  model: string
  apiKey: string
}

defineProps<{
  kicker: string
  title: string
  configured?: boolean
  form: ProviderForm
  presets: Array<{ value: string; label: string }>
  actionLoading: string
  lastTestStatus?: string | null
  lastTestedAt?: string | null
  lastTestError?: string | null
  dimension?: number | null
}>()

const emit = defineEmits<{
  'update:form': [value: ProviderForm]
  applyPreset: [value: string]
  save: []
  test: []
  clear: []
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
  <div class="settings-panel-header">
    <div>
      <p class="kicker">{{ kicker }}</p>
      <h2>{{ title }}</h2>
    </div>
    <UiBadge :variant="configured ? 'neutral' : 'outline'">
      {{ configured ? '已配置' : '未配置' }}
    </UiBadge>
  </div>

  <form class="settings-form" @submit.prevent="emit('save')">
    <label class="field-group">
      <span>Provider</span>
      <UiSelect
        :model-value="form.providerPreset"
        :options="presets"
        @update:model-value="(value) => emit('applyPreset', value)"
      />
    </label>
    <label class="field-group">
      <span>Base URL</span>
      <UiInput
        :model-value="form.baseUrl"
        placeholder="https://api.example.com/v1"
        @update:model-value="(value) => emit('update:form', { ...form, baseUrl: value })"
      />
    </label>
    <label class="field-group">
      <span>Model</span>
      <UiInput
        :model-value="form.model"
        placeholder="deepseek-chat"
        @update:model-value="(value) => emit('update:form', { ...form, model: value })"
      />
    </label>
    <label class="field-group">
      <span>API Key</span>
      <UiInput
        :model-value="form.apiKey"
        placeholder="留空表示保留现有密钥"
        type="password"
        @update:model-value="(value) => emit('update:form', { ...form, apiKey: value })"
      />
    </label>
    <div class="settings-actions">
      <UiButton type="submit" :disabled="Boolean(actionLoading)">
        <KeyRound :size="15" />
        保存 {{ kicker }}
      </UiButton>
      <UiButton variant="secondary" :disabled="Boolean(actionLoading)" @click="emit('test')">
        <RefreshCw :size="15" />
        测试
      </UiButton>
      <UiButton variant="ghost" :disabled="Boolean(actionLoading)" @click="emit('clear')">
        <Trash2 :size="15" />
        清除
      </UiButton>
    </div>
    <p class="settings-muted">
      最近测试：
      {{ lastTestStatus || '未测试' }}
      <span v-if="dimension"> · {{ dimension }} 维</span>
      <span v-if="lastTestedAt"> · {{ formatDate(lastTestedAt) }}</span>
    </p>
    <p v-if="lastTestError" class="settings-error">
      {{ lastTestError }}
    </p>
  </form>
</template>
