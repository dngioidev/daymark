import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { assertPortAvailable } from './port.mjs';

test('port preflight accepts a free port and refuses an already occupied one', async () => {
  const listener = net.createServer();
  await new Promise((resolve, reject) => listener.listen(0, '127.0.0.1', resolve).once('error', reject));
  const { port } = listener.address();
  try {
    await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    await assertPortAvailable(port);
    await new Promise((resolve, reject) => listener.listen(port, '127.0.0.1', resolve).once('error', reject));
    await assert.rejects(assertPortAvailable(port), /Port .* is already answering/);
  } finally {
    await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  }
});
