'use client';

import React from 'react';
import { Calculator, Sparkles, CaseUpper, BookOpen, Code } from 'lucide-react';

interface SprinkleItem {
  id: string;
  type: 'math' | 'grammar' | 'case' | 'define' | 'json';
  label: string;
  text: string;
  icon: React.ElementType;
  className: string;
  animationClass: string;
}

const SPRINKLES: SprinkleItem[] = [
  {
    id: 'math-1',
    type: 'math',
    label: 'Math',
    text: '15 * 80 + 42',
    icon: Calculator,
    className: 'top-10 left-2 xl:left-6',
    animationClass: 'float-slow-1',
  },
  {
    id: 'grammar-1',
    type: 'grammar',
    label: 'Fix Grammar',
    text: 'ligthweight popuup utilty',
    icon: Sparkles,
    className: 'top-12 right-2 xl:right-6',
    animationClass: 'float-slow-2',
  },
  {
    id: 'case-1',
    type: 'case',
    label: 'Transform Case',
    text: 'openclip_floating_bar',
    icon: CaseUpper,
    className: 'top-48 left-0 xl:left-2',
    animationClass: 'float-slow-3',
  },
  {
    id: 'define-1',
    type: 'define',
    label: 'Define Word',
    text: 'Accessibility',
    icon: BookOpen,
    className: 'top-52 right-0 xl:right-2',
    animationClass: 'float-slow-1',
  },
  {
    id: 'math-2',
    type: 'math',
    label: 'Math',
    text: '24 * 60 * 365',
    icon: Calculator,
    className: 'bottom-4 left-6 xl:left-14',
    animationClass: 'float-slow-2',
  },
  {
    id: 'json-1',
    type: 'json',
    label: 'Format JSON',
    text: '{"action":"openclip","lang":"swift"}',
    icon: Code,
    className: 'bottom-6 right-6 xl:right-14',
    animationClass: 'float-slow-3',
  },
];

export default function FloatingSprinkles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-10 hidden xl:block">
      <div className="relative w-full h-full max-w-6xl mx-auto pointer-events-auto">
        {SPRINKLES.map(({ id, label, text, icon: Icon, className, animationClass }) => (
          <div
            key={id}
            className={`absolute ${className} ${animationClass} transition-all duration-300 hover:scale-105 hover:z-20`}
          >
            <div className="glass-pill group relative flex items-center gap-2 px-3 py-1.5 rounded-xl hover:border-[var(--accent-border)] shadow-sm hover:shadow-md transition-all">
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                <Icon className="w-3 h-3" />
              </span>

              <div className="flex flex-col">
                <span className="text-[9.5px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors leading-none mb-0.5">
                  {label}
                </span>
                <span className="text-[12px] font-mono text-[var(--text-primary)] font-medium select-text cursor-text leading-tight">
                  {text}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
