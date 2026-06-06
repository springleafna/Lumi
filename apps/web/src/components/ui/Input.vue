<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null
    modelModifiers?: Record<string, boolean>
  }>(),
  {
    modelValue: '',
    modelModifiers: () => ({}),
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onInput(event: Event) {
  let value = (event.target as HTMLInputElement).value
  if (props.modelModifiers.trim) {
    value = value.trim()
  }
  emit('update:modelValue', value)
}
</script>

<template>
  <input class="ui-input" :value="modelValue ?? ''" @input="onInput" />
</template>
