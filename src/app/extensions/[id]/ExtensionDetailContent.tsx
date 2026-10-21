'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import { Download, ChevronRight } from 'lucide-react';
import type { ExtensionItem } from '@/lib/extensions';
import ExtensionIcon from '../../components/ExtensionIcon';
import { MarkdownRenderer } from '@/docs/components/MarkdownRenderer';
import InlineVideo from '@/app/components/InlineVideo';
import { getExtensionPreviewVideo } from '@/lib/extension-videos';

interface Props {
  extension: ExtensionItem;
  relatedExtensions?: ExtensionItem[];
  diagrams?: Record<string, string>;
}

export default function ExtensionDetailContent({ extension, relatedExtensions = [], diagrams }: Props) {
  const [installed, setInstalled] = useState(false);
  const previewVideo = getExtensionPreviewVideo(extension.id);
  const ctaRef = useRef<HTMLDivElement>(null);
  const [ctaVisible, setCtaVisible] = useState(true);
  const resetTimer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  useEffect(() => {
    const node = ctaRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setCtaVisible(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const handleInstall = () => {
    const installURL = `openclip://install?id=${encodeURIComponent(extension.id)}&name=${encodeURIComponent(extension.name)}&url=${encodeURIComponent(extension.downloadURL)}`;
    window.location.assign(installURL);
    setInstalled(true);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setInstalled(false), 3000);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[var(--bg-app)]">
      <div className="store-glow" aria-hidden="true" />
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-16 w-full z-10">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-tertiary)] mb-8">
          <Link href="/" className="hover:text-[var(--text-primary)] transition-colors">Home</Link>
          <ChevronRight className="w-3.5 h-3.5 opacity-40" />
          <Link href="/extensions" className="hover:text-[var(--text-primary)] transition-colors">Extensions</Link>
          <ChevronRight className="w-3.5 h-3.5 opacity-40" />
          <span className="text-[var(--text-secondary)] truncate">{extension.name}</span>
        </nav>

        <div>
          {/* Header: who it is, and the one thing to do */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 sm:gap-5">
              <ExtensionIcon
                id={extension.id}
                name={extension.name}
                iconURL={extension.iconURL}
                size={68}
                className="rounded-2xl shrink-0 w-14 h-14 sm:w-[68px] sm:h-[68px]"
              />
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                  {extension.name}
                </h1>
                <p className="mt-1 text-[13.5px] text-[var(--text-secondary)]">by {extension.author}</p>
              </div>
            </div>

            <div ref={ctaRef} className="shrink-0 self-start sm:self-auto">
              <button
                onClick={handleInstall}
                className={`store-install inline-flex h-10 items-center justify-center gap-2 rounded-full px-7 text-[14px] font-bold tracking-tight cursor-pointer transition-opacity active:opacity-70`}
              >
                <span>{installed ? 'Opening OpenClip…' : 'Install'}</span>
              </button>
            </div>
          </div>

          {/* Links, then the facts */}
          <div className="mt-6 flex gap-6 text-[13px] font-medium text-[var(--accent)]">
            <a href={extension.downloadURL} download className="hover:underline">
              Download package
            </a>
            {extension.sourceURL && (
              <a href={extension.sourceURL} target="_blank" rel="noopener noreferrer" className="hover:underline">
                View source
              </a>
            )}
          </div>

          <dl className="mt-6 flex flex-wrap gap-x-9 gap-y-4 border-t border-[var(--border-subtle)] pt-5">
            {[
              ['Installs', extension.downloadCount.toLocaleString()],
              extension.actionType ? ['Type', extension.actionType] : null,
              [
                'Settings',
                extension.options && extension.options.length > 0 ? String(extension.options.length) : 'None',
              ],
              extension.minOpenClipVersion ? ['Needs', `OpenClip ${extension.minOpenClipVersion}+`] : null,
              ['Version', extension.version ?? '1.0.0'],
            ].map((fact) =>
              fact ? (
                <div key={fact[0]} className="whitespace-nowrap">
                  <dt className="text-[12px] text-[var(--text-tertiary)]">{fact[0]}</dt>
                  <dd className="mt-1 text-[14px] font-semibold text-[var(--text-primary)]">{fact[1]}</dd>
                </div>
              ) : null
            )}
          </dl>

          {/* Hero Video Preview (rendered when configured in extension-videos.ts) */}
          {previewVideo && (
            <InlineVideo src={previewVideo} title={`${extension.name} demo`} className="mt-8" />
          )}

          {/* Extension Documentation (README rendered natively with MarkdownRenderer) */}
          <article className="mt-8 max-w-[46rem] pt-4">
            {extension.readmeMarkdown ? (
              <MarkdownRenderer content={extension.readmeMarkdown} diagrams={diagrams} />
            ) : (
              <div className="space-y-4">
                <h2 className="text-[20px] font-bold text-[var(--text-primary)]">
                  About {extension.name}
                </h2>
                <p className="text-[var(--text-primary)] leading-relaxed text-[15.5px]">
                  {extension.description}
                </p>
              </div>
            )}
          </article>

          {/* Related Extensions Grid */}
          {relatedExtensions.length > 0 && (
            <div className="mt-16 pt-10 border-t border-[var(--border-subtle)]/60">
              <div className="flex items-center justify-between mb-5 px-1">
                <h2 className="text-[18px] sm:text-[20px] font-bold tracking-tight text-[var(--text-primary)]">
                  Explore More Extensions
                </h2>
                <Link
                  href="/extensions"
                  className="text-[13px] font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1"
                >
                  View all extensions <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              <div className="store-scroll">
                {relatedExtensions.map((rel) => (
                  <Link
                    key={rel.id}
                    href={`/extensions/${rel.id}`}
                    className="spotlight-card p-4 rounded-2xl flex items-center gap-3.5 group"
                  >
                    <ExtensionIcon
                      id={rel.id}
                      name={rel.name}
                      iconURL={rel.iconURL}
                      size={36}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[13.5px] text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                          {rel.name}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--text-tertiary)] shrink-0 flex items-center gap-0.5">
                          <Download className="w-3 h-3 opacity-60" />
                          {rel.downloadCount.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-[12px] text-[var(--text-secondary)] line-clamp-1 mt-0.5">
                        {rel.description}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {!ctaVisible && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-md"
          >
            <div className="sticky-install flex items-center gap-3 rounded-2xl py-2.5 pl-3.5 pr-2.5">
              <ExtensionIcon
                id={extension.id}
                name={extension.name}
                iconURL={extension.iconURL}
                size={36}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-[14px] font-semibold text-[var(--text-primary)]">{extension.name}</p>
                <p className="truncate text-[11.5px] text-[var(--text-tertiary)]">by {extension.author}</p>
              </div>
              <button
                onClick={handleInstall}
                className="store-install inline-flex h-9 items-center gap-1.5 rounded-full px-5 text-[13px] font-bold tracking-tight cursor-pointer active:opacity-70 transition-opacity"
              >
                <span>{installed ? 'Opening…' : 'Install'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}