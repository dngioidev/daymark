import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/** Emits /asset-manifest.json (every built JS/CSS file) so the service worker can precache lazy chunks too. */
const assetManifest = (): Plugin => ({
  name: 'daymark-asset-manifest',
  apply: 'build',
  generateBundle(_options, bundle) {
    const files = Object.keys(bundle)
      .filter((f) => f.startsWith('assets/'))
      .map((f) => `/${f}`);
    this.emitFile({ type: 'asset', fileName: 'asset-manifest.json', source: JSON.stringify(files) });
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), assetManifest()],
    build: {
      rollupOptions: {
        input: { main: 'index.html', signin: 'signin.html' },
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
