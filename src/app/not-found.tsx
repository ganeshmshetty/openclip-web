import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import { ArrowLeft, Home, Compass, BookOpen } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Page Not Found',
  description: 'The page you are looking for does not exist.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-app)]">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 py-24 sm:py-32">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm mb-6">
            <span className="text-2xl font-bold font-mono text-[var(--accent)]">404</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] mb-3">
            Page not found
          </h1>

          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed mb-8">
            The page or document you&apos;re looking for doesn&apos;t exist, has been moved, or the link may be broken.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-[14px] font-medium shadow-sm hover:opacity-90 transition-opacity"
            >
              <Home className="w-4 h-4" />
              <span>Back to Home</span>
            </Link>

            <Link
              href="/docs/getting-started"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-[14px] font-medium hover:bg-[var(--bg-surface-hover)] transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              <span>Read Docs</span>
            </Link>

            <Link
              href="/extensions"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-[14px] font-medium hover:bg-[var(--bg-surface-hover)] transition-colors"
            >
              <Compass className="w-4 h-4" />
              <span>Extensions</span>
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
