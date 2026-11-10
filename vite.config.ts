import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { sourceDefines } from './scripts/kit/source';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      // 'prompt' so lib/pwa.ts decides when to switch (never mid-form); it reloads on its own.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ratio',
        short_name: 'Ratio',
        description: 'A coffee brewing log.',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: '#f5eee3',
        background_color: '#f5eee3',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Push notifications (Selfhost Kit: public/kit-push-sw.js).
        importScripts: ['kit-push-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Pages are network-first (below), so a deploy shows up on the next load instead of
        // after the service worker updates. index.html stays precached only as the offline copy.
        navigateFallback: null,
        directoryIndex: null,
        cleanupOutdatedCaches: true,
        // Take over on first install (offline from the first visit). Updates still wait for
        // lib/pwa.ts to say when (skipWaiting is sent as a message).
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              request.mode === 'navigate' &&
              !/^\/(api|mcp|authorize|oauth|\.well-known|upload)(\/|$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ratio-pages',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 10 },
              cacheableResponse: { statuses: [200] },
              precacheFallback: { fallbackURL: '/index.html' },
            },
          },
          {
            // The last-seen log stays readable offline.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname === '/api/state',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ratio-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 5, maxAgeSeconds: 30 * 86400 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Image ids never change content, so cached copies are always right.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.pathname.startsWith('/api/images/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ratio-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 365 * 86400 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), ...sourceDefines() },
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) },
  },
});
