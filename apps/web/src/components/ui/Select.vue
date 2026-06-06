<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
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

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const selectedLabel = computed(
  () => props.options.find((option) => option.value === props.modelValue)?.label ?? '请选择',
)

function selectOption(value: string) {
  emit('update:modelValue', value)
  emit('change', value)
  open.value = false
}

function onDocumentClick(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) {
    open.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <div ref="root" class="ui-select">
    <button
      class="ui-select-trigger"
      type="button"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span>{{ selectedLabel }}</span>
      <ChevronDown class="ui-select-icon" :size="15" />
    </button>
    <div v-if="open" class="ui-select-content" role="listbox">
      <button
        v-for="option in options"
        :key="option.value"
        class="ui-select-option"
        :class="{ 'is-selected': option.value === modelValue }"
        type="button"
        role="option"
        :aria-selected="option.value === modelValue"
        @click="selectOption(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
