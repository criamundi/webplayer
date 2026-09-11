import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import { fileURLToPath, URL } from 'node:url';

// Dedicated Samsung Tizen build. This config is never loaded by `npm run dev`
// or Bolt preview, so TV compatibility work cannot break the normal Web app.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    legacy({
      targets: ['chrome >= 69'],
      renderLegacyChunks: true,
      modernPolyfills: false,
    }),
  ],
  resolve: {
    alias: [
      {
        find: '@/lib/m3uWorker',
        replacement: fileURLToPath(new URL('./src/lib/m3uWorker.tizen.ts', import.meta.url)),
      },
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
    ],
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    target: 'chrome69',
  },
  worker: {
    format: 'iife',
  },
});
