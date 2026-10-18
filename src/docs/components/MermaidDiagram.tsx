'use client';

import { useEffect, useState } from 'react';
import { CodeBlock } from './DocComponents';

/**
 * Renders ```mermaid fenced blocks as SVG diagrams.
 *
 * Mermaid is imported lazily so its (large) dependency graph stays out of the
 * initial bundle and out of SSR. If parsing fails we fall back to the plain
 * code block, so a broken diagram is still readable instead of blank.
 */
export function MermaidDiagram({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: isDark ? 'dark' : 'default',
          fontFamily: 'inherit',
        });

        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) {
          setSvg(rendered);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    render();

    // Re-render when the site theme flips so diagram colors track the page.
    const observer = new MutationObserver(render);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [chart]);

  if (failed) return <CodeBlock language="mermaid" code={chart} />;

  return (
    <div className="my-5 flex justify-center overflow-x-auto">
      {svg ? (
        <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="py-6 text-[13px] font-mono text-[var(--text-tertiary)]">Rendering diagram…</div>
      )}
    </div>
  );
}
