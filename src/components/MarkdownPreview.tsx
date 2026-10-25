import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MermaidDiagram } from './notes/mermaidDiagram';
import { renderMarkdownHtml } from '../utils/markdownHtml';
import {
  Check,
  Copy,
  Info,
  AlertTriangle,
  Lightbulb,
  AlertOctagon,
  FileText,
  Tag,
  Calendar,
} from 'lucide-react';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  onInternalLinkClick?: (noteTitle: string) => void;
  onToggleTaskItem?: (taskIndex: number, newChecked: boolean) => void;
}

interface ParsedFrontmatter {
  attributes: Record<string, string>;
  body: string;
}

/**
 * Extracts YAML frontmatter if present and returns clean body
 */
function extractFrontmatter(raw: string): ParsedFrontmatter {
  if (!raw) return { attributes: {}, body: '' };

  const trimmed = raw.trimStart();
  if (trimmed.startsWith('---')) {
    const endMatch = trimmed.indexOf('\n---', 3);
    if (endMatch !== -1) {
      const frontmatterText = trimmed.substring(3, endMatch).trim();
      const body = trimmed.substring(endMatch + 4).trimStart();
      const attributes: Record<string, string> = {};

      const lines = frontmatterText.split('\n');
      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const key = line.substring(0, colonIdx).trim();
          const val = line.substring(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (key) attributes[key] = val;
        }
      }

      return { attributes, body };
    }
  }

  return { attributes: {}, body: raw };
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  className = '',
  onInternalLinkClick,
  onToggleTaskItem,
}) => {
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [diagrams, setDiagrams] = useState<{ target: HTMLElement; source: string }[]>([]);

  // 1. Parse frontmatter and body
  const { attributes: frontmatter, body: cleanBody } = useMemo(() => {
    return extractFrontmatter(content || '');
  }, [content]);

  // 2. Pre-process Markdown: Callouts, Internal links, Clean machine comments
  const processedHtml = useMemo(
    () => renderMarkdownHtml(cleanBody, !!onToggleTaskItem),
    [cleanBody, onToggleTaskItem]
  );
  useEffect(() => {
    const diagrams = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('pre > code.language-mermaid') ?? []).map(code => {
      const target = document.createElement('div');
      const source = (code.textContent ?? '').replace(/\n$/, '');
      const original = code.parentElement!;
      original.replaceWith(target);
      return { target, source, original };
    });
    setDiagrams(diagrams);
    // Restore the sanitised fence for React StrictMode's effect replay.
    return () => { diagrams.forEach(({ target, original }) => target.replaceWith(original)); };
  }, [processedHtml]);

  // Handle interactive clicks inside the rendered container
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // 1. Check if user clicked an internal [[Wiki Link]]
    const internalBtn = target.closest('[data-internal-note]') as HTMLElement | null;
    if (internalBtn && onInternalLinkClick) {
      e.preventDefault();
      const rawTitle = internalBtn.getAttribute('data-internal-note');
      if (rawTitle) {
        onInternalLinkClick(decodeURIComponent(rawTitle));
        return;
      }
    }

    // 2. Check if user toggled a task list checkbox in preview
    if (target.matches('input[type="checkbox"][data-task-index]')) {
      const checkbox = target as HTMLInputElement;
      const idxStr = checkbox.getAttribute('data-task-index');
      if (idxStr !== null && onToggleTaskItem) {
        const itemIdx = parseInt(idxStr, 10);
        onToggleTaskItem(itemIdx, checkbox.checked);
      }
    }

    // 3. Check if user clicked a code copy button
    const copyBtn = target.closest('[data-copy-code]') as HTMLElement | null;
    if (copyBtn) {
      const code = copyBtn.getAttribute('data-copy-code');
      if (code) {
        navigator.clipboard.writeText(decodeURIComponent(code));
        const codeId = copyBtn.getAttribute('data-code-id') || 'code';
        setCopiedCodeId(codeId);
        setTimeout(() => setCopiedCodeId(null), 2000);
      }
    }
  };

  const hasFrontmatter = Object.keys(frontmatter).length > 0;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Frontmatter Properties Badge Display */}
      {hasFrontmatter && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 bg-stone-100/80 dark:bg-stone-800/60 rounded-lg border border-stone-200 dark:border-stone-700/80 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 mr-1 flex items-center gap-1">
            <Tag className="w-3 h-3" />
            <span>Properties</span>
          </span>
          {Object.entries(frontmatter).map(([k, v]) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 font-mono text-[11px]"
            >
              <span className="text-stone-400 font-semibold">{k}:</span>
              <span className="font-medium text-stone-800 dark:text-stone-200">{v}</span>
            </span>
          ))}
        </div>
      )}

      {/* Rendered Markdown Body */}
      {processedHtml ? (
        <div
          ref={bodyRef}
          onClick={handleContainerClick}
          dangerouslySetInnerHTML={{ __html: processedHtml }}
          className="daymark-markdown-body text-sm sm:text-base text-stone-800 dark:text-stone-200 leading-relaxed font-sans"
        />
      ) : (
        <div className="text-xs text-stone-400 dark:text-stone-500 italic py-2">
          No content to preview. Write Markdown above or switch to Edit mode.
        </div>
      )}
      {diagrams.map(({ target, source }, index) => createPortal(<MermaidDiagram source={source} />, target, String(index)))}
    </div>
  );
};
