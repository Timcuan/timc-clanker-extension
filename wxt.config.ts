import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  browser: 'chrome',
  manifest: {
    name: 'Clanker Token Deployer',
    version: '1.0.0',
    permissions: ['storage', 'activeTab', 'scripting', 'alarms'],
    host_permissions: [
      'https://api.pinata.cloud/*',
      'https://clanker.world/*',
      'https://*.twimg.com/*',
      'https://*.farcaster.xyz/*',
      '*://*/*',
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
    build: {
      target: 'es2022',
    },
    resolve: {
      alias: {
        'react':             'preact/compat',
        'react-dom':         'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
      },
    },
  }),
});
