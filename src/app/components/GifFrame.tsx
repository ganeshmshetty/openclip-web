'use client';

import { useState, useRef, useEffect } from 'react';
import { FileVideo } from 'lucide-react';

interface GifFrameProps {
  src: string;
  alt: string;
  name: string;
  isActive?: boolean;
  onEnded?: () => void;
  onProgress?: (progress: number) => void;
  loop?: boolean;
}

export default function GifFrame({
  src,
  alt,
  name,
  isActive = true,
  onEnded,
  onProgress,
  loop,
}: GifFrameProps) {
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef(false);
  const mp4Path = src.endsWith('.mp4') ? src : src.replace(/\.gif$/, '.mp4');

  // Handle visibility changes via IntersectionObserver
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Play once 25% or more is visible in the viewport
          if (entry.isIntersecting && entry.intersectionRatio >= 0.25) {
            isVisibleRef.current = true;
            if (isActive) {
              video.play().catch(() => {});
            }
          } else if (!entry.isIntersecting || entry.intersectionRatio < 0.1) {
            isVisibleRef.current = false;
            video.pause();
          }
        });
      },
      {
        threshold: [0, 0.1, 0.25, 0.5],
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [isActive]);

  // Handle active state changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.currentTime = 0;
      onProgress?.(0);
      if (isVisibleRef.current) {
        video.play().catch(() => {});
      }
    } else {
      video.pause();
      video.currentTime = 0;
      onProgress?.(0);
    }
  }, [isActive, onProgress]);

  // Handle smooth progress reporting while active
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isActive || !onProgress) return;

    let animId: number;
    const reportProgress = () => {
      if (video.duration && !video.paused) {
        const p = Math.min(Math.max(video.currentTime / video.duration, 0), 1);
        onProgress(p);
      }
      animId = requestAnimationFrame(reportProgress);
    };

    animId = requestAnimationFrame(reportProgress);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isActive, onProgress]);

  const isLooping = loop ?? (onEnded ? false : true);

  const handleEnded = () => {
    onProgress?.(1);
    onEnded?.();
  };

  return (
    <div
      ref={containerRef}
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl"
    >
      <div className="relative bg-[var(--bg-elevated)] overflow-hidden">
        {error ? (
          <div className="aspect-[16/10] bg-[var(--bg-elevated)] flex flex-col items-center justify-center gap-2.5 p-6 sm:p-10 text-center">
            <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent)] shadow-sm">
              <FileVideo className="w-5 h-5 sm:w-6 sm:h-6" />
            </span>
            <p className="text-[13px] sm:text-[14px] font-semibold text-[var(--text-primary)]">Preview Demo</p>
            <p className="font-mono text-[11px] sm:text-[11.5px] text-[var(--text-tertiary)] max-w-xs">
              Drop <span className="text-[var(--accent)] font-semibold">{name}</span> into <code className="bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">/public/gifs/</code>
            </p>
          </div>
        ) : (
          <video
            ref={videoRef}
            loop={isLooping}
            muted
            playsInline
            preload="metadata"
            aria-label={alt}
            onEnded={handleEnded}
            onError={() => setError(true)}
            className="block w-full h-auto object-cover transition-transform duration-500 hover:scale-[1.01]"
          >
            <source src={mp4Path} type="video/mp4" />
          </video>
        )}
      </div>
    </div>
  );
}
