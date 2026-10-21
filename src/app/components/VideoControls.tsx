'use client';

import type { CSSProperties, RefObject } from 'react';
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import styles from './PromoVideo.module.css';

function timestamp(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  playing: boolean;
  currentTime: number;
  duration: number;
  onTogglePlayback: () => void;
  onSeek: (time: number) => void;
  /** Show the mute toggle next to play/pause (used by the homepage promo). */
  muted?: boolean;
  onToggleMute?: () => void;
}

/**
 * Overlay controls shared by every custom video player on the site: a glass
 * play/pause button (and optional mute) in the top-right corner and a thin
 * progress timeline along the bottom. Must sit inside a `styles.card` element.
 */
export default function VideoControls({
  playing,
  currentTime,
  duration,
  onTogglePlayback,
  onSeek,
  muted,
  onToggleMute,
}: Props) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const iconClass = 'h-4 w-4 shrink-0';
  const ended = !playing && duration > 0 && currentTime >= duration;

  return (
    <>
      <div className={styles.topControls} role="group" aria-label="Video controls">
        <button type="button" className={`glass-surface video-glass ${styles.iconButton}`} onClick={onTogglePlayback} aria-label={playing ? 'Pause video' : 'Play video'}>
          {playing ? <Pause className={iconClass} /> : ended ? <RotateCcw className={iconClass} /> : <Play className={iconClass} />}
        </button>
        {onToggleMute && (
          <button type="button" className={`glass-surface video-glass ${styles.iconButton}`} onClick={onToggleMute} aria-label={muted ? 'Unmute video' : 'Mute video'}>
            {muted ? <VolumeX className={iconClass} /> : <Volume2 className={iconClass} />}
          </button>
        )}
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
            if (!duration) return;
            onSeek(Number(event.target.value));
          }}
        />
      </div>
    </>
  );
}
