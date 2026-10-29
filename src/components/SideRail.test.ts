// @vitest-environment jsdom
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { SideRail } from './SideRail';

const props = { collapsed: false, onToggleCollapsed: vi.fn(), activeTab: 'notes' as const, onTabChange: vi.fn(), onOpenQuickCapture: vi.fn(), onOpenSearch: vi.fn(), onOpenSettings: vi.fn(), onOpenSync: vi.fn(), syncStatus: 'synced' as const, carriedAlertCount: 3, todayLabel: 'Tuesday, 27 October', side: 'left' as const };
describe('desktop side rail', () => {
  it('includes visible shortcut hints and badge counts in explicit accessible names', () => {
    for (const collapsed of [false, true]) {
      const doc = document.createElement('div');
      doc.innerHTML = renderToStaticMarkup(React.createElement(SideRail, { ...props, collapsed }));
      expect(doc.querySelector('[data-rail-part="today"]')!.getAttribute('aria-label')).toBe(collapsed ? 'Today 3 tasks need attention' : null);
      for (const button of doc.querySelectorAll('button[aria-label]')) {
        const visible = button.textContent!.replace(/\s/g, '');
        expect(button.getAttribute('aria-label')!.replace(/\s/g, '')).toContain(visible);
      }
    }
  });
  it('minimizes to named icons without losing navigation, actions or attention count', () => {
    const doc = document.createElement('div');
    doc.innerHTML = renderToStaticMarkup(React.createElement(SideRail, { ...props, collapsed: true, onToggleCollapsed: vi.fn() }));
    const nav = doc.querySelector('nav')!;
    expect(nav.classList.contains('w-[64px]')).toBe(true);
    expect(nav.children).toHaveLength(5);
    for (const label of ['Expand menu', 'Today 3 tasks need attention', 'Calendar', 'Notes', 'Backlog', 'Settings', 'New task', 'Search (Ctrl Shift F)', 'Sync: Synced. Open sync settings']) {
      expect(nav.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
    }
    expect(nav.querySelector('[aria-current="page"]')!.getAttribute('aria-label')).toBe('Notes');
    expect(nav.querySelector('[aria-label="3 tasks need attention"]')!.textContent).toBe('3');
    expect(nav.textContent).not.toContain(props.todayLabel);
    expect(nav.querySelector('kbd')).toBeNull();
  });
  it('has five equal parts, active page, alert badge and accessible actions', () => {
    const doc = document.createElement('div');
    doc.innerHTML = renderToStaticMarkup(React.createElement(SideRail, props));
    const nav = doc.querySelector('nav[aria-label="Main"]')!;
    expect(Array.from(nav.children).map(el => el.getAttribute('data-rail-part'))).toEqual(['title', 'today', 'calendar', 'notes', 'backlog']);
    expect(nav.getAttribute('style')).toContain('grid-template-rows:repeat(5, 1fr)');
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(nav.querySelector('[aria-current="page"]')!.textContent).toContain('Notes');
    expect(nav.querySelector('[aria-label="3 tasks need attention"]')!.textContent).toBe('3');
    expect(nav.querySelector('[aria-label="Sync: Synced. Open sync settings"]')).not.toBeNull();
    expect(nav.querySelector('[aria-keyshortcuts="Control+K Meta+K"]')!.textContent).toContain('New task');
    expect(nav.textContent).toContain(props.todayLabel);
  });
  it.each([
    { collapsed: false, side: 'left' as const },
    { collapsed: false, side: 'right' as const },
    { collapsed: true, side: 'left' as const },
    { collapsed: true, side: 'right' as const },
  ])('keeps named Title actions before pages, with tooltips and callbacks ($side, collapsed=$collapsed)', ({ collapsed, side }) => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const calls: string[] = [];
    try {
      flushSync(() => root.render(React.createElement(SideRail, {
        ...props, collapsed, side,
        onOpenSearch: () => calls.push('search'), onOpenSettings: () => calls.push('settings'),
      })));
      const nav = container.querySelector('nav')!;
      const title = nav.querySelector('[data-rail-part="title"]')!;
      const search = title.querySelector<HTMLButtonElement>('button[aria-label="Search (Ctrl Shift F)"]')!;
      const settings = title.querySelector<HTMLButtonElement>('button[aria-label="Settings"]');
      expect(search).not.toBeNull();
      expect(settings).not.toBeNull();
      expect(settings!.hasAttribute('aria-current')).toBe(false);
      expect(Array.from(nav.querySelectorAll('button')).map(button => button.getAttribute('aria-label') ?? button.dataset.railPart)).toEqual([
        collapsed ? 'Expand menu' : 'Minimize menu', 'Sync: Synced. Open sync settings',
        collapsed ? 'New task' : 'New task Ctrl K', 'Search (Ctrl Shift F)', 'Settings',
        collapsed ? 'Today 3 tasks need attention' : 'today', collapsed ? 'Calendar' : 'calendar',
        collapsed ? 'Notes' : 'notes', collapsed ? 'Backlog' : 'backlog',
      ]);
      expect(nav.querySelectorAll('[aria-current]')).toHaveLength(1);
      for (const [button, label] of [[search, 'Search (Ctrl Shift F)'], [settings!, 'Settings']] as const) {
        flushSync(() => button.focus());
        expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(label);
        flushSync(() => button.click());
      }
      expect(calls).toEqual(['search', 'settings']);
    } finally {
      flushSync(() => root.unmount());
      container.remove();
    }
  });
  it('moves to the right without reversing reading order and disappears when hidden', () => {
    expect(renderToStaticMarkup(React.createElement(SideRail, { ...props, side: 'right' }))).toContain('order-last');
    expect(renderToStaticMarkup(React.createElement(SideRail, { ...props, hidden: true }))).toBe('');
  });
  it('keeps Title tools readable and scrollable in short viewports', () => {
    const doc = document.createElement('div');
    doc.innerHTML = renderToStaticMarkup(React.createElement(SideRail, props));
    const title = doc.querySelector('[data-rail-part="title"]')!;
    expect(title.classList.contains('overflow-y-auto')).toBe(true);
    expect(title.classList.contains('justify-start')).toBe(true);
    expect(Array.from(title.children).every(el => el.classList.contains('shrink-0'))).toBe(true);
  });
  it('uses readable Title labels and a usable Sync target without dimming the shortcut', () => {
    const doc = document.createElement('div');
    doc.innerHTML = renderToStaticMarkup(React.createElement(SideRail, props));
    expect(doc.querySelector('[title="Tuesday, 27 October"]')!.classList.contains('text-[12px]')).toBe(true);
    const sync = doc.querySelector('[aria-label="Sync: Synced. Open sync settings"]')!;
    expect(sync.classList.contains('text-[12px]')).toBe(true);
    expect(sync.classList.contains('min-h-[24px]')).toBe(true);
    expect(doc.querySelector('kbd')!.classList.contains('text-[12px]')).toBe(true);
    expect(doc.querySelector('kbd')!.className).not.toContain('opacity');
  });
  it('wires each action to its supplied callback', () => {
    const tree = SideRail(props) as React.ReactElement<{ children: React.ReactNode }>;
    const visit = (node: React.ReactNode): void => {
      if (!React.isValidElement<{ onClick?: () => void; children?: React.ReactNode }>(node)) return;
      node.props.onClick?.();
      React.Children.forEach(node.props.children, visit);
    };
    visit(tree);
    expect(props.onOpenQuickCapture).toHaveBeenCalledOnce();
    expect(props.onOpenSettings).toHaveBeenCalledOnce();
    expect(props.onOpenSearch).toHaveBeenCalledOnce();
    expect(props.onOpenSync).toHaveBeenCalledOnce();
    expect(props.onTabChange.mock.calls.map(([tab]) => tab)).toEqual(['today', 'calendar', 'notes', 'backlog']);
  });
  it('App replaces the desktop banner and hides the rail in Notes focus mode', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).not.toContain('<Navbar');
    expect(app).toContain("hidden={activeDesktopTab === 'notes' && focusNotes}");
    expect(app).toContain('onFocusModeChange={setFocusNotes}');
    expect(app).toContain('side={resolveMenuSide(settings.appearance)}');
  });
});

it('uses the Mac shortcut hint in the Search tooltip and accessible name', () => {
  const platform = vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    flushSync(() => root.render(React.createElement(SideRail, props)));
    const search = host.querySelector<HTMLButtonElement>('[aria-label="Search (⌘ Shift F)"]')!;
    expect(search).not.toBeNull(); flushSync(() => search.focus());
    expect(document.querySelector('[role=tooltip]')?.textContent).toBe('Search (⌘ Shift F)');
  } finally { flushSync(() => root.unmount()); host.remove(); platform.mockRestore(); }
});
