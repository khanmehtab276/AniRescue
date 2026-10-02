import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Keep the installed PWA on the newest deployed frontend instead of
      // waiting for a manual "Update" action.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        // Remove caches created by older PWA builds after the new worker
        // becomes active.
        cleanupOutdatedCaches: true,
        // Let the new worker take control immediately after installation.
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: 'AniRescue Emergency Platform',
        short_name: 'AniRescue',
        description: 'AI-Powered Animal Rescue & Volunteer Coordination',
        theme_color: '#059669',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
