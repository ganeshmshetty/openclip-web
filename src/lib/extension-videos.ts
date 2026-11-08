/**
 * Central registry for extension demo / preview videos.
 *
 * Map an extension identifier (in lowercase or canonical format) to its hosted video URL
 * (e.g. Cloudflare R2, CDN, or MP4 asset).
 *
 * When an entry exists here, the extension's detail page on the website will render a
 * dedicated Hero Video preview above the documentation.
 */

import { mediaURL } from './media';

export const EXTENSION_PREVIEW_VIDEOS: Record<string, string> = {
  'com.openclip.quickdecision': mediaURL('extensions/com.openclip.quickdecision.mp4'),
  'com.openclip.render-mermaid': mediaURL('extensions/com.openclip.render-mermaid.mp4'),
  'com.openclip.shortenlink': mediaURL('extensions/com.openclip.shortenlink.mp4'),
  'com.openclip.qrcode': mediaURL('extensions/com.openclip.qrcode.mp4'),
  'com.openclip.antinote': mediaURL('extensions/com.openclip.antinote.mp4'),
  'com.openclip.leafy': mediaURL('extensions/com.openclip.leafy.mp4'),

  // Add more extension videos here gradually:
  // 'com.openclip.wordcount': 'https://assets.getopenclip.app/word-count.mp4',
  // 'com.openclip.copy-as-markdown': 'https://assets.getopenclip.app/copy-markdown.mp4',
};

/**
 * Resolves the preview video URL for a given extension ID (case-insensitive).
 */
export function getExtensionPreviewVideo(extensionId: string): string | undefined {
  if (!extensionId) return undefined;
  const normalizedId = extensionId.trim().toLowerCase();

  for (const [key, url] of Object.entries(EXTENSION_PREVIEW_VIDEOS)) {
    if (key.toLowerCase() === normalizedId && url && url.trim().length > 0) {
      return url.trim();
    }
  }

  return undefined;
}
