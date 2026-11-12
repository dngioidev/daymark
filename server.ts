import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './server/app';
import { DEV_DEFAULT_PASSWORD, devFileDeny, loadConfig, passwordProblem } from './server/config';
import { FileStore } from './server/store';
import { createSiteGate, mountProductionWeb } from './server/gate';
import { AuditLog } from './server/mcp/audit';
import { acquireDataLock } from './server/mcp/lock';
import { McpStore } from './server/mcp/mcpStore';

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

  const releaseLock = acquireDataLock(config.dataDir, 'server');
  process.on('exit', releaseLock);
  const store = new FileStore(config.dataDir);
  const { createdAccount } = store.init(config.username, config.initialPassword);
  if (createdAccount) {
    console.log(`Created admin account "${config.username}" in ${config.dataDir}`);
    if (!config.production && config.initialPassword === DEV_DEFAULT_PASSWORD) {
      console.warn(`Development password is "${DEV_DEFAULT_PASSWORD}". Set DAYMARK_PASSWORD before deploying.`);
    }
  }

  const mcpStore = new McpStore(config.dataDir);
  mcpStore.init();
  // A fresh account must not inherit AI connections from an earlier one
  if (createdAccount) mcpStore.revokeAll();
  await mcpStore.persist();
  const audit = new AuditLog(path.join(config.dataDir, 'mcp-audit'));
  const pruneAudit = () => audit.prune(mcpStore.settings.auditRetentionDays).catch((err) => console.error('Audit prune failed:', err.message || err));
  void pruneAudit();
  setInterval(pruneAudit, 24 * 60 * 60 * 1000).unref();
  if (config.mcpEnabled && !config.publicUrl) console.warn('MCP disabled: set DAYMARK_PUBLIC_URL');

  const app = createApp(config, store, { store: mcpStore, audit });

  if (!config.production) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true, fs: { deny: devFileDeny(config.dataDir) } }, appType: 'spa' });
    const gate = createSiteGate(store, () => vite.transformIndexHtml('/signin.html', fs.readFileSync(path.join(__dirname, 'signin.html'), 'utf8')));
    app.use((req, res, next) => {
      // Vite injects these extensionless script URLs into the sign-in page.
      if (req.path === '/@vite/client' || req.path === '/@react-refresh') return next();
      gate(req, res, next);
    });
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve(__dirname, 'dist');
    mountProductionWeb(app, store, dist);
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`Daymark server on port ${config.port} (data: ${config.dataDir})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Daymark server:', err.message || err);
  process.exit(1);
});
