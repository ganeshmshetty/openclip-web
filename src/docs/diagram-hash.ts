/**
 * Stable content hash for a mermaid diagram.
 *
 * Diagrams are pre-rendered to `public/diagrams/<hash>.svg` so no diagram library
 * ships to the browser. Both the renderer (`scripts/render-diagrams.ts`) and the
 * markdown renderer hash the chart source with this function, so the filename
 * depends only on the diagram's text.
 */
export function diagramHash(chart: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < chart.length; i++) {
    h ^= chart.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Extensions of the fenced blocks we pre-render. */
export const DIAGRAM_LANGUAGE = 'mermaid';
