<script setup lang="ts">
import { PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'
import UiButton from './Button.vue'
import { useSidebar } from '../../composables/useSidebar'

const { isSidebarCollapsed, toggleSidebar } = useSidebar()
</script>

<template>
  <UiButton
    variant="ghost"
    size="icon"
    class="sidebar-toggle"
    :title="isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
    :aria-label="isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
    @click="toggleSidebar"
  >
    <PanelLeftOpen v-if="isSidebarCollapsed" :size="14" />
    <PanelLeftClose v-else :size="14" />
  </UiButton>
</template>
