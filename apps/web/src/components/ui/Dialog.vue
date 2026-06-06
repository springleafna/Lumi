<script setup lang="ts">
import { X } from 'lucide-vue-next'
import UiButton from './Button.vue'

defineProps<{
  open: boolean
  title: string
  description?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

function close() {
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="open" class="ui-dialog-backdrop" @click.self="close">
        <section class="ui-dialog-panel" role="dialog" aria-modal="true">
          <UiButton class="ui-dialog-close" variant="ghost" size="icon" title="关闭" @click="close">
            <X :size="17" />
          </UiButton>
          <div class="ui-dialog-header">
            <h2>{{ title }}</h2>
            <p v-if="description">{{ description }}</p>
          </div>
          <div class="ui-dialog-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="ui-dialog-footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
