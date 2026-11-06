// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderMarkdownHtml } from './markdownHtml';

const dom = (markdown: string) => { const el = document.createElement('div'); el.innerHTML = renderMarkdownHtml(markdown, false); return el; };

describe('renderMarkdownHtml keeps code literal', () => {
  it('does not turn wiki links or callouts in fenced code into active HTML', () => {
    const el = dom('```\n[[Not Link]]\n> [!NOTE] not a callout\n```');
    expect(el.querySelectorAll('button[data-internal-note]')).toHaveLength(0);
    expect(el.querySelectorAll('.daymark-callout')).toHaveLength(0);
    expect(el.querySelector('pre')?.textContent).toContain('[[Not Link]]');
    expect(el.querySelector('pre')?.textContent).toContain('> [!NOTE] not a callout');
  });
  it('does not turn inline code wiki links into buttons', () => {
    const el = dom('`[[Literal Code]]` and [[Real Link]]');
    expect(el.querySelector('code')?.textContent).toBe('[[Literal Code]]');
    expect(el.querySelectorAll('button[data-internal-note]')).toHaveLength(1);
  });
  it('still renders callouts and links outside code', () => {
    const el = dom('> [!NOTE] Title\n> body\n\n```\ncode\n```\n\n[[Link]]');
    expect(el.querySelectorAll('.daymark-callout')).toHaveLength(1);
    expect(el.querySelectorAll('button[data-internal-note]')).toHaveLength(1);
  });
  it('keeps an unclosed fence literal to the end', () => {
    const el = dom('before [[A]]\n\n```\n[[B]]\nmore');
    expect(el.querySelectorAll('button[data-internal-note]')).toHaveLength(1);
    expect(el.textContent).toContain('[[B]]');
  });
});
