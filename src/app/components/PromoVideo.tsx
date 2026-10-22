'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { Pause, Play, Volume2 } from 'lucide-react';
import styles from './PromoVideo.module.css';
import VideoGlassLens from './VideoGlassLens';
import VideoControls from './VideoControls';
import { mediaURL } from '@/lib/media';

const FOLLOW_RANGE = 70;
// Full promo on R2. The old OpenClip-promo-compressed.mp4 no longer exists (404).
const PROMO_VIDEO_URL = mediaURL('openclip-promo.mp4');

export default function PromoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const still = useMotionValue(0);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const followX = useSpring(pointerX, { stiffness: 180, damping: 20, mass: 0.7 });
  const followY = useSpring(pointerY, { stiffness: 180, damping: 20, mass: 0.7 });
  const startedRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);


  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncPreview = () => {
      if (startedRef.current) return;
      if (motion.matches) {
        video.pause();
      } else {
        if (!video.getAttribute('src')) video.src = '/promo-preview.mp4';
        void video.play().catch(() => {});
      }
    };
    syncPreview();
    motion.addEventListener('change', syncPreview);
    return () => motion.removeEventListener('change', syncPreview);
  }, []);

  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    setFailed(false);
    if (!startedRef.current) {
      startedRef.current = true;
      video.src = PROMO_VIDEO_URL;
      video.loop = false;
      video.muted = false;
      video.currentTime = 0;
      setMuted(false);
      setCurrentTime(0);
      setDuration(0);
      setStarted(true);
    }
    if (video.ended) video.currentTime = 0;
    void video.play().catch(() => setPlaying(false));
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (startedRef.current) play();
      else {
        if (!video.getAttribute('src')) video.src = '/promo-preview.mp4';
        void video.play().catch(() => {});
      }
    } else video.pause();
  };

  const followPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || startedRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    pointerX.set(Math.max(0, Math.min(1, fraction)) * FOLLOW_RANGE);
    pointerY.set(Math.max(0, Math.min(6, (event.clientY - rect.top) * 0.03)));
  };

  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.volume === 0) video.volume = 1;
    video.muted = !video.muted;
  };

  const iconClass = 'h-4 w-4 shrink-0';

  return (
    <section aria-label="See OpenClip in action" className="px-4 pb-12 sm:px-6 sm:pb-20">
      <figure className={styles.frame}>
        <div className={styles.card} onPointerMove={followPointer} onPointerLeave={resetPointer}>
          <video
            ref={videoRef}
            poster="/promo-poster.jpg"
            muted
            loop
            playsInline
            preload="none"
            width={1920}
            height={1080}
            aria-label="OpenClip product demo video"
            className="block aspect-video h-auto w-full object-contain"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={(event) => {
              // Only a real load/decode failure counts; an abort from swapping sources is not one.
              const error = event.currentTarget.error;
              if (error && error.code !== error.MEDIA_ERR_ABORTED) setFailed(true);
            }}
            onLoadedMetadata={(event) => {
              if (startedRef.current) setDuration(event.currentTarget.duration);
            }}
            onTimeUpdate={(event) => {
              if (startedRef.current) setCurrentTime(event.currentTarget.currentTime);
            }}
            onVolumeChange={(event) => {
              setMuted(event.currentTarget.muted);
            }}
          />
          {!started ? (
            <>
              <motion.button ref={playButtonRef} type="button" onClick={play} onFocus={resetPointer} style={{ x: followX, y: followY }} className={`glass-surface video-glass ${styles.playButton}`}>
                <VideoGlassLens videoRef={videoRef} buttonRef={playButtonRef} x={followX} y={followY} rotate={still} />
                <Volume2 className="h-[14px] w-[14px]" aria-hidden="true" />
                <span>play with sound</span>
              </motion.button>
              <button ref={toggleRef} type="button" onClick={togglePlayback} className={`glass-surface video-glass ${styles.previewToggle} ${styles.iconButton}`} aria-label={playing ? 'Pause preview' : 'Resume preview'}>
                <VideoGlassLens videoRef={videoRef} buttonRef={toggleRef} x={still} y={still} rotate={still} />
                {playing ? <Pause className={iconClass} /> : <Play className={iconClass} />}
              </button>
            </>
          ) : (
            <>
              <VideoControls
                videoRef={videoRef}
                playing={playing}
                currentTime={currentTime}
                duration={duration}
                onTogglePlayback={togglePlayback}
                onSeek={(time) => {
                  const video = videoRef.current;
                  if (!video || !duration) return;
                  video.currentTime = time;
                  setCurrentTime(time);
                }}
                muted={muted}
                onToggleMute={toggleMute}
              />
            </>
          )}
        </div>
        {failed && <p role="status" className="mt-2 text-center text-[13px] text-[var(--text-secondary)]">Video unavailable. <a className="underline" href={PROMO_VIDEO_URL}>Open the demo directly</a>.</p>}
      </figure>
    </section>
  );
}
