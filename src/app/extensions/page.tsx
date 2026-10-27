import type { Metadata } from 'next';
import { getCatalog, loadFeatured } from '@/lib/extensions';
import ExtensionsContent from './ExtensionsContent';

// Revalidate instead of rendering per request: the catalog changes rarely, and a
// cold dynamic render has to reach GitHub before it can emit a byte. Five minutes
// matches the changelog; the API route stays the live source.
export const revalidate = 86400;

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
  const [extensions, featuredIDs] = await Promise.all([
    getCatalog(),
    loadFeatured(),
  ]);
  return <ExtensionsContent extensions={extensions} featuredIDs={featuredIDs} />;
}