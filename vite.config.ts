import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';

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
    // Register plugins. The order matters: React first, SSL second.
    plugins: [
      react(),
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
        '@': path.resolve(__dirname, '.'),
      },
    },
    // Development server configuration. Expose the server on all network
    // interfaces and enable HTTPS. The port is set to 3000.
    server: {
      port: 3000,
      host: true,
      https: true,
    },
  };
});