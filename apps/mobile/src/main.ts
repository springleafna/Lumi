import { createApp } from 'vue'
import { Lazyload } from 'vant'
import 'vant/es/toast/style'
import 'vant/es/dialog/style'
import 'vant/es/notify/style'
import './styles/base.css'
import './styles/reader.css'
import './styles/knowledge-chat.css'
import App from './App.vue'
import { router } from './router'

// 按需引入时 van-image 的 lazy-load 依赖 v-lazy 指令，需手动注册 Lazyload 插件。
createApp(App).use(router).use(Lazyload).mount('#app')
