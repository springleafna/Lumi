<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import UiInput from './Input.vue'

defineProps<{
  modelValue?: string | number | null
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <label class="ui-search">
    <Search :size="17" />
    <UiInput
      :model-value="modelValue"
      :placeholder="placeholder"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </label>
</template>
