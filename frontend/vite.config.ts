import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The API is proxied under the same origin as the storefront, so the HttpOnly
// SameSite session cookies work in development exactly as in production
// (where a reverse proxy serves both). https://vite.dev/config/server-options#server-proxy
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000', changeOrigin: false },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
