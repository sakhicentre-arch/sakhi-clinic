import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sakhi Clinic',
        short_name: 'Sakhi',
        description: 'Professional homeopathic clinic management system',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        display_override: ['standalone', 'fullscreen'],
        scope: '/',
        start_url: '/',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/img/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/img/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
        categories: ['medical', 'productivity'],
        screenshots: [
          {
            src: '/img/screenshots/screenshot-540x720.png',
            sizes: '540x720',
            type: 'image/png',
          },
          {
            src: '/img/screenshots/screenshot-1280x720.png',
            sizes: '1280x720',
            type: 'image/png',
          },
        ],
        shortcuts: [
          {
            name: 'Open Today',
            short_name: 'Today',
            description: 'Open today’s clinic board',
            url: '/?source=shortcut-today',
            icons: [
              {
                src: '/img/icons/icon-192x192.png',
                sizes: '192x192',
                type: 'image/png',
              },
            ],
          },
          {
            name: 'View Patients',
            short_name: 'Patients',
            description: 'Open the patient list',
            url: '/?source=shortcut-patients',
            icons: [
              {
                src: '/img/icons/icon-192x192.png',
                sizes: '192x192',
                type: 'image/png',
              },
            ],
          },
        ],
      },
      workbox: {
        // App shell caching strategy - only cache app infrastructure, not medical data
        globPatterns: ['**/*.{js,css,html}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/web\.whatsapp\.com\//,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\.(png|jpg|svg|gif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
        ],
        // Do NOT cache IndexedDB data or API responses
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false, // PWA disabled during dev
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || 'dev'),
  },
})