import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

// Static export: generated once at build time.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/showcase-preview'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
