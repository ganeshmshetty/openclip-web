'use client';

import { useState, useMemo } from 'react';
import { Check, Copy } from 'lucide-react';
import { highlightCode } from '@/lib/prism';

export default function CodeBlock({
  filename,
  code,
  language = 'text',
}: {
  filename?: string;
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const highlightedHtml = useMemo(() => {
    return highlightCode(code, language);
  }, [code, language]);

  return (
    <div className="my-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs">
      {filename && (
        <div className="px-4 py-2.5 bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--border-strong)] opacity-60" />
            <span className="font-mono text-[12px] text-[var(--text-secondary)] font-medium">
              {filename}
            </span>
            {language && language !== 'text' && (
              <span className="text-[11px] font-mono text-[var(--text-tertiary)]">
                {language}
              </span>
            )}
          </div>
          <button
            onClick={copy}
            className="flex items-center gap-1 text-[11.5px] font-mono text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors px-2 py-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Copy code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      )}
      <div className="relative group">
        {!filename && (
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {language && language !== 'text' && (
              <span className="text-[11px] font-mono text-[var(--text-tertiary)] opacity-75">
                {language}
              </span>
            )}
            <button
              onClick={copy}
              className="flex items-center gap-1 text-[11px] font-mono text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors px-2 py-1 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] opacity-0 group-hover:opacity-100"
              aria-label="Copy code"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        )}
        <pre className="p-4 text-[13px] font-mono text-[var(--text-primary)] overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden leading-relaxed bg-[var(--bg-elevated)] font-normal">
          <code
            className={`language-${language}`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        </pre>
      </div>
    </div>
  );
}
