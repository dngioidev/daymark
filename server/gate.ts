import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { REFRESH_COOKIE } from '../src/sync/protocol';
import { checkRefreshToken } from './app';
import { parseCookies } from './auth';
import { FileStore } from './store';

export function mountProductionWeb(app: express.Express, store: FileStore, dist: string): void {
  const signInPage = fs.readFileSync(path.join(dist, 'signin.html'), 'utf8');
  app.use(createSiteGate(store, () => signInPage));
  // Hashed assets can be cached forever; index.html and the service worker must revalidate
  const serveStatic = express.static(dist, {
    index: false,
    setHeaders: (res, file) => {
      if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    },
  });
  app.use((req, res, next) => {
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(req.path).toLowerCase();
    } catch {
      return res.sendStatus(400);
    }
    // Static serving must never be an alternate route to the app shell.
    if (/\.html?$/.test(decodedPath) && decodedPath !== '/signin.html') return next();
    if (decodedPath === '/signin.html') res.set('X-Daymark-Sign-In', '1');
    serveStatic(req, res, next);
  });
  app.get('*', createRefreshGate(store, () => signInPage), (_req, res) => {
    res.set('Cache-Control', 'no-cache').sendFile(path.join(dist, 'index.html'));
  });
}

function createRefreshGate(store: FileStore, signInPage: () => string | Promise<string>): express.RequestHandler {
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[REFRESH_COOKIE];
    if (token && checkRefreshToken(store, token)) return next();
    Promise.resolve().then(signInPage).then((html) => {
      res.status(401).set({ 'Cache-Control': 'no-store', 'X-Daymark-Sign-In': '1' }).type('html').send(html);
    }).catch(next);
  };
}

export function createSiteGate(store: FileStore, signInPage: () => string | Promise<string>): express.RequestHandler {
  const requireRefresh = createRefreshGate(store, signInPage);
  return (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/')) return next();
    if (req.path === '/signin.html') {
      res.set('X-Daymark-Sign-In', '1');
      return next();
    }
    if (req.path !== '/' && !req.path.endsWith('.html') && path.extname(req.path)) return next();
    requireRefresh(req, res, next);
  };
}
