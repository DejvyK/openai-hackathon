import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'AgentLayer',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['http://127.0.0.1/*'],
    action: { default_title: 'Activate AgentLayer on this page' },
  },
});
