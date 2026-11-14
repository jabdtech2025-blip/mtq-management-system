import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'generateSW',
        registerType: 'prompt',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'icons/apple-touch-icon.png',
          'icons/icon-192x192.png',
          'icons/icon-512x512.png',
          'icons/icon-maskable-512x512.png'
        ],
        manifest: {
          id: '/',
          name: 'Manajemen MTQ',
          short_name: 'MTQ',
          description:
            'Platform manajemen MTQ multi-tenant dengan portal penjurian mandiri, mushaf digital beranotasi kanvas, dan rekapitulasi nilai real-time.',
          lang: 'id',
          start_url: '/app',
          scope: '/',
          display: 'standalone',
          theme_color: '#065f46',
          background_color: '#f8fafc',
          icons: [
            {
              src: '/icons/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/icons/icon-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/],
          runtimeCaching: [
            // PENTING: Jangan pernah meng-cache permintaan ke *.supabase.co, /functions/v1/, atau API data apa pun
            {
              urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/.*/i,
              handler: 'NetworkOnly'
            },
            {
              urlPattern: /\/functions\/v1\/.*/i,
              handler: 'NetworkOnly'
            },
            {
              urlPattern: /\/rest\/v1\/.*/i,
              handler: 'NetworkOnly'
            },
            {
              urlPattern: /\/auth\/v1\/.*/i,
              handler: 'NetworkOnly'
            },
            {
              urlPattern: /^\/api\/.*/i,
              handler: 'NetworkOnly'
            },
            // Hanya font statis yang boleh di-cache
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-stylesheets',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            // Halaman mushaf lokal (public/mushaf/*.webp, opsional). Hanya respons 200 yang disimpan,
            // dan isinya diperbarui di latar agar penambahan file baru tetap terbaca.
            {
              urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/mushaf/'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'mushaf-lokal',
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 60 * 60 * 24 * 60
                },
                cacheableResponse: {
                  statuses: [200]
                }
              }
            },
            // Halaman mushaf dari pihak ketiga (cadangan). Disimpan agar tetap tampil saat Wi-Fi putus.
            // Respons lintas-domain bersifat "opaque" (status 0) dan memakan kuota lebih besar, jadi dibatasi.
            {
              urlPattern: /^https:\/\/(android\.quran\.com|everyayah\.com)\/.*\.png$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'mushaf-pihak-ketiga',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 60
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: true,
          type: 'module'
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.')
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {}
    }
  };
});
