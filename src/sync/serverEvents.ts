/**
 * Reads the server's /api/events stream with fetch (EventSource cannot send the Bearer token).
 * Calls `onEvent` for each `ready` / `changed` event with the vault rev it carries.
 * Resolves 'ended' when the server closes the stream (token expired, device revoked, restart)
 * and 'aborted' when `signal` aborts. Rejects with an Error carrying `status` on an HTTP error.
 */
export async function readServerEvents(
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  url: string,
  onEvent: (type: 'ready' | 'changed', rev: number) => void,
  signal: AbortSignal,
): Promise<'ended' | 'aborted'> {
  let res: Response;
  try {
    res = await fetchFn(url, { signal, headers: { Accept: 'text/event-stream' }, cache: 'no-store' });
  } catch (err) {
    if (signal.aborted) return 'aborted';
    throw err;
  }
  if (!res.ok || !res.body) throw Object.assign(new Error(`Events unavailable (${res.status})`), { status: res.status });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return 'ended';
      buffer += value.replace(/\r\n?/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let type = 'message';
        let data = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) type = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (type !== 'ready' && type !== 'changed') continue;
        const rev = Number((JSON.parse(data || '{}') as { rev?: unknown }).rev);
        if (Number.isFinite(rev)) onEvent(type, rev);
      }
    }
  } catch (err) {
    if (signal.aborted) return 'aborted';
    throw err;
  } finally {
    reader.releaseLock();
  }
}
