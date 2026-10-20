import { CodeBlock } from './DocComponents';
import { DIAGRAM_SVGS } from '../diagrams.generated';
import { diagramHash } from '../diagram-hash';

/**
 * Inlines the pre-rendered SVG for a ```mermaid fence.
 *
 * The markup is inlined rather than referenced with `<img src>` so pele's CSS
 * variables resolve against the page theme — one generated SVG serves light and
 * dark with no second render and no client JavaScript.
 *
 * SVGs come from `scripts/render-diagrams.ts`. A fence with no rendered entry
 * (a diagram was edited without regenerating) falls back to a code block rather
 * than rendering nothing.
 */
export function DiagramImage({ chart, rendered }: { chart: string; rendered?: Record<string, string> }) {
  const hash = diagramHash(chart);
  const svg = DIAGRAM_SVGS[hash] ?? rendered?.[hash];
  if (!svg) return <CodeBlock language="mermaid" code={chart} />;

  return (
    <figure
      className="mermaid-diagram my-6"
      // Content is generated at build time from repo markdown by scripts/render-diagrams.ts.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
