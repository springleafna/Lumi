<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'neutral' | 'strong' | 'success' | 'destructive' | 'outline'
  }>(),
  {
    variant: 'neutral',
  },
)

const classes = computed(() => ['ui-badge', `ui-badge--${props.variant}`])
</script>

<template>
  <span :class="classes">
    <slot />
  </span>
</template>
