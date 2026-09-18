import { ref } from 'vue'

const STORAGE_KEY = 'lumi:sidebar-collapsed'

function readInitial(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// 模块级单例：侧边栏收起状态跨页面共享，路由切换不重置
const isCollapsed = ref(readInitial())

export function useSidebar() {
  function toggle() {
    isCollapsed.value = !isCollapsed.value
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, isCollapsed.value ? '1' : '0')
    } catch {
      // 隐私模式等 localStorage 不可用时静默降级为会话内生效
    }
  }

  return { isSidebarCollapsed: isCollapsed, toggleSidebar: toggle }
}
