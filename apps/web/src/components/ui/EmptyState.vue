<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="ui-empty">
    <div v-if="$slots.icon" class="ui-empty-icon">
      <slot name="icon" />
    </div>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.actions" class="ui-empty-actions">
      <slot name="actions" />
    </div>
  </div>
</template>
