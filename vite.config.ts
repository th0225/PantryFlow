import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'PantryFlow',
        short_name: 'PantryFlow',
        description: '個人食材庫存與日常記帳',
        theme_color: '#1f5c4a',
        background_color: '#f7f5ef',
        display: 'standalone',
        lang: 'zh-Hant',
        icons: [
          {
            src: '/pantryflow-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
