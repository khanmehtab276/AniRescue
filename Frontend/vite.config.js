import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Update the installed PWA automatically when a new frontend is deployed.
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        // Remove caches created by older PWA builds after the new worker
        // becomes active.
        cleanupOutdatedCaches: true,
        // Take control immediately so the current build is used without
        // waiting for every old tab to close.
        skipWaiting: true,
        clientsClaim: true,
        // index.html is the app shell and must not be pinned in the
        // precache. It is fetched through NetworkFirst below instead.
        globIgnores: ['index.html'],
        runtimeCaching: [
          {
            // Firebase Hosting serves every SPA route from index.html.
            // NetworkFirst makes a normal refresh use the newest deployed
            // app shell whenever the network is available, while retaining
            // the cached shell as an offline fallback.
            urlPattern: /^https:\/\/anirescue-a5fd7\.web\.app(?:\/[^.?#]*)?(?:[?#].*)?$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'anirescue-document-cache',
              networkTimeoutSeconds: 5,
              cacheableResponse: {
                statuses: [200],
              },
            },
          },
        ],
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
