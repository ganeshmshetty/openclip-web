/**
 * Splits the synced docs payload into two smaller artifacts.
 *
 * `docsData.json` carries every doc's `rawMarkdown` (~800 KB) and is imported by the
 * docs registry. Because `DocsView` is a client component it pulled the whole payload
 * into the browser bundle, so every docs page downloaded all 22 documents.
 *
 * This emits:
 *   - `src/docs/data/docsMeta.json`   — navigation metadata, no markdown (client-safe)
 *   - `public/docs-search.json`       — lower-cased text per doc, fetched only when
 *                                       the user actually searches
 *
 * Runs after scripts/sync-docs.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

interface DocLike {
  id: string;
  rawMarkdown?: string;
  content?: string;
  [key: string]: unknown;
}

/**
 * Search text for one doc. Kept close to the raw markdown so a query matches exactly
 * what `searchDocs` used to see (which searched the raw markdown). Only folding case
 * and collapsing whitespace, so code spans and identifiers stay searchable.
 */
function normalizeForSearch(markdown: string): string {
  return markdown.toLowerCase().replace(/\s+/g, ' ').trim();
}

function main() {
  const dataFile = resolve(__dirname, '../src/docs/data/docsData.json');
  if (!existsSync(dataFile)) {
    throw new Error(`Missing ${dataFile}. Run \`bun run scripts/sync-docs.ts\` first.`);
  }

  const payload = JSON.parse(readFileSync(dataFile, 'utf-8')) as {
    generatedAt?: string;
    categories?: unknown;
    allDocs?: DocLike[];
  };

  const docs = payload.allDocs ?? [];

  /** Docs are embedded twice — in `allDocs` and inside `categories[].items[]` — so both
   *  copies have to lose their markdown, not just the top-level list. */
  const stripDoc = (doc: DocLike): Record<string, unknown> => {
    const { rawMarkdown, content, ...rest } = doc;
    void rawMarkdown;
    void content;
    return rest;
  };

  const categories = (payload.categories as Array<Record<string, unknown>> | undefined) ?? [];

  const meta = {
    generatedAt: payload.generatedAt,
    categories: categories.map((category) => ({
      ...category,
      items: Array.isArray(category.items) ? (category.items as DocLike[]).map(stripDoc) : category.items,
    })),
    allDocs: docs.map(stripDoc),
  };

  const metaFile = resolve(__dirname, '../src/docs/data/docsMeta.json');
  writeFileSync(metaFile, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

  const searchFile = resolve(__dirname, '../public/docs-search.json');
  mkdirSync(resolve(__dirname, '../public'), { recursive: true });
  const corpus: Record<string, string> = {};
  for (const doc of docs) {
    if (doc.rawMarkdown) corpus[doc.id] = normalizeForSearch(doc.rawMarkdown);
  }
  writeFileSync(searchFile, JSON.stringify(corpus), 'utf-8');

  const metaKB = Math.round(JSON.stringify(meta).length / 1024);
  const searchKB = Math.round(JSON.stringify(corpus).length / 1024);
  console.log(
    `[Docs Meta] ✓ ${docs.length} docs → docsMeta.json (${metaKB} KB, client) + docs-search.json (${searchKB} KB, lazy)`
  );
}

main();
