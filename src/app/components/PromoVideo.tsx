'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'motion/react';
import { Volume2, VolumeX } from 'lucide-react';

const PROMO_VIDEO_URL =
  'https://pub-3cf3907486a54f7ab91eda44c426a7d3.r2.dev/OpenClip-promo-compressed.mp4';

export default function PromoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const [muted, setMuted] = useState(true);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start 60vh', 'end end'],
  });
  const sceneProgress = useSpring(scrollYProgress, {
    stiffness: 280,
    damping: 34,
    mass: 0.45,
  });

  const shadowOpacity = useTransform(
    sceneProgress,
    [0, 0.12, 0.78, 1],
    [0.4, 1, 1, 0]
  );

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    let isInView = false;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isInView = entry.isIntersecting && entry.intersectionRatio >= 0.85;
          if (isInView && document.visibilityState === 'visible') {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: [0, 0.5, 0.75, 0.85, 1.0] }
    );

    observer.observe(container);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isInView) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted) {
      video.play().catch(() => {});
    }
  };

  return (
    <section ref={sectionRef} className="relative h-[120vh] sm:h-[135vh] overflow-x-clip">
      <div
        ref={containerRef}
        className="sticky top-1/2 z-30 mx-auto mt-[18vh] w-[92%] sm:w-[74%] max-w-4xl -translate-y-1/2 sm:mt-[38vh]"
      >
        {/* Expanded rectangular-radial ambient vignette with wide, smooth dissipation */}
        <motion.div
          style={{ opacity: shadowOpacity }}
          className="pointer-events-none absolute -inset-x-20 -inset-y-14 sm:-inset-x-48 sm:-inset-y-36 md:-inset-x-60 md:-inset-y-44 -z-10 rounded-[60px] sm:rounded-[90px] bg-[radial-gradient(ellipse_at_50%_50%,rgba(0,0,0,0.52)_0%,rgba(0,0,0,0.3)_36%,rgba(0,0,0,0.12)_65%,rgba(0,0,0,0.03)_82%,transparent_100%)] dark:bg-[radial-gradient(ellipse_at_50%_50%,rgba(0,0,0,0.95)_0%,rgba(0,0,0,0.7)_36%,rgba(0,0,0,0.32)_65%,rgba(0,0,0,0.08)_82%,transparent_100%)] blur-3xl sm:blur-[64px]"
          aria-hidden="true"
        />

        {/* Video Card with clean, subtle base shadow */}
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-black shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.4)] ring-1 ring-black/10 dark:ring-white/10">
          <video
            ref={videoRef}
            src={PROMO_VIDEO_URL}
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="OpenClip product demo video"
            className="block w-full h-auto aspect-video object-cover"
          />
          <button
            onClick={toggleMute}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md text-white text-[12px] font-medium hover:bg-black/70 transition-colors cursor-pointer select-none"
            aria-label={muted ? 'Unmute video' : 'Mute video'}
          >
            {muted ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
            <span>{muted ? 'Unmute' : 'Mute'}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
