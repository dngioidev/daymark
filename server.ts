import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './server/app';
import { DEV_DEFAULT_PASSWORD, loadConfig, passwordProblem } from './server/config';
import { FileStore } from './server/store';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// `npm start` passes --production so it works the same on Windows, macOS and Linux shells
if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';

/**
 * Daymark self-hosted server: REST sync API (server/app.ts) plus the web app
 * (Vite middleware in development, the built dist/ folder in production).
 */
async function startServer() {
  const config = loadConfig();

  if (config.production && config.initialPassword) {
    const problem = passwordProblem(config.initialPassword);
    if (problem) throw new Error(`DAYMARK_PASSWORD ${problem}.`);
  }

  const store = new FileStore(config.dataDir);
  const { createdAccount } = store.init(config.username, config.initialPassword);
  if (createdAccount) {
    console.log(`Created admin account "${config.username}" in ${config.dataDir}`);
    if (!config.production && config.initialPassword === DEV_DEFAULT_PASSWORD) {
      console.warn(`Development password is "${DEV_DEFAULT_PASSWORD}". Set DAYMARK_PASSWORD before deploying.`);
    }
  }

  const app = createApp(config, store);

  if (!config.production) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve(__dirname, 'dist');
    // Hashed assets can be cached forever; index.html and the service worker must revalidate
    app.use(
      express.static(dist, {
        setHeaders: (res, file) => {
          if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else res.setHeader('Cache-Control', 'no-cache');
        },
      })
    );
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Daymark server on port ${config.port} (data: ${config.dataDir})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Daymark server:', err.message || err);
  process.exit(1);
});
