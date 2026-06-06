<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'

defineProps<{
  modelValue: string
  options: Array<{
    value: string
    label: string
  }>
  ariaLabel?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<template>
  <label class="ui-select">
    <select
      class="ui-select-native"
      :aria-label="ariaLabel"
      :value="modelValue"
      @change="onChange"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
    <ChevronDown class="ui-select-icon" :size="15" />
  </label>
</template>
