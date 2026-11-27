/* eslint-disable @next/next/no-img-element -- Satori's ImageResponse only renders img tags */
import { ImageResponse } from 'next/og';
import fs from 'node:fs';
import path from 'node:path';

// The card is a fixed brand asset rather than generated layout: the dot grid,
// highlighted word and real action bar stay pixel-identical to the banner.
export function renderOgImage() {
  const bannerPath = path.join(process.cwd(), 'public/brand/og-1200x630.png');
  const banner = `data:image/png;base64,${fs.readFileSync(bannerPath).toString('base64')}`;

  return new ImageResponse(
    <img src={banner} alt="" width={1200} height={630} />,
    { width: 1200, height: 630 },
  );
}
