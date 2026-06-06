<script setup lang="ts">
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-vue-next'
import { useToast } from '../../composables/useToast'
import UiButton from './Button.vue'

const { toasts, dismissToast } = useToast()
</script>

<template>
  <Teleport to="body">
    <TransitionGroup class="ui-toaster" name="toast" tag="ol">
      <li
        v-for="item in toasts"
        :key="item.id"
        class="ui-toast"
        :class="`ui-toast--${item.variant}`"
      >
        <CheckCircle2 v-if="item.variant === 'success'" :size="18" />
        <AlertCircle v-else-if="item.variant === 'destructive'" :size="18" />
        <Info v-else :size="18" />
        <div>
          <strong>{{ item.title }}</strong>
          <p v-if="item.description">{{ item.description }}</p>
        </div>
        <UiButton variant="ghost" size="icon" title="关闭" @click="dismissToast(item.id)">
          <X :size="15" />
        </UiButton>
      </li>
    </TransitionGroup>
  </Teleport>
</template>
