import { ImageResponse } from 'next/og';
import fs from 'node:fs';
import path from 'node:path';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'OpenClip — Floating Action Bar for macOS';

// See opengraph-image.tsx: build-time only, the icon comes from disk.
export const dynamic = 'force-static';

export default function TwitterImage() {
  let iconBase64 = '';
  try {
    const iconPath = path.join(process.cwd(), 'public/icons/openclip-icon.png');
    const iconBuffer = fs.readFileSync(iconPath);
    iconBase64 = `data:image/png;base64,${iconBuffer.toString('base64')}`;
  } catch {}

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          background: '#08090d',
          color: '#f5f5f7',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Ambient radial blue spotlight glow */}
        <div
          style={{
            position: 'absolute',
            width: '650px',
            height: '650px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(41, 151, 255, 0.16) 0%, rgba(41, 151, 255, 0) 70%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Large App Icon */}
        {iconBase64 ? (
          <img
            src={iconBase64}
            alt="OpenClip"
            style={{
              width: '144px',
              height: '144px',
              borderRadius: '34px',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.16)',
              marginBottom: '30px',
            }}
          />
        ) : (
          <div
            style={{
              width: '144px',
              height: '144px',
              borderRadius: '34px',
              background: '#2997ff',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8)',
              marginBottom: '30px',
            }}
          />
        )}

        {/* Brand Title */}
        <div
          style={{
            fontSize: '68px',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
            color: '#ffffff',
            marginBottom: '14px',
          }}
        >
          OpenClip
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '26px',
            color: '#8e8e93',
            fontWeight: 400,
            letterSpacing: '-0.015em',
          }}
        >
          Floating Action Bar for macOS
        </div>
      </div>
    ),
    size,
  );
}
