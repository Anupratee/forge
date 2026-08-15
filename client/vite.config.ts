import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The SPA calls the API at a relative /api path, so the deployed origin and local dev
    // behave identically and no base URL is baked into the bundle. /uploads is proxied for the
    // same reason: cover images and receipts are stored as relative paths, not absolute URLs.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
