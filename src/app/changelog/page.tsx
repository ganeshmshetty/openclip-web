import type { Metadata } from 'next';
import { getChangelog } from '@/lib/changelog';
import ChangelogClient from './ChangelogClient';

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'All notable user-facing changes, feature additions, and improvements across OpenClip releases for macOS.',
  alternates: { canonical: '/changelog' },
  openGraph: {
    title: 'Changelog — OpenClip',
    description:
      'All notable user-facing changes, feature additions, and improvements across OpenClip releases for macOS.',
    url: '/changelog',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    title: 'Changelog — OpenClip',
    description:
      'All notable user-facing changes, feature additions, and improvements across OpenClip releases for macOS.',
    images: ['/twitter-image'],
  },
};

export default async function ChangelogPage() {
  const changelog = await getChangelog();
  return <ChangelogClient changelog={changelog} />;
}
