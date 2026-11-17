import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getExtensionById, getCatalog, getBuildExtensionIds, type ExtensionItem } from '@/lib/extensions';
import { siteUrl } from '@/lib/site';
import ExtensionDetailContent from './ExtensionDetailContent';
import { render } from 'pele';
import { diagramHash, DIAGRAM_LANGUAGE } from '@/docs/diagram-hash';

// Prerendered at build time; see ../page.tsx.

interface Props {
  params: Promise<{ id: string }>;
}

/** Prerender every extension in the build-time catalog (the same source as the
 *  sitemap) so crawler traffic never triggers a cold server render. */
export async function generateStaticParams() {
  return (await getBuildExtensionIds()).map((id) => ({ id }));
}

// No on-demand HTML rendering: every published extension is baked at build time
// and the next sync deploy rebuilds after a catalog change. Unknown ids are a
// static 404, so a scanner or a stale deep link can never trigger Worker SSR.
export const dynamicParams = false;

function getRelatedExtensions(current: ExtensionItem, all: ExtensionItem[]): ExtensionItem[] {
  const words = new Set(
    `${current.name} ${current.description}`
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );

  const scored = all
    .filter((e) => e.id !== current.id)
    .map((e) => {
      let score = 0;
      const target = `${e.name} ${e.description}`.toLowerCase();
      for (const w of words) {
        if (target.includes(w)) score += 1;
      }
      return { ext: e, score };
    })
    .sort((a, b) => b.score - a.score || b.ext.downloadCount - a.ext.downloadCount);

  return scored.slice(0, 4).map((s) => s.ext);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ext = await getExtensionById(id);
  if (!ext) return {};
  const url = `/extensions/${ext.id}`;
  return {
    title: `${ext.name} Extension`,
    description: ext.description,
    alternates: { canonical: url },
    openGraph: {
      title: `${ext.name} Extension — OpenClip`,
      description: ext.description,
      url,
      type: 'website',
      images: ['/opengraph-image'],
    },
    twitter: {
      title: `${ext.name} Extension — OpenClip`,
      description: ext.description,
      images: ['/twitter-image'],
    },
  };
}

/**
 * Extension READMEs are fetched live, so their ```mermaid fences are not in the
 * build-time diagram map. Render them here on the server: pele takes a few
 * milliseconds and nothing ships to the browser.
 */
function renderReadmeDiagrams(markdown?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!markdown) return out;
  for (const match of markdown.matchAll(new RegExp('```' + DIAGRAM_LANGUAGE + '\\n([\\s\\S]*?)```', 'g'))) {
    const chart = match[1].trim();
    if (!chart) continue;
    const hash = diagramHash(chart);
    try {
      const { svg } = render(chart, { idPrefix: `pele-${hash}`, responsive: true });
      if (svg.trim().startsWith('<svg')) out[hash] = svg;
    } catch {
      // Falls back to a code block.
    }
  }
  return out;
}

export default async function ExtensionDetailPage({ params }: Props) {
  const { id } = await params;
  const ext = await getExtensionById(id);
  if (!ext) notFound();

  let related: ExtensionItem[] = [];
  try {
    const catalog = await getCatalog();
    related = getRelatedExtensions(ext, catalog);
  } catch {}

  const extensionUrl = `${siteUrl}/extensions/${ext.id}`;

  const jsonLdBreadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: siteUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Extensions',
        item: `${siteUrl}/extensions`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: ext.name,
        item: extensionUrl,
      },
    ],
  };

  const jsonLdSoftwareApplication = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: `${ext.name} — OpenClip Extension`,
    applicationCategory: 'UtilitiesApplication',
    applicationSubCategory: 'macOS Text Utility Extension',
    operatingSystem: 'macOS 14.0+',
    url: extensionUrl,
    downloadUrl: ext.downloadURL,
    description: ext.description,
    softwareVersion: ext.version ?? '1.0.0',
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'USD',
    },
    author: {
      '@type': 'Organization',
      name: ext.author || 'OpenClip Community',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSoftwareApplication) }}
      />
      <ExtensionDetailContent extension={ext} relatedExtensions={related} diagrams={renderReadmeDiagrams(ext.readmeMarkdown)} />
    </>
  );
}