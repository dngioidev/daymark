import type { Request, Response } from 'express';
import type { FileStore } from './store';

export const EVENTS_HEARTBEAT_MS = 25_000;
export const EVENTS_DEBOUNCE_MS = 300;

/**
 * GET /api/events: a Server-Sent Events stream that tells an open, signed-in page the vault changed,
 * so it syncs right away instead of waiting for its timer. Events carry only the new `rev`, never data.
 * `stillAllowed` is re-checked on every heartbeat, so a stream ends when its access token expires or
 * the device is revoked; the client reconnects with a fresh token.
 */
export function vaultEventsHandler(store: FileStore, stillAllowed: (req: Request) => boolean, opts = { heartbeatMs: EVENTS_HEARTBEAT_MS, debounceMs: EVENTS_DEBOUNCE_MS }) {
  return (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx-style proxies must not buffer the stream
    });
    res.flushHeaders();
    const send = (text: string) => { res.write(text); };
    send(`retry: 5000\nevent: ready\ndata: ${JSON.stringify({ rev: store.vault.rev })}\n\n`);

    let pending: ReturnType<typeof setTimeout> | null = null;
    let latest = 0;
    const unsubscribe = store.onVaultRev(rev => {
      latest = Math.max(latest, rev);
      // Coalesce bursts (a sync batch, several AI tool calls) into one event.
      pending ??= setTimeout(() => { pending = null; send(`event: changed\ndata: ${JSON.stringify({ rev: latest })}\n\n`); }, opts.debounceMs);
    });
    const heartbeat = setInterval(() => {
      if (!stillAllowed(req)) return close();
      send(': ping\n\n');
    }, opts.heartbeatMs);

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      if (pending) clearTimeout(pending);
      unsubscribe();
      res.end();
    }
    req.on('close', close);
  };
}
