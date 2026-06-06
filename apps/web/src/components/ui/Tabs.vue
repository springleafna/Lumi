<script setup lang="ts">
defineProps<{
  modelValue: string
  items: Array<{
    value: string
    label: string
    count?: number
  }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="ui-tabs" role="tablist">
    <button
      v-for="item in items"
      :key="item.value"
      class="ui-tab"
      :class="{ 'is-active': modelValue === item.value }"
      type="button"
      role="tab"
      :aria-selected="modelValue === item.value"
      @click="emit('update:modelValue', item.value)"
    >
      <span>{{ item.label }}</span>
      <small v-if="typeof item.count === 'number'">{{ item.count }}</small>
    </button>
  </div>
</template>
