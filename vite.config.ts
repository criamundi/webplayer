import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Standard Web/Bolt development configuration. Keep TV-only tooling out of
// this file so Bolt preview never depends on the Tizen legacy plugin.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
