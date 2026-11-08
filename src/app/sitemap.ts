import type { MetadataRoute } from 'next';
import { allDocs } from '@/docs/registry';
import { getCatalog } from '@/lib/extensions';
import { siteUrl } from '@/lib/site';

// Prerendered at build time: the catalog snapshot in the deploy is the source of
// truth, so a crawler hit costs nothing and no origin fetch is needed.

const FEATURED_EXTENSION_IDS = new Set([
  'com.openclip.cleanemdashes',
  'com.openclip.wordcount',
  'com.openclip.speakselection',
  'com.openclip.obsidiancapture',
  'com.openclip.applereminders',
  'com.openclip.githubsearch',
  'com.openclip.copy-as-markdown',
  'com.openclip.camelcase',
  'com.openclip.snakecase',
  'com.openclip.charactercount',
]);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseDate = new Date('2026-09-01T00:00:00Z');
  const recentDate = new Date('2026-09-04T00:00:00Z');

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: recentDate,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/compare/popclip`,
      lastModified: recentDate,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/extensions`,
      lastModified: recentDate,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/changelog`,
      lastModified: recentDate,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${siteUrl}/support`,
      lastModified: recentDate,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];

  const docRoutes: MetadataRoute.Sitemap = allDocs.map((doc) => ({
    url: `${siteUrl}/docs/${doc.slug}`,
    lastModified: baseDate,
    changeFrequency: 'weekly',
    priority: doc.slug === 'getting-started' ? 0.8 : 0.7,
  }));

  let extensionRoutes: MetadataRoute.Sitemap = [];
  try {
    const catalog = await getCatalog();
    extensionRoutes = catalog.map((ext) => ({
      url: `${siteUrl}/extensions/${ext.id}`,
      lastModified: baseDate,
      changeFrequency: 'weekly',
      priority: FEATURED_EXTENSION_IDS.has(ext.id) ? 0.8 : 0.6,
    }));
  } catch (err) {
    console.error('Failed to build extension sitemap entries:', err);
  }

  return [...staticRoutes, ...docRoutes, ...extensionRoutes];
}