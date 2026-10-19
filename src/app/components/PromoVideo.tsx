'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { animate, motion, useMotionValue, useSpring, useTransform, useVelocity } from 'motion/react';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import styles from './PromoVideo.module.css';
import VideoGlassLens from './VideoGlassLens';

const PROMO_VIDEO_URL = 'https://getopenclip.app/OpenClip-promo-compressed.mp4';

function timestamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

export default function PromoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const still = useMotionValue(0);
  const startedRef = useRef(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const float = useMotionValue(0);
  const followX = useSpring(pointerX, { stiffness: 180, damping: 20, mass: 0.7 });
  const springY = useSpring(pointerY, { stiffness: 180, damping: 20, mass: 0.7 });
  const followY = useTransform([springY, float], ([spring, drift]: number[]) => spring + drift);
  const velocity = useVelocity(followX);
  const tilt = useTransform(velocity, [-800, 0, 800], [-6, 0, 6]);
  const rotate = useSpring(tilt, { stiffness: 200, damping: 12, mass: 0.5 });


  useEffect(() => {
    if (started) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) return;
    const controls = animate(float, [0, -3, 0, 3, 0], { duration: 4.5, ease: 'easeInOut', repeat: Infinity });
    return () => controls.stop();
  }, [float, started]);

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
    const button = playButtonRef.current;
    if (!button || button.matches(':focus-visible')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const limitX = Math.max(0, (rect.width - button.offsetWidth) / 2 - 20);
    const limitY = Math.max(0, (rect.height - button.offsetHeight) / 2 - 20);
    pointerX.set(Math.max(-limitX, Math.min(limitX, (event.clientX - rect.left - rect.width / 2) * 0.7)));
    pointerY.set(Math.max(-limitY, Math.min(limitY, (event.clientY - rect.top - rect.height / 2) * 0.7)));
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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
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
            onError={() => setFailed(true)}
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
              <motion.button ref={playButtonRef} type="button" onClick={play} onFocus={resetPointer} style={{ x: followX, y: followY, rotate }} className={`glass-surface video-glass ${styles.playButton}`}>
                <VideoGlassLens videoRef={videoRef} buttonRef={playButtonRef} x={followX} y={followY} rotate={rotate} />
                <Play className="h-[15px] w-[15px] fill-current" aria-hidden="true" />
                <span>Play with sound</span>
              </motion.button>
              <button ref={toggleRef} type="button" onClick={togglePlayback} className={`glass-surface video-glass ${styles.previewToggle} ${styles.iconButton}`} aria-label={playing ? 'Pause preview' : 'Resume preview'}>
                <VideoGlassLens videoRef={videoRef} buttonRef={toggleRef} x={still} y={still} rotate={still} />
                {playing ? <Pause className={iconClass} /> : <Play className={iconClass} />}
              </button>
            </>
          ) : (
            <>
              <div className={styles.topControls} role="group" aria-label="Video controls">
                <button type="button" className={`glass-surface video-glass ${styles.iconButton}`} onClick={togglePlayback} aria-label={playing ? 'Pause video' : 'Play video'}>
                  {playing ? <Pause className={iconClass} /> : currentTime >= duration && duration > 0 ? <RotateCcw className={iconClass} /> : <Play className={iconClass} />}
                </button>
                <button type="button" className={`glass-surface video-glass ${styles.iconButton}`} onClick={toggleMute} aria-label={muted ? 'Unmute video' : 'Mute video'}>
                  {muted ? <VolumeX className={iconClass} /> : <Volume2 className={iconClass} />}
                </button>
              </div>
              <div className={styles.timeline}>
                <input
                  type="range"
                  aria-label="Video progress"
                  aria-valuetext={`${timestamp(currentTime)} of ${timestamp(duration)}`}
                  min={0}
                  max={duration || 1}
                  step={0.1}
                  value={currentTime}
                  disabled={!duration}
                  className={styles.slider}
                  style={{ '--fill': `${progress}%` } as CSSProperties}
                  onChange={(event) => {
                    const video = videoRef.current;
                    if (!video || !duration) return;
                    const time = Number(event.target.value);
                    video.currentTime = time;
                    setCurrentTime(time);
                  }}
                />
              </div>
            </>
          )}
        </div>
        {failed && <p role="status" className="mt-2 text-center text-[13px] text-[var(--text-secondary)]">Video unavailable. <a className="underline" href={PROMO_VIDEO_URL}>Open the demo directly</a>.</p>}
      </figure>
    </section>
  );
}
