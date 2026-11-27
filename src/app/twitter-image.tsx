import { renderOgImage } from '@/lib/og-image';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'OpenClip — Turn text into action';
export const dynamic = 'force-static';

export default function TwitterImage() {
  return renderOgImage();
}
