import React, { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';

let initialized = false;
let sequence = 0;
let mermaidModule: Promise<typeof import('mermaid')> | undefined;
// Mermaid's global configuration/render queue is shared by previews and node views.
let queue: Promise<unknown> = Promise.resolve();
export async function renderMermaid(source: string): Promise<string> {
  const mermaid = (await (mermaidModule ??= import('mermaid'))).default;
  const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'default';
  const result = queue.catch(() => {}).then(async () => {
    if (!initialized) {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
      initialized = true;
    }
    const container = document.createElement('div');
    // Layout must stay measurable for Mermaid's SVG sizing.
    container.style.cssText = 'position:absolute;left:-10000px;top:0;pointer-events:none';
    container.setAttribute('aria-hidden', 'true');
    document.body.append(container);
    try {
      // render() resets setConfig(), so use a render-only theme directive.
      // This leaves stored source untouched and keeps one strict initialization.
      const themedSource = `${source}\n%%{init: ${JSON.stringify({ theme })}}%%`;
      const { svg } = await mermaid.render(`daymark-mermaid-${++sequence}`, themedSource, container);
      return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
    } finally { container.remove(); }
  });
  queue = result;
  return result;
}

export function MermaidDiagram({ source }: { source: string }) {
  const [result, setResult] = useState<{ svg?: string; error?: string }>({});
  const [theme, setTheme] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(document.documentElement.classList.contains('dark')));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    setResult({});
    void renderMermaid(source).then(svg => { if (active) setResult({ svg }); }, error => { if (active) setResult({ error: error instanceof Error ? error.message : String(error) }); });
    return () => { active = false; };
  }, [source, theme]);
  if (result.error) return <div><p role="alert">{result.error}</p><pre className="whitespace-pre-wrap"><code>{source}</code></pre></div>;
  if (!result.svg) return <pre className="whitespace-pre-wrap" aria-label="Loading diagram"><code>{source}</code></pre>;
  return <div className="overflow-x-auto" role="img" aria-label="Mermaid diagram" dangerouslySetInnerHTML={{ __html: result.svg }} />;
}
