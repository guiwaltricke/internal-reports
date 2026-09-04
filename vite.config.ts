import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

// firebase-applet-config.json is injected by AI Studio at runtime and is
// gitignored, so it is absent on CI and on Vercel. Fall back to a committed file
// of empty strings there; the real values then come from VITE_FIREBASE_* env vars.
const appletConfigPath = ['firebase-applet-config.json', 'firebase-applet-config.default.json']
  .map((f) => path.resolve(__dirname, f))
  .find((p) => fs.existsSync(p))!;

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'virtual:firebase-applet-config': appletConfigPath,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
