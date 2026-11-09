'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import { Home, RotateCw } from 'lucide-react';

/**
 * Route-level error boundary. Keeps a failed page inside the site chrome instead
 * of falling back to Next's bare error screen. `reset()` retries the segment.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-app)]">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 py-24 sm:py-32">
        <div className="max-w-lg w-full text-center">
          <p className="text-[12px] font-medium text-[var(--text-tertiary)] mb-4">500</p>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-3">
            Something went wrong
          </h1>

          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed mb-8">
            This page hit an unexpected error. It is usually temporary — try again in a moment.
          </p>

          {error.digest ? (
            <p className="text-[12px] text-[var(--text-tertiary)] mb-6">
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="w-full sm:w-auto whitespace-nowrap inline-flex items-center justify-center gap-2 px-5 h-[42px] rounded-full bg-[var(--accent)] text-white text-[14px] font-medium hover:bg-[var(--accent-hover)] transition-colors"
            >
              <RotateCw className="w-4 h-4" />
              <span>Try again</span>
            </button>

            <Link
              href="/"
              className="w-full sm:w-auto whitespace-nowrap inline-flex items-center justify-center gap-2 px-5 h-[42px] rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-[14px] font-medium hover:bg-[var(--bg-surface-hover)] transition-colors"
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
