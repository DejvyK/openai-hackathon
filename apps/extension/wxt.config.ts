import { defineConfig } from 'wxt';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // Resolve from this workspace, including when npm nests the module below apps/extension.
  modules: [pathToFileURL(createRequire(import.meta.url).resolve('@wxt-dev/module-react')).href],
  manifest: {
    name: 'AgentLayer',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: ['http://127.0.0.1/*'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_title: 'Activate AgentLayer on this page' },
  },
});
