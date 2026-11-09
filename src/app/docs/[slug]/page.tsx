import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { allDocs, getDocById } from '@/docs/registry';
import DocsView from '@/docs/components/DocsView';
import { siteUrl } from '@/lib/site';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return allDocs.map((doc) => ({ slug: doc.slug }));
}

// Docs ship with the deploy, so unknown slugs are a static 404 rather than an
// on-demand render (which would try to write to the read-only cache on every hit).
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocById(slug);
  if (!doc) return {};
  const url = `${siteUrl}/docs/${doc.slug}`;
  const pageTitle = `${doc.title} — Documentation`;
  const pageDescription = doc.description || `Learn about ${doc.title} in OpenClip for macOS.`;

  return {
    title: pageTitle,
    description: pageDescription,
    alternates: { canonical: url },
    openGraph: {
      title: `${doc.title} — OpenClip Documentation`,
      description: pageDescription,
      url,
      siteName: 'OpenClip',
      type: 'article',
      images: ['/opengraph-image'],
    },
    twitter: {
      card: 'summary_large_image',
      title: pageTitle,
      description: pageDescription,
      images: ['/twitter-image'],
    },
  };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  const doc = getDocById(slug);
  if (!doc) notFound();

  const docUrl = `${siteUrl}/docs/${doc.slug}`;

  const jsonLdArticle = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: doc.title,
    description: doc.description,
    url: docUrl,
    inLanguage: 'en-US',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': docUrl,
    },
    author: {
      '@type': 'Organization',
      name: 'OpenClip',
      url: siteUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: 'OpenClip',
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/icons/openclip-icon.png`,
      },
    },
    keywords: [
      doc.title,
      doc.category,
      'OpenClip macOS',
      'OpenClip documentation',
      'macOS text utility',
      'open source popup actions',
    ],
  };

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
        name: 'Documentation',
        item: `${siteUrl}/docs`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: doc.category,
        item: `${siteUrl}/docs/${doc.slug}`,
      },
      {
        '@type': 'ListItem',
        position: 4,
        name: doc.title,
        item: docUrl,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdArticle) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }}
      />
      <DocsView docId={doc.slug} content={doc.rawMarkdown} />
    </>
  );
}