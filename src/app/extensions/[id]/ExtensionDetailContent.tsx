'use client';

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import {
  Download,
  Check,
  User,
  ShieldCheck,
  ChevronRight,
  Plus,
  ExternalLink,
  Sliders,
  Cpu,
} from 'lucide-react';
import type { ExtensionItem } from '@/lib/extensions';
import ExtensionIcon from '../../components/ExtensionIcon';
import { MarkdownRenderer } from '@/docs/components/MarkdownRenderer';
import { getExtensionPreviewVideo } from '@/lib/extension-videos';

interface Props {
  extension: ExtensionItem;
  relatedExtensions?: ExtensionItem[];
}

export default function ExtensionDetailContent({ extension, relatedExtensions = [] }: Props) {
  const [installed, setInstalled] = useState(false);
  const previewVideo = getExtensionPreviewVideo(extension.id);

  const handleInstall = () => {
    const installURL = `openclip://install?id=${encodeURIComponent(extension.id)}&name=${encodeURIComponent(extension.name)}&url=${encodeURIComponent(extension.downloadURL)}`;
    window.location.assign(installURL);
    setInstalled(true);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-[var(--bg-app)]">
      <div className="hero-glow" />
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
          {/* Header Section (Border-Free & Clean) */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6">
            <div className="flex items-start sm:items-center gap-5">
              <ExtensionIcon
                id={extension.id}
                name={extension.name}
                iconURL={extension.iconURL}
                size={68}
                className="rounded-2xl shadow-sm shrink-0"
              />
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                    {extension.name}
                  </h1>
                  {extension.actionType && (
                    <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                      {extension.actionType}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5 mt-2 flex-wrap text-[13px] text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                    <User className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                    {extension.author}
                  </span>
                  <span className="opacity-30">·</span>
                  <span className="font-mono text-[12px] text-[var(--text-tertiary)]">
                    v{extension.version ?? '1.0.0'}
                  </span>
                  <span className="opacity-30">·</span>
                  <span className="font-mono text-[12px] text-[var(--text-tertiary)]">
                    {extension.id}
                  </span>
                </div>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
              <button
                onClick={handleInstall}
                className={`flex-1 sm:flex-none px-6 py-2.5 text-sm font-medium rounded-xl transition-all shadow-xs ${
                  installed
                    ? 'btn-secondary text-emerald-500 border-emerald-500/30'
                    : 'btn-primary'
                }`}
              >
                {installed ? (
                  <span className="flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    <span>Opening in OpenClip…</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    <span>Install Extension</span>
                  </span>
                )}
              </button>

              <a
                href={extension.downloadURL}
                download
                title="Download .openclipext package"
                className="btn-secondary px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 text-[13px]"
              >
                <Download className="w-4 h-4 text-[var(--text-secondary)]" />
                <span className="hidden sm:inline">Package</span>
              </a>
            </div>
          </div>

          {/* Dynamic Informational Metadata Strip (Border-Free) */}
          <div className="flex items-center flex-wrap gap-x-6 gap-y-3 py-3.5 px-5 rounded-2xl bg-[var(--bg-surface)] text-[12.5px] text-[var(--text-secondary)] shadow-xs">
            {/* Downloads */}
            <div className="flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="font-semibold text-[var(--text-primary)]">
                {extension.downloadCount.toLocaleString()}
              </span>
              <span>installs</span>
            </div>

            {/* Action Engine */}
            {extension.actionType && (
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                <span className="text-[var(--text-primary)] font-medium">
                  {extension.actionType}
                </span>
              </div>
            )}

            {/* Options */}
            {extension.options && extension.options.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[var(--text-primary)] font-medium">
                  {extension.options.length} {extension.options.length === 1 ? 'Setting' : 'Settings'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 opacity-80">
                <Sliders className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                <span>Zero config</span>
              </div>
            )}

            {/* Minimum OpenClip Version */}
            {extension.minOpenClipVersion && (
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>OpenClip &ge; {extension.minOpenClipVersion}</span>
              </div>
            )}

            {/* Compatibility */}
            <div className="flex items-center gap-1.5 opacity-80">
              <span>macOS 14+ Sonoma &amp; Sequoia</span>
            </div>

            {/* GitHub Source Link */}
            {extension.sourceURL && (
              <a
                href={extension.sourceURL}
                target="_blank"
                rel="noopener noreferrer"
                className="sm:ml-auto flex items-center gap-1 text-[var(--accent)] hover:underline font-medium"
              >
                <span>View Source</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
 
          {/* Hero Video Preview (rendered when configured in extension-videos.ts) */}
          {previewVideo && (
            <div className="mt-8 rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs">
              <video
                src={previewVideo}
                autoPlay
                loop
                muted
                playsInline
                controls
                className="w-full h-auto aspect-video object-cover bg-black/5"
              />
            </div>
          )}

          {/* Extension Documentation (README rendered natively with MarkdownRenderer) */}
          <article className="mt-8 pt-4">
            {extension.readmeMarkdown ? (
              <MarkdownRenderer content={extension.readmeMarkdown} />
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

              <div className="grid sm:grid-cols-2 gap-3">
                {relatedExtensions.map((rel) => (
                  <Link
                    key={rel.id}
                    href={`/extensions/${rel.id}`}
                    className="p-4 rounded-2xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-colors flex items-center gap-3.5 group"
                  >
                    <ExtensionIcon
                      id={rel.id}
                      name={rel.name}
                      iconURL={rel.iconURL}
                      size={36}
                      className="rounded-lg shrink-0 group-hover:scale-105 transition-transform"
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

      <Footer />
    </div>
  );
}