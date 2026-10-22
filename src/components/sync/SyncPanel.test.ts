import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UseSyncResult } from '../../hooks/useSync';
import { SyncPanel } from './SyncPanel';
import { alertDialog, confirmDialog } from '../ui/feedback';

vi.mock('../ui/feedback', () => ({ confirmDialog: vi.fn(async () => false), alertDialog: vi.fn(async () => {}) }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: vi.fn(actual.useState) };
});

it('handles a failed server sign-out and displays the error', async () => {
  const { useState } = await import('react');
  vi.mocked(useState).mockImplementation((initial?: unknown): [unknown, React.Dispatch<unknown>] => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  try {
    const element = await SyncPanel({ sync: { ...sync, mode: 'server', status: 'idle',
      account: { serverUrl: 'https://daymark.test', username: 'admin', deviceName: 'Browser' },
      signOut: vi.fn(async () => { throw new Error('Browser storage is blocked'); }),
    }, defaultDeviceName: 'Browser' });
    const find = (node: React.ReactNode): React.ReactElement<{ onClick: () => Promise<void> }> | undefined => {
      if (!React.isValidElement<{ children?: React.ReactNode; onClick: () => Promise<void> }>(node)) return;
      if (node.type === 'button' && node.props.children === 'Sign out') return node;
      return React.Children.toArray(node.props.children).map(find).find(Boolean);
    };
    await expect(find(element)!.props.onClick()).resolves.toBeUndefined();
    expect(alertDialog).toHaveBeenCalledWith('Could not sign out', 'Browser storage is blocked');
  } finally { vi.mocked(useState).mockRestore(); }
});

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

it('counts unsent changes in the offline sign-out warning', async () => {
  const { useState } = await import('react');
  vi.mocked(useState).mockImplementation((initial?: unknown): [unknown, React.Dispatch<unknown>] => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
  try {
    const element = SyncPanel({ sync: { ...sync, mode: 'server', status: 'offline',
      account: { serverUrl: 'https://daymark.test', username: 'admin', deviceName: 'Browser' },
      signOut: vi.fn(async () => 'needs-confirm-unreachable' as const), pendingChanges: () => 1,
    }, defaultDeviceName: 'Browser' });
    const findSignOut = (node: React.ReactNode): React.ReactElement<{ onClick: () => Promise<void> }> | undefined => {
      if (!React.isValidElement<{ children?: React.ReactNode; onClick: () => Promise<void> }>(node)) return;
      if (node.type === 'button' && node.props.children === 'Sign out') return node;
      return React.Children.toArray(node.props.children).map(findSignOut).find(Boolean);
    };
    const button = findSignOut(await element);
    if (!button) throw new Error('Sign out button missing');
    await button.props.onClick();
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('1 change') }));
  } finally { vi.mocked(useState).mockRestore(); }
});
