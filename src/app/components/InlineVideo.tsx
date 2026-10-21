'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './PromoVideo.module.css';
import VideoControls from './VideoControls';

interface Props {
  src: string;
  title?: string;
  className?: string;
}

/**
 * Muted, looping, autoplaying clip with the same custom controls as the homepage
 * promo (play/pause top-right, thin timeline at the bottom). No native controls.
 * Respects prefers-reduced-motion by not autoplaying.
 */
export default function InlineVideo({ src, title, className = '' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) video.pause();
    else void video.play().catch(() => {});
  }, [src]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setPlaying(false));
    else video.pause();
  };

  const seek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    setCurrentTime(time);
  };

  return (
    <div className={`${styles.card} ${className}`}>
      <video
        ref={videoRef}
        src={src}
        title={title}
        aria-label={title}
        muted
        loop
        playsInline
        preload="metadata"
        className="block aspect-video h-auto w-full object-cover bg-black/5"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
      <VideoControls
        videoRef={videoRef}
        playing={playing}
        currentTime={currentTime}
        duration={duration}
        onTogglePlayback={togglePlayback}
        onSeek={seek}
      />
    </div>
  );
}
