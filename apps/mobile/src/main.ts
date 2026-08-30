import { createApp } from 'vue'
import { Lazyload } from 'vant'
import 'vant/es/toast/style'
import 'vant/es/dialog/style'
import 'vant/es/notify/style'
import 'vant/es/image-preview/style'
import './styles/base.css'
import './styles/reader.css'
import './styles/knowledge-chat.css'
import './styles/theme-dark.css'
import App from './App.vue'
import { router } from './router'
import { useTheme } from './composables/useTheme'

// 按需引入时 van-image 的 lazy-load 依赖 v-lazy 指令，需手动注册 Lazyload 插件。
// 主题要在挂载前应用，避免首帧闪浅色。
useTheme().init()
createApp(App).use(router).use(Lazyload).mount('#app')
