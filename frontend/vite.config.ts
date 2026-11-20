import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/',
    plugins: [
      react(),
      // ── Auto-generate /public/version.json on every build ──────────────
      // This allows the useAppVersion hook to detect new deployments and
      // prompt users to refresh instead of requiring a manual hard refresh.
      {
        name: 'version-bump',
        apply: 'build',
        buildStart() {
          const version = new Date().toISOString().replace(/[:.]/g, '-');
          const outPath = path.resolve(__dirname, 'public/version.json');
          fs.writeFileSync(outPath, JSON.stringify({ version }, null, 2));
          console.log(`[version-bump] Build version: ${version}`);
        },
      },
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': { target: 'http://localhost:8080', changeOrigin: true },
        '/uploads': { target: 'http://localhost:8080', changeOrigin: true },
        '/welcomeTech_crm_staging/uploads': { target: 'http://localhost:8080', changeOrigin: true },
      },
    },
  };
});
