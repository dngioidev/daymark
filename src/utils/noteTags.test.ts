import { describe, expect, it } from 'vitest';
import { extractTags, hasTag, mergeTags, parseTagField, tagKey } from './noteTags';

describe('extractTags', () => {
  it('reads #tags in order, nested tags included, first spelling wins', () => {
    expect(extractTags('Plan #project and #Project/daymark then #project')).toEqual(['project', 'Project/daymark']);
    expect(extractTags('#Sync first, then #sync')).toEqual(['Sync']);
  });

  it('counts a backslash-escaped line-leading tag, as the rich editor saves it', () => {
    expect(extractTags('\\#project at line start')).toEqual(['project']);
  });

  it('ignores headings and tags starting with a digit', () => {
    expect(extractTags('# Title\n## Sub\n#123 #1a')).toEqual([]);
  });

  it('ignores code, URLs, links, wiki links, entities and HTML comments', () => {
    expect(extractTags('`#code` and\n```\n#fenced\n```\n')).toEqual([]);
    expect(extractTags('https://x.dev/#frag www.y.com/#a [see](#intro) [#text](u) [[Note#Heading]] &#123; <!-- #c -->')).toEqual([]);
    expect(extractTags('<!-- daymark: task_id=a1 status=open created=2026-11-07 #x -->')).toEqual([]);
  });

  it('needs a boundary before # and trims a trailing - or /', () => {
    expect(extractTags('a#b mid-word, end #trail- #ok/')).toEqual(['trail', 'ok']);
  });

  it('accepts unicode letters', () => {
    expect(extractTags('#lập-trình')).toEqual(['lập-trình']);
  });

  it('reads frontmatter tags first, inline or as a list', () => {
    expect(extractTags('---\ntags: [alpha, Beta]\n---\nbody #beta #gamma')).toEqual(['alpha', 'Beta', 'gamma']);
    expect(extractTags('---\ntags:\n  - one\n  - "two/three"\n---\n')).toEqual(['one', 'two/three']);
    expect(extractTags('---\ntags: a, b\n---\n')).toEqual(['a', 'b']);
    expect(extractTags('---\ntitle: x\n---\n# heading')).toEqual([]);
  });

  it('does not read # inside the frontmatter block as a body tag', () => {
    expect(extractTags('---\ntitle: "#nope"\n---\n#yes')).toEqual(['yes']);
  });
});

describe('tag helpers', () => {
  it('tagKey folds case', () => {
    expect(tagKey('Project/Daymark')).toBe('project/daymark');
  });

  it('mergeTags keeps the first spelling', () => {
    expect(mergeTags(['Java'], ['java', 'sql'])).toEqual(['Java', 'sql']);
  });

  it('parseTagField accepts commas, spaces and an optional #', () => {
    expect(parseTagField('#a, b  c/d #1x')).toEqual(['a', 'b', 'c/d']);
  });

  it('hasTag matches the tag and its nested children only', () => {
    expect(hasTag(['project/daymark'], 'Project')).toBe(true);
    expect(hasTag(['project'], 'project')).toBe(true);
    expect(hasTag(['projects'], 'project')).toBe(false);
  });
});
