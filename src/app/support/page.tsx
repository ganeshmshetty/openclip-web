import type { Metadata } from 'next';
import { siteUrl } from '@/lib/site';
import SupportContent from './SupportContent';

export const metadata: Metadata = {
  title: 'Support OpenClip — Sponsor Independent macOS Development',
  description:
    'Support the development of OpenClip, the free and 100% open-source floating action bar for macOS. Sponsor independent software via GitHub Sponsors, Buy Me a Coffee, or Ko-fi.',
  keywords: [
    'Support OpenClip',
    'Sponsor OpenClip',
    'Donate OpenClip',
    'OpenClip GitHub Sponsors',
    'OpenClip Buy Me a Coffee',
    'OpenClip Ko-fi',
    'Open source macOS app sponsor',
    'macOS productivity tools sponsor',
    'Free PopClip alternative support',
    'Ganesh M open source',
  ],
  alternates: { canonical: `${siteUrl}/support` },
  openGraph: {
    title: 'Support OpenClip — Sponsor Free & Independent macOS Software',
    description:
      'OpenClip is 100% free, AGPL-3.0 open-source, and privacy-first. Sponsor the project via GitHub Sponsors, Buy Me a Coffee, or Ko-fi to fund ongoing macOS updates and new extensions.',
    url: `${siteUrl}/support`,
    siteName: 'OpenClip',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: `${siteUrl}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: 'Support OpenClip — Sponsor Development',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Support OpenClip — Sponsor Independent macOS Software',
    description:
      'OpenClip is 100% free & open-source. Help support ongoing macOS development on GitHub Sponsors, Buy Me a Coffee, or Ko-fi.',
    creator: '@pandannzo',
    images: [`${siteUrl}/twitter-image`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function SupportPage() {
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
        name: 'Support OpenClip',
        item: `${siteUrl}/support`,
      },
    ],
  };

  const jsonLdWebPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Support OpenClip — Sponsor Independent macOS Development',
    description:
      'Support the development of OpenClip, the free and 100% open-source floating action bar for macOS.',
    url: `${siteUrl}/support`,
    isPartOf: {
      '@type': 'WebSite',
      name: 'OpenClip',
      url: siteUrl,
    },
    mainEntity: {
      '@type': 'SoftwareApplication',
      name: 'OpenClip',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'macOS 14.0+',
      offers: {
        '@type': 'Offer',
        price: '0.00',
        priceCurrency: 'USD',
      },
      author: {
        '@type': 'Person',
        name: 'Ganesh M',
        url: 'https://github.com/ganeshmshetty',
      },
      potentialAction: {
        '@type': 'DonateAction',
        recipient: {
          '@type': 'Person',
          name: 'Ganesh M',
          url: 'https://github.com/ganeshmshetty',
        },
        target: [
          'https://github.com/sponsors/ganeshmshetty',
          'https://buymeacoffee.com/ganeshmshetty',
          'https://ko-fi.com/ganeshmshetty',
        ],
      },
    },
  };

  const jsonLdFaq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Why sponsor OpenClip if it is free and open-source?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'OpenClip is 100% free and open-source under the AGPL-3.0 license with no paywalls, subscriptions, or telemetry. Sponsorships directly support active development time, macOS Sonoma/Sequoia compatibility, bug fixes, and extension ecosystem infrastructure.',
        },
      },
      {
        '@type': 'Question',
        name: 'How can I support or donate to OpenClip?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'You can support OpenClip via GitHub Sponsors (supporting recurring monthly or custom one-time contributions with 0% platform fees), Buy Me a Coffee, or Ko-fi (for instant tips using Apple Pay, cards, or PayPal).',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I support OpenClip without donating money?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Absolutely! You can star the OpenClip repository on GitHub, leave a review on AlternativeTo, share OpenClip on X (Twitter), report issues, or contribute new extensions.',
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebPage) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFaq) }}
      />
      <SupportContent />
    </>
  );
}
