import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.lumi.app',
  appName: 'Lumi',
  webDir: 'dist',
  server: {
    // WebView 内固定走 https 源，配合服务端 CORS 的 Capacitor 白名单。
    androidScheme: 'https',
  },
}

export default config
