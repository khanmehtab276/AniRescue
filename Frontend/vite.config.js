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
        // Keep index.html in the precache because it is the offline app
        // shell. Without it, direct navigation to SPA routes such as
        // /report can fail when the device has no network connection.
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Keep the exact MapLibre browser module available after it has
            // been loaded once. The map data itself lives in IndexedDB.
            urlPattern: /^https:\/\/unpkg\.com\/maplibre-gl@6\.12\.0\/dist\/maplibre-gl\.mjs$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'anirescue-map-runtime',
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
          {
            // Keep the exact PMTiles ESM runtime available for offline
            // rendering after it has been loaded once.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/pmtiles@4\.5\.0\/\+esm$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'anirescue-map-runtime',
              cacheableResponse: {
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
          {
            // Cache OpenStreetMap tiles as they are viewed so the same map
            // area remains available when the device later loses network.
            // CacheFirst is intentional: tiles are static and an offline
            // rescue report must not depend on a live tile server.
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'anirescue-map-tiles',
              cacheableResponse: {
                // 0 covers opaque cross-origin tile responses.
                statuses: [0, 200],
              },
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
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
        start_url: '/',
        scope: '/',
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
