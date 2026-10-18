'use client';

import React, { useEffect, useRef, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { ChangelogData, ChangelogRelease, ReleaseItem } from '@/lib/changelog';
import { downloadLatestDmg } from '@/lib/downloadClient';
import { Check, ArrowUpRight, Hash } from 'lucide-react';

interface Props {
  changelog: ChangelogData;
}

function AppleIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.13.64-2.79 1.41-.58.68-1.1 1.76-1.01 2.81 1.07.08 2.18-.6 2.79-1.35z" />
    </svg>
  );
}

function FormattedText({ text }: { text: string }) {
  // Regex matches `code`, **bold**, *italic*, and [link](url)
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
          return (
            <code
              key={index}
              className="px-1.5 py-0.5 text-[12px] font-mono rounded bg-black/[0.04] dark:bg-white/[0.08] text-[var(--text-primary)] font-medium"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
          return (
            <strong key={index} className="font-semibold text-[var(--text-primary)]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
          return (
            <em key={index} className="italic text-[var(--text-secondary)]">
              {part.slice(1, -1)}
            </em>
          );
        }
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const [, label, href] = linkMatch;
          return (
            <a
              key={index}
              href={href}
              target={href.startsWith('http') ? '_blank' : undefined}
              rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="text-[var(--accent)] hover:underline decoration-1 underline-offset-2 font-medium"
            >
              {label}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

function ChangelogItemView({ item }: { item: ReleaseItem }) {
  return (
    <li className="flex items-start gap-2.5 text-[14px] leading-6 text-[var(--text-secondary)]">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] mt-2 shrink-0 opacity-80" />
      <div className="flex-1">
        {item.title ? (
          <>
            <span className="font-semibold text-[var(--text-primary)] mr-1">
              <FormattedText text={item.title} />:

            </span>{' '}
            <FormattedText text={item.description} />
          </>
        ) : (
          <FormattedText text={item.description} />
        )}
      </div>
    </li>
  );
}

function ReleaseCard({ release, isLatest }: { release: ChangelogRelease; isLatest: boolean }) {
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/changelog#${release.version}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  };
  return (
    <article id={release.version} className="release-panel scroll-mt-28">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-[26px] sm:text-[30px] font-semibold tracking-tight text-[var(--text-primary)]">
            <a href={`#${release.version}`}>{release.version}</a>
          </h2>
          {isLatest && <span className="text-[11px] font-medium px-2 py-1 rounded-md bg-[var(--accent-soft)] text-[var(--accent)]">Latest</span>}
          <button onClick={copyLink} aria-label={`Copy link to ${release.version}`} className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)] rounded-md">
            {copied ? <Check className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
          </button>
        </div>
        <time dateTime={release.date} className="text-[13px] text-[var(--text-secondary)]">{release.displayDate}</time>
      </header>
      {release.intro && <p className="text-[15px] leading-7 text-[var(--text-primary)] mb-6"><FormattedText text={release.intro} /></p>}
      <div className="space-y-6">
        {release.sections.filter(section => section.items.length || section.paragraphs?.length).map((section, index) => (
          <section key={index}>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">{section.title}</h3>
            {section.paragraphs?.map((paragraph, i) => <p key={i} className="text-[14px] leading-6 text-[var(--text-secondary)] mb-3"><FormattedText text={paragraph} /></p>)}
            {section.items.length > 0 && <ul className="space-y-2.5">{section.items.map((item, i) => <ChangelogItemView key={i} item={item} />)}</ul>}
          </section>
        ))}
      </div>
      <a href={`https://github.com/ganeshmshetty/openclip/releases/tag/${release.tag}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-5 text-[12px] text-[var(--text-secondary)] hover:text-[var(--accent)]">
        Release on GitHub <ArrowUpRight className="w-3.5 h-3.5" />
      </a>
    </article>
  );
}

export default function ChangelogClient({ changelog }: Props) {
  const [activeVersion, setActiveVersion] = useState(changelog.releases[0]?.version);
  const navigatorRef = useRef<HTMLElement>(null);
  const selectedRelease = changelog.releases.find(release => release.version === activeVersion) ?? changelog.releases[0];

  useEffect(() => {
    const readHash = () => {
      const version = window.location.hash.slice(1);
      if (changelog.releases.some(release => release.version === version)) setActiveVersion(version);
      else setActiveVersion(changelog.releases[0]?.version);
    };
    const frame = requestAnimationFrame(readHash);
    window.addEventListener('hashchange', readHash);
    window.addEventListener('popstate', readHash);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', readHash);
      window.removeEventListener('popstate', readHash);
    };
  }, [changelog]);

  useEffect(() => {
    navigatorRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }, [activeVersion]);

  const selectVersion = (version: string) => {
    setActiveVersion(version);
    window.history.pushState(null, '', `#${version}`);
  };
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-app)]">
      <Navbar />
      <main className="flex-1 max-w-5xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-10">
        <header className="mb-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] mb-2">Changelog</h1>
          <p className="text-[14px] leading-6 text-[var(--text-secondary)]">{changelog.description}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            <button onClick={() => downloadLatestDmg()} className="btn-primary inline-flex items-center gap-2 cursor-pointer !px-4 !py-2 !text-[13px]"><AppleIcon className="w-4 h-4" />Download OpenClip</button>
            <a href="https://github.com/ganeshmshetty/openclip/releases" className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--accent)] inline-flex items-center gap-1">All releases <ArrowUpRight className="w-3.5 h-3.5" /></a>
          </div>
        </header>
        <div className="grid grid-cols-1 lg:grid-cols-[150px_minmax(0,1fr)] gap-5 lg:gap-7 items-start">
          <aside className="lg:sticky lg:top-28 min-w-0">
            <h2 className="text-[12px] font-medium text-[var(--text-secondary)] mb-3">Release history</h2>
            <nav ref={navigatorRef} aria-label="Release versions" className="flex lg:block gap-2 overflow-x-auto lg:overflow-y-auto lg:max-h-[calc(100vh-180px)] pb-3 lg:pb-0 lg:pr-3 lg:border-r border-[var(--border-subtle)]">
              {changelog.releases.map((release) => (
                <a key={release.version} href={`#${release.version}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); selectVersion(release.version); }} aria-current={selectedRelease?.version === release.version ? 'page' : undefined} aria-controls="release-content" className={`shrink-0 flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md lg:mb-0.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 ${selectedRelease?.version === release.version ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'}`}>
                  <span>{release.version}</span>
                  <span className="hidden lg:inline text-[10px] font-normal">{release.date.slice(5)}</span>
                </a>
              ))}
            </nav>
          </aside>
          <div id="release-content" className="min-w-0 rounded-xl bg-[var(--bg-surface)] p-4 sm:p-6 border border-[var(--border-subtle)]">
            {!selectedRelease && <p className="text-[var(--text-secondary)]">Release notes are temporarily unavailable. <a href="https://github.com/ganeshmshetty/openclip/releases" className="text-[var(--accent)]">View releases on GitHub.</a></p>}
            {selectedRelease && <ReleaseCard key={selectedRelease.version} release={selectedRelease} isLatest={selectedRelease.version === changelog.releases[0]?.version} />}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
