import path from 'path';
import { defineConfig, loadEnv, splitVendorChunkPlugin } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import type { UserConfig as VitestUserConfig } from 'vitest/config';

//
// This Vite configuration enables React support and sets up a self‑signed
// HTTPS server so that WebGPU and other secure‑context APIs are available.
// The `basicSsl` plugin automatically generates and caches a certificate.
//
export default defineConfig(({ mode }) => {
  // Load environment variables for the given mode. Vite will look for
  // files like `.env` and `.env.local` in the project root.
  const env = loadEnv(mode, '.', '');
  return {
    // Host the app from the domain root when deployed to GitHub Pages.
    base: '/',
    // Register plugins. The order matters: React first, SSL second.
    plugins: [
      react(),
      // Split vendor chunks automatically for better long‑term caching.
      splitVendorChunkPlugin(),
      basicSsl(),
    ],
    // Define runtime constants so that references to process.env variables
    // don’t get inlined to undefined when building for the browser.
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    // Configure module resolution aliases. Using `@` as a shorthand for the
    // project root makes imports cleaner throughout the codebase.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@/services': path.resolve(__dirname, 'src/services'),
        '@/brain': path.resolve(__dirname, 'src/brain'),
        '@/components': path.resolve(__dirname, 'src/components'),
        '@/screens': path.resolve(__dirname, 'src/screens'),
        '@/context': path.resolve(__dirname, 'src/context'),
        '@/config': path.resolve(__dirname, 'src/config'),
      },
    },
    // Development server configuration. Expose the server on all network
    // interfaces and enable HTTPS. The port is set to 3000.
    server: {
      port: 3000,
      host: true,
      https: true,
    },

    // Production output tuning for static hosting and Tauri wrapping.
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react')) return 'react-vendor';
              return 'vendor';
            }
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './vitest.setup.ts',
    } satisfies VitestUserConfig['test'],
  };
});
