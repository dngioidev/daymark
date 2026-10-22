import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UseSyncResult } from '../../hooks/useSync';
import { SyncPanel } from './SyncPanel';

const sync: UseSyncResult = {
  mode: 'local-web', status: 'off', account: null, lastSyncAt: null, error: null,
  connect: vi.fn(), disconnect: vi.fn(), signOut: vi.fn(), pendingChanges: () => 0,
  authFetch: vi.fn(), syncNow: vi.fn(), rebaseAfterReplace: vi.fn(),
};
const render = (props: Partial<UseSyncResult>) => renderToStaticMarkup(React.createElement(SyncPanel, {
  sync: { ...sync, ...props }, defaultDeviceName: 'Phone',
}));

describe('SyncPanel modes', () => {
  it('explains local web storage without a sign-in form', () => {
    const html = render({});
    expect(html).toContain('Sign-in and sync work in the Daymark app served by your server, or in the Android app. On this page your notes stay in this browser; use Backup &amp; restore to move them.');
    expect(html).not.toContain('<form');
  });
  it('keeps the server-address form on native', () => {
    expect(render({ mode: 'native' })).toContain('Server address');
  });
  it('shows the server account with Sign out and no address input', () => {
    const html = render({ mode: 'server', status: 'idle', account: { serverUrl: 'https://daymark.test', username: 'admin', deviceName: 'Browser' } });
    expect(html).toContain('admin');
    expect(html).toContain('Browser');
    expect(html).toContain('Sign out');
    expect(html).not.toContain('Disconnect this device');
    expect(html).not.toContain('sync-url');
  });
  it('never offers a server-address form while the server account is loading', () => {
    const html = render({ mode: 'server' });
    expect(html).not.toContain('<form');
    expect(html).toContain('Sync');
  });
});
