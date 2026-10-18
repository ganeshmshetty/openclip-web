'use client';

import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import {
  Sliders,
  ShieldCheck,
  Droplets,
  Layers,
  Sparkles
} from 'lucide-react';
import { DownloadPill, SponsorPill, BrewPill } from '../components/CtaPills';

function AppleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.13.64-2.79 1.41-.58.68-1.1 1.76-1.01 2.81 1.07.08 2.18-.6 2.79-1.35z" />
    </svg>
  );
}

export default function HeroTexturePreviewPage() {
  const [opacity, setOpacity] = useState(22);
  const [blendMode, setBlendMode] = useState<'overlay' | 'soft-light' | 'screen' | 'luminosity' | 'multiply'>('overlay');
  const [blurAmount, setBlurAmount] = useState(0);
  const [stylePreset, setStylePreset] = useState<'subtle-glass' | 'water-refract' | 'deep-fluid' | 'raw-vivid'>('subtle-glass');

  const applyPreset = (preset: 'subtle-glass' | 'water-refract' | 'deep-fluid' | 'raw-vivid') => {
    setStylePreset(preset);
    if (preset === 'subtle-glass') {
      setOpacity(18);
      setBlendMode('overlay');
      setBlurAmount(2);
    } else if (preset === 'water-refract') {
      setOpacity(32);
      setBlendMode('soft-light');
      setBlurAmount(0);
    } else if (preset === 'deep-fluid') {
      setOpacity(28);
      setBlendMode('luminosity');
      setBlurAmount(4);
    } else if (preset === 'raw-vivid') {
      setOpacity(45);
      setBlendMode('overlay');
      setBlurAmount(0);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)] relative overflow-hidden">
      <Navbar />

      {/* ── Texturelabs Water 121L Background Layer ── */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-300"
          style={{
            backgroundImage: `url('/api/preview-texture')`,
            opacity: opacity / 100,
            mixBlendMode: blendMode,
            filter: blurAmount > 0 ? `blur(${blurAmount}px)` : 'none',
            transform: blurAmount > 0 ? 'scale(1.05)' : 'scale(1)',
          }}
        />

        {/* Soft Radial Gradient Falloff so Text Stays 100% Readable */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 35%, transparent 20%, var(--bg-app) 80%)',
          }}
        />
      </div>

      {/* ── Controls Bar ── */}
      <div className="pt-6 pb-2 px-4 max-w-4xl mx-auto w-full relative z-30">
        <div className="text-center mb-5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-[12px] font-mono mb-2 shadow-xs">
            <Droplets className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Texturelabs_Water_121L.jpg Preview</span>
          </span>
          <h2 className="text-[22px] sm:text-[28px] font-bold tracking-tight">
            Live Water Texture Overlay
          </h2>
          <p className="text-[13px] sm:text-[14px] text-[var(--text-secondary)] mt-1 max-w-lg mx-auto">
            Loaded directly from your Downloads folder via live stream. Test presets or adjust opacity and blend modes below.
          </p>
        </div>

        {/* Presets & Sliders Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-surface)]/90 backdrop-blur-xl border border-[var(--border-subtle)] shadow-lg max-w-2xl mx-auto space-y-4">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {[
              { id: 'subtle-glass', label: '1. Subtle Glass (Recommended)' },
              { id: 'water-refract', label: '2. Water Refraction' },
              { id: 'deep-fluid', label: '3. Deep Fluid Luminosity' },
              { id: 'raw-vivid', label: '4. High Contrast Vivid' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id as any)}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer ${
                  stylePreset === p.id
                    ? 'bg-[var(--text-primary)] text-[var(--bg-app)] font-semibold shadow-xs'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Interactive Sliders & Blend Selector */}
          <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-[var(--border-subtle)] text-[12px] font-mono">
            {/* Opacity Slider */}
            <div>
              <div className="flex justify-between mb-1 text-[var(--text-secondary)]">
                <span>Opacity</span>
                <span className="font-bold text-[var(--accent)]">{opacity}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="80"
                value={opacity}
                onChange={(e) => {
                  setOpacity(Number(e.target.value));
                  setStylePreset('' as any);
                }}
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>

            {/* Blur Slider */}
            <div>
              <div className="flex justify-between mb-1 text-[var(--text-secondary)]">
                <span>Soft Blur</span>
                <span className="font-bold text-[var(--accent)]">{blurAmount}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={blurAmount}
                onChange={(e) => {
                  setBlurAmount(Number(e.target.value));
                  setStylePreset('' as any);
                }}
                className="w-full accent-[var(--accent)] cursor-pointer"
              />
            </div>

            {/* Blend Mode Selector */}
            <div>
              <div className="flex justify-between mb-1 text-[var(--text-secondary)]">
                <span>Blend Mode</span>
                <span className="font-bold text-[var(--accent)]">{blendMode}</span>
              </div>
              <select
                value={blendMode}
                onChange={(e) => {
                  setBlendMode(e.target.value as any);
                  setStylePreset('' as any);
                }}
                className="w-full px-2 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-[11.5px] cursor-pointer"
              >
                <option value="overlay">overlay</option>
                <option value="soft-light">soft-light</option>
                <option value="luminosity">luminosity</option>
                <option value="screen">screen</option>
                <option value="multiply">multiply</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── HERO CONTENT WITH LIVE TEXTURE UNDERNEATH ── */}
      <main className="flex-1 relative flex flex-col justify-center items-center py-12 sm:py-20 px-4 sm:px-8 z-10">
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <p className="text-[12.5px] sm:text-[14.5px] font-medium text-[var(--text-secondary)] tracking-tight mb-3 sm:mb-6">
            The missing floating action bar for macOS
          </p>

          <h1 className="text-[38px] sm:text-[68px] font-bold tracking-[-0.04em] leading-[1.05] text-[var(--text-primary)]">
            Select text.<br />Do things.
          </h1>

          <p className="mt-4 sm:mt-6 text-[15px] sm:text-[18.5px] text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed font-normal">
            A native floating action bar for macOS. Highlight any text to copy, calculate, transform, or run custom scripts — without switching windows.
          </p>

          {/* Floating CTA Buttons */}
          <div className="mt-6 sm:mt-8 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 w-full px-2" data-nosnippet="true">
            <DownloadPill />
            <BrewPill />
            <SponsorPill />
          </div>

          {/* Compatibility Strip */}
          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[11.5px] sm:text-[12px] font-medium text-[var(--text-tertiary)]">
            <span className="inline-flex items-center gap-1">
              <AppleIcon className="w-3 h-3 text-[var(--text-secondary)] shrink-0" />
              <span>macOS 14+ Sonoma &amp; Sequoia</span>
            </span>
            <span className="text-[var(--border-strong)] opacity-40">·</span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>100% Free &amp; Open Source</span>
            </span>
            <span className="text-[var(--border-strong)] opacity-40">·</span>
            <span>Zero Tracking</span>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
