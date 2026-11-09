'use client';

import Link from 'next/link';

/**
 * Last-resort boundary: the root layout itself failed, so this renders its own
 * document. Keep it dependency-free (inline styles, plain anchors) — it must work
 * even when the app's CSS or client bundle is the thing that broke.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#090a0f',
          color: '#f5f5f7',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          padding: '24px',
        }}
      >
        <main style={{ maxWidth: '520px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#8e8e93' }}>500</p>
          <h1 style={{ margin: '0 0 12px', fontSize: '28px', letterSpacing: '-0.02em' }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0 0 28px', fontSize: '15px', lineHeight: 1.6, color: '#a1a1a6' }}>
            The site hit an unexpected error. Please try again — if it keeps happening, reload the
            page.
          </p>
          {error.digest ? (
            <p style={{ margin: '0 0 24px', fontSize: '12px', color: '#8e8e93' }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                height: '42px',
                padding: '0 20px',
                borderRadius: '9999px',
                border: 'none',
                background: '#0071e3',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                height: '42px',
                padding: '0 20px',
                borderRadius: '9999px',
                border: '1px solid #3a3a3c',
                color: '#f5f5f7',
                fontSize: '14px',
                fontWeight: 500,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
