import type { MetadataRoute } from 'next';

// Static export: generated once at build time.
export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OpenClip — Floating Action Bar for macOS',
    short_name: 'OpenClip',
    description:
      'Turn selected text into instant actions on macOS. Copy, calculate, transform text, or run custom scripts from a floating action bar.',
    start_url: '/',
    display: 'standalone',
    background_color: '#090a0f',
    theme_color: '#2997ff',
    icons: [
      {
        src: '/favicon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/favicon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/openclip-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
