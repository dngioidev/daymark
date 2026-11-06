import { describe, expect, it } from 'vitest';
import { matchFrontmatter } from './frontmatter';

describe('matchFrontmatter', () => {
  it.each([
    '---\ntitle: Example\n---\nBody',
    '---\r\ntitle: CRLF\r\n---\r\nBody',
    '---\nnote title: spaced\n---',
    '---\ntiêu đề: Giữ nguyên\n---',
    '---\n"quoted: key": 1\n---',
    '---\n# comment\ntitle: x\ntags:\n  - a\n  - b\nnested:\n  child: 1\n---',
    '---\ntags:\n- a\n- b\n---',
    '---\ntitle: Dots\n...\nBody',
  ])('accepts a mapping header: %j', source => expect(matchFrontmatter(source)).not.toBeNull());

  it.each([
    ['bare prose line inside', '---\ntitle: Example\nordinary prose\n---\n\nBody'],
    ['four-dash closer', '---\ntitle: Example\n----\n\nAfter'],
    ['leading blank line', '\n---\ntitle: Example\n---\n\nBody'],
    ['leading indentation', '  ---\ntitle: Example\n---'],
    ['byte order mark first', '﻿---\ntitle: Example\n---'],
    ['unclosed', '---\ntitle: Unclosed\n\nKeep this note'],
    ['divider pair', '---\n\nFirst\n\n---\n\nLast'],
    ['prose first', '---\nJust prose\n---'],
  ])('rejects %s', (_name, source) => expect(matchFrontmatter(source)).toBeNull());
});
