import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'Lumi',
    description: '保存网页到 Lumi 知识库',
    permissions: ['activeTab', 'scripting', 'storage', 'tabs'],
    host_permissions: ['<all_urls>'],
  },
});
