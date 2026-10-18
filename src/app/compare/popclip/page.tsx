import type { Metadata } from 'next';
import { siteUrl } from '@/lib/site';
import PopClipCompareContent from './PopClipCompareContent';

export const metadata: Metadata = {
  title: 'PopClip Alternative for Mac — Free & Open Source',
  description:
    'Looking for a modern PopClip alternative? OpenClip is a free, 100% open-source floating action bar for macOS with Swift 6 native speed, offline AI, 100+ extensions, and zero subscriptions.',
  alternates: { canonical: `${siteUrl}/compare/popclip` },
  openGraph: {
    title: 'OpenClip vs PopClip — The Modern Free & Open Source Alternative for macOS',
    description:
      'Turn selected text into instant actions on macOS. Compare OpenClip and PopClip: 100% free, AGPL-3.0 open-source, local AI (Ollama + Apple Intelligence), sub-5ms inline math, and universal command palette.',
    url: `${siteUrl}/compare/popclip`,
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OpenClip vs PopClip — Free & Open Source PopClip Alternative for Mac',
    description:
      'Compare OpenClip and PopClip for macOS. Native Swift 6 performance, streaming AI cards, 100+ extensions, and 100% free with no paywalls.',
    images: ['/twitter-image'],
  },
};

export default function PopClipComparePage() {
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
        name: 'Compare',
        item: `${siteUrl}/compare/popclip`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'OpenClip vs PopClip',
        item: `${siteUrl}/compare/popclip`,
      },
    ],
  };

  const jsonLdFaq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is the best free and open-source PopClip alternative for macOS?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'OpenClip is the leading free, 100% open-source PopClip alternative for macOS. Built in Swift 6 for macOS 14 Sonoma and macOS 15 Sequoia, it provides a floating action bar when highlighting text, an open extension catalog, streaming AI actions, and a keyboard command palette (⌥⌘C).',
        },
      },
      {
        '@type': 'Question',
        name: 'Is OpenClip completely free with no paywall or trial period?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. OpenClip is released under the open-source AGPL-3.0 license. It is 100% free forever with no licensing fees, subscriptions, or feature gates.',
        },
      },
      {
        '@type': 'Question',
        name: 'Does OpenClip support local offline AI models?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. OpenClip supports offline local LLMs via Ollama, on-device Apple Intelligence, and cloud OpenAI-compatible APIs (OpenAI, Claude, Groq, OpenRouter) with real-time text streaming directly into native floating cards.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I write or migrate custom extensions from PopClip to OpenClip?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. OpenClip extensions use a simple manifest.json format and support JavaScript, AppleScript, Shell scripts, and macOS Shortcuts. Existing workflows can be easily migrated or created in ~/.openclip/extensions.',
        },
      },
      {
        '@type': 'Question',
        name: 'Does OpenClip store or upload my selected text or clipboard data?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. OpenClip operates under a strict privacy-first architecture using macOS Accessibility APIs to detect selected text without reading or monitoring your clipboard until an action is explicitly clicked. All execution and credentials stay strictly on your Mac.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBreadcrumb) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFaq) }}
      />
      <PopClipCompareContent />
    </>
  );
}
