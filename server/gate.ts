import express from 'express';
import path from 'node:path';
import { REFRESH_COOKIE } from '../src/sync/protocol';
import { checkRefreshToken } from './app';
import { parseCookies } from './auth';
import { FileStore } from './store';

export function createSiteGate(store: FileStore, signInPage: () => string | Promise<string>): express.RequestHandler {
  return (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/')) return next();
    if (req.path === '/signin.html') {
      res.set('X-Daymark-Sign-In', '1');
      return next();
    }
    if (req.path !== '/' && !req.path.endsWith('.html') && path.extname(req.path)) return next();
    const token = parseCookies(req.headers.cookie)[REFRESH_COOKIE];
    if (token && checkRefreshToken(store, token)) return next();
    Promise.resolve().then(signInPage).then((html) => {
      res.status(401).set({ 'Cache-Control': 'no-store', 'X-Daymark-Sign-In': '1' }).type('html').send(html);
    }).catch(next);
  };
}
