import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import { fileURLToPath, URL } from 'node:url';

// Web keeps the normal modern Vite build. Tizen gets a dedicated legacy build
// because Samsung TV 6.0 may open packaged files through file:// and reject
// ES modules / newer JavaScript syntax.
export default defineConfig(({ mode }) => {
  const isTizen = mode === 'tizen';

  return {
    base: isTizen ? './' : '/',
    plugins: [
      react(),
      ...(isTizen
        ? [
            legacy({
              targets: ['chrome >= 69'],
              renderLegacyChunks: true,
              modernPolyfills: false,
            }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    build: {
      target: isTizen ? 'chrome69' : 'modules',
    },
    worker: isTizen
      ? {
          format: 'iife',
        }
      : undefined,
  };
});
