import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getExtensionById, getCatalog, type ExtensionItem } from '@/lib/extensions';
import { siteUrl } from '@/lib/site';
import ExtensionDetailContent from './ExtensionDetailContent';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

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
      <ExtensionDetailContent extension={ext} relatedExtensions={related} />
    </>
  );
}