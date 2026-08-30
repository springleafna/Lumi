<script setup lang="ts">
</script>

<template>
  <div class="tab-layout">
    <router-view />
    <van-tabbar route placeholder safe-area-inset-bottom>
      <van-tabbar-item replace to="/library">
        <template #icon="slotProps">
          <van-icon :name="slotProps.active ? 'notes' : 'notes-o'" />
        </template>
        文章库
      </van-tabbar-item>
      <van-tabbar-item replace to="/settings">
        <template #icon="slotProps">
          <van-icon :name="slotProps.active ? 'setting' : 'setting-o'" />
        </template>
        设置
      </van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<style scoped>
.tab-layout {
  min-height: 100%;
  background: var(--lumi-bg-page);
}

.tab-layout :deep(.van-tabbar-item) {
  position: relative;
}

.tab-layout :deep(.van-tabbar-item--active .van-tabbar-item__text) {
  font-weight: 600;
}
</style>
