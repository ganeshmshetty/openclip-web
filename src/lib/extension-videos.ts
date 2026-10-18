/**
 * Central registry for extension demo / preview videos.
 *
 * Map an extension identifier (in lowercase or canonical format) to its hosted video URL
 * (e.g. Cloudflare R2, CDN, or MP4 asset).
 *
 * When an entry exists here, the extension's detail page on the website will render a
 * dedicated Hero Video preview above the documentation.
 */

export const EXTENSION_PREVIEW_VIDEOS: Record<string, string> = {
  // Quick Decision
  'com.openclip.quickdecision': 'https://pub-3cf3907486a54f7ab91eda44c426a7d3.r2.dev/extensions/com.openclip.quickdecision.mp4',

  // Add more extension videos here gradually:
  // 'com.openclip.wordcount': 'https://media.getopenclip.app/word-count.mp4',
  // 'com.openclip.copy-as-markdown': 'https://media.getopenclip.app/copy-markdown.mp4',
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
