import { computed, ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'

const MODE_KEY = 'lumi_theme_mode'

function readStoredMode(): ThemeMode {
  const raw = localStorage.getItem(MODE_KEY)
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

// 模块级单例：主题是全局状态，跨页面共享且在 main.ts 挂载前初始化。
const mode = ref<ThemeMode>(readStoredMode())
const systemDark = ref(
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false,
)

const resolved = computed<'light' | 'dark'>(() =>
  mode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : mode.value,
)

let initialized = false

/**
 * 三档外观（浅色 / 深色 / 跟随系统）。
 *
 * 深色类挂在 html 上（van-theme-dark + data-theme），Teleport 到 body 的
 * Toast / Dialog 同样继承深色变量；meta theme-color 同步给系统状态栏。
 */
export function useTheme() {
  function applyTheme() {
    const dark = resolved.value === 'dark'
    const root = document.documentElement
    root.classList.toggle('van-theme-dark', dark)
    root.dataset.theme = resolved.value
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#09090b' : '#ffffff')
  }

  function setMode(next: ThemeMode) {
    mode.value = next
    localStorage.setItem(MODE_KEY, next)
  }

  function init() {
    if (initialized) return
    initialized = true
    if (typeof window.matchMedia === 'function') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
        systemDark.value = event.matches
      })
    }
    watch(resolved, applyTheme, { immediate: true })
  }

  return { mode, resolved, setMode, init }
}
