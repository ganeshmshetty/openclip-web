'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Info, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';

export const CodeBlock = dynamic(() => import('./CodeBlock'));

export function Callout({
  type = 'info',
  title,
  children,
}: {
  type?: 'info' | 'tip' | 'warning' | 'security';
  title?: string;
  children: React.ReactNode;
}) {
  const styles = {
    info: {
      border: 'border-[var(--accent-border)]',
      bg: 'bg-[var(--accent-soft)]',
      icon: <Info className="w-4 h-4 text-[var(--accent)] shrink-0 mt-0.5" />,
      defaultTitle: 'Note',
      titleColor: 'text-[var(--accent)]',
    },
    tip: {
      border: 'border-emerald-500/20',
      bg: 'bg-emerald-500/8',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />,
      defaultTitle: 'Tip',
      titleColor: 'text-emerald-600 dark:text-emerald-400',
    },
    warning: {
      border: 'border-amber-500/25',
      bg: 'bg-amber-500/8',
      icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />,
      defaultTitle: 'Important',
      titleColor: 'text-amber-600 dark:text-amber-400',
    },
    security: {
      border: 'border-purple-500/25',
      bg: 'bg-purple-500/8',
      icon: <Sparkles className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />,
      defaultTitle: 'Security Guarantee',
      titleColor: 'text-purple-600 dark:text-purple-400',
    },
  }[type];

  return (
    <div className={`my-5 p-4 rounded-xl border ${styles.border} ${styles.bg} text-[13.5px] leading-relaxed`}>
      <div className="flex items-start gap-3">
        {styles.icon}
        <div className="space-y-1 flex-1">
          {(title || styles.defaultTitle) && (
            <p className={`font-semibold text-[13px] ${styles.titleColor}`}>
              {title || styles.defaultTitle}
            </p>
          )}
          <div className="text-[var(--text-secondary)] space-y-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function DocTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="my-5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs">
      <table className="w-full text-left text-[13px] border-collapse">
        <thead>
          <tr className="bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)]">
            {headers.map((h, i) => (
              <th
                key={i}
                className="py-2.5 px-4 font-semibold text-[var(--text-primary)] text-[12px] tracking-tight"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] font-normal text-[var(--text-secondary)]">
          {rows.map((row, rIndex) => (
            <tr key={rIndex} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
              {row.map((cell, cIndex) => (
                <td key={cIndex} className="py-2.5 px-4 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[12px] bg-black/[0.04] dark:bg-white/[0.08] px-1.5 py-0.5 rounded text-[var(--text-primary)] font-medium">
      {children}
    </code>
  );
}

export function DocBadge({
  children,
  variant = 'neutral',
}: {
  children: React.ReactNode;
  variant?: 'neutral' | 'accent' | 'success' | 'warning' | 'purple';
}) {
  const styles = {
    neutral: 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-subtle)]',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  }[variant];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-medium border ${styles}`}
    >
      {children}
    </span>
  );
}

export function FeatureCard({
  title,
  description,
  badge,
  icon,
}: {
  title: string;
  description: string | React.ReactNode;
  badge?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] transition-all shadow-xs space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-[var(--accent)]">{icon}</span>}
          <h4 className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</h4>
        </div>
        {badge && <DocBadge variant="neutral">{badge}</DocBadge>}
      </div>
      <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{description}</p>
    </div>
  );
}
