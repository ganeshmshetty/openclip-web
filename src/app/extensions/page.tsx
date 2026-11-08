import type { Metadata } from 'next';
import { getCatalog, loadFeatured, toListingItem } from '@/lib/extensions';
import ExtensionsContent from './ExtensionsContent';

// Prerendered at build time. The catalog is baked into the deploy, so a page view
// costs one cache read and never reaches GitHub.

export const metadata: Metadata = {
  title: 'The Clip Store',
  description:
    'Browse and install community extensions for OpenClip — the macOS floating action bar. Extensions sync directly from GitHub and install natively without restarting.',
  alternates: { canonical: '/extensions' },
  openGraph: {
    url: '/extensions',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    images: ['/twitter-image'],
  },
};

export default async function ExtensionsPage() {
  const [catalog, featuredIDs] = await Promise.all([
    getCatalog(),
    loadFeatured(),
  ]);
  return (
    <ExtensionsContent
      extensions={catalog.map(toListingItem)}
      featuredIDs={featuredIDs}
    />
  );
}