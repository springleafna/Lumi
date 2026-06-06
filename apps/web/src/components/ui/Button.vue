<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    type?: 'button' | 'submit' | 'reset'
    variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
    size?: 'default' | 'sm' | 'lg' | 'icon'
  }>(),
  {
    type: 'button',
    variant: 'default',
    size: 'default',
  },
)

const classes = computed(() => [
  'ui-button',
  `ui-button--${props.variant}`,
  `ui-button--size-${props.size}`,
])
</script>

<template>
  <button :type="type" :class="classes">
    <slot />
  </button>
</template>
