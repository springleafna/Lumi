<script setup lang="ts">
import type { SelectionToolbarState } from '../../composables/useReaderSelection'

defineProps<{
  state: SelectionToolbarState
}>()

const emit = defineEmits<{
  highlight: []
  note: []
}>()

/**
 * 动作在 pointer 落下阶段执行并阻止默认行为：
 * touchstart/mousedown 的默认行为会把选区收起，preventDefault 之后
 * 浏览器不再派发合成 click，因此不会重复触发。
 */
function onPress(action: 'highlight' | 'note') {
  if (action === 'highlight') emit('highlight')
  else emit('note')
}
</script>

<template>
  <div
    v-if="state.visible"
    class="selection-toolbar"
    :class="`is-${state.placement}`"
    :style="{ left: `${state.x}px`, top: `${state.y}px` }"
  >
    <button
      type="button"
      @touchstart.prevent="onPress('highlight')"
      @mousedown.prevent="onPress('highlight')"
    >
      高亮
    </button>
    <button
      type="button"
      @touchstart.prevent="onPress('note')"
      @mousedown.prevent="onPress('note')"
    >
      写批注
    </button>
  </div>
</template>
