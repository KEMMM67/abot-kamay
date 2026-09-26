// apps/web/components/feed/feed-video.tsx
'use client';

//
// A feed video that behaves like TikTok: it starts muted when most of it is on screen, pauses when it
// scrolls away or the tab is hidden, and only one video in the feed plays at a time. Tapping the video
// pauses or plays it; the sound button turns sound on for every video after it too.
//
// Care for donors' data and attention:
// - nothing downloads until the video is about a screen away (preload="none" until then);
// - no autoplay with "reduce motion" or the browser's data saver on: the video waits for a tap;
// - a visible pause control and a poster (WCAG 2.2.2); the post's title and caption are the text
//   alternative until creator videos get captions.
// Children (the creator and title overlay from the server) are drawn above the video; they let taps
// through to it, except on their own links.
import { LoaderCircle, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useMessages } from '@/lib/i18n/client';

// ------------------------------------------------------------------------ Shared across the feed

/** Sound stays on for the next videos once turned on, like every short-video app. */
let soundOn = false;
const soundListeners = new Set<() => void>();

function setSound(value: boolean) {
  soundOn = value;
  for (const listener of soundListeners) listener();
}

function subscribeSound(listener: () => void) {
  soundListeners.add(listener);
  return () => {
    soundListeners.delete(listener);
  };
}

/** The one video allowed to play; starting another pauses it. */
let playingNow: HTMLVideoElement | null = null;

/** Plays `video` and pauses any other. A refusal (autoplay rules, power saving) leaves the play button. */
async function startPlayback(video: HTMLVideoElement): Promise<void> {
  if (playingNow && playingNow !== video) playingNow.pause();
  playingNow = video;
  video.muted = !soundOn;
  try {
    await video.play();
  } catch {
    // Not playing: the frame still shows its play button, and onError covers undecodable files.
  }
}

function autoplayWelcome(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData !== true;
}

// ------------------------------------------------------------------------------------ Component

type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'failed';

export function FeedVideo({
  src,
  poster,
  label,
  aspectRatio,
  children,
  className,
}: {
  src: string;
  poster: string | null;
  /** What the video shows, for screen readers (the creator's description, or "Video about Lolo Ben"). */
  label: string;
  /** Width / height of the frame. */
  aspectRatio: number;
  children?: ReactNode;
  className?: string;
}) {
  const t = useMessages().media;
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  /** The viewer paused it: scrolling back must not restart it. */
  const pausedByViewer = useRef(false);
  const [near, setNear] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const sound = useSyncExternalStore(
    subscribeSound,
    () => soundOn,
    () => false,
  );

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = !sound;
  }, [sound]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // Start downloading when the video is about a screen away, so it is ready when it arrives.
    const approach = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNear(true);
        approach.disconnect();
      },
      { rootMargin: '100% 0px' },
    );
    // Play when at least 60% is on screen; pause as soon as it isn't.
    const visibility = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.intersectionRatio >= 0.6) {
          if (!pausedByViewer.current && video.paused && autoplayWelcome()) void startPlayback(video);
        } else if (!video.paused) {
          video.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    const onVisibilityChange = () => {
      if (document.hidden) video.pause();
    };
    approach.observe(video);
    visibility.observe(video);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      approach.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (playingNow === video) playingNow = null;
    };
  }, []);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    pausedByViewer.current = !video.paused && status !== 'failed';
    if (status === 'failed') {
      setStatus('loading');
      video.load();
      void startPlayback(video);
    } else if (video.paused) {
      setNear(true);
      void startPlayback(video);
    } else {
      video.pause();
    }
  }

  function toggleSound() {
    const video = videoRef.current;
    const next = !sound;
    setSound(next);
    // Turning sound on is a tap, which browsers accept as permission to play with sound.
    if (next && video?.paused && status !== 'failed') {
      pausedByViewer.current = false;
      setNear(true);
      void startPlayback(video);
    }
  }

  const playing = status === 'playing' || status === 'loading';

  return (
    <div
      style={{ aspectRatio: String(aspectRatio) }}
      className={cn('relative isolate max-h-[78svh] w-full overflow-hidden bg-ink', className)}
    >
      {/* The poster, blurred, fills the bars around a contained video on wide screens. */}
      {poster && (
        // A decorative background from the media CDN; next/image would add a second request.
        // oxlint-disable-next-line nextjs/no-img-element
        <img
          src={poster}
          alt=""
          aria-hidden
          className="absolute inset-0 -z-10 size-full scale-110 object-cover opacity-50 blur-2xl"
        />
      )}
      {/* Creator videos have no caption file yet: the media pipeline is to add WebVTT from speech-to-text
          (TECHNICAL_PLAN.md 2.9). Until then the post's title and caption are the text alternative. */}
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        preload={near ? 'auto' : 'none'}
        playsInline
        loop
        muted={!sound}
        aria-label={label}
        onPlaying={() => setStatus('playing')}
        onPause={() => setStatus((current) => (current === 'failed' ? current : 'paused'))}
        onWaiting={() => setStatus((current) => (current === 'paused' ? current : 'loading'))}
        onError={() => setStatus('failed')}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          if (progressRef.current && video.duration > 0) {
            progressRef.current.style.transform = `scaleX(${video.currentTime / video.duration})`;
          }
        }}
        className="absolute inset-0 size-full object-contain"
      />

      {/* The whole frame is the play/pause control, like every short-video app. */}
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={status === 'failed' ? t.failed : playing ? t.pause : t.play}
        className="absolute inset-0 z-10 grid place-items-center focus-visible:outline-offset-[-6px]"
      >
        {status === 'loading' && (
          <LoaderCircle aria-hidden className="size-12 animate-spin text-white drop-shadow-lg" />
        )}
        {(status === 'idle' || status === 'paused') && (
          <span
            aria-hidden
            className="animate-pop grid size-18 place-items-center rounded-full bg-ink/55 text-white shadow-lift backdrop-blur-sm"
          >
            <Play className="size-9 translate-x-0.5" fill="currentColor" />
          </span>
        )}
        {status === 'failed' && (
          <span className="mx-6 flex flex-col items-center gap-3 rounded-2xl bg-ink/75 px-5 py-4 text-center text-white backdrop-blur-sm">
            <RotateCcw aria-hidden className="size-6" />
            <span className="font-semibold">{t.failed}</span>
          </span>
        )}
      </button>

      {/* The server's overlay (creator, title) sits above the video but lets taps through. */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
        {children}
      </div>

      <button
        type="button"
        onClick={toggleSound}
        aria-label={sound ? t.mute : t.unmute}
        className="absolute right-3 top-3 z-30 grid size-11 place-items-center rounded-full bg-ink/55 text-white backdrop-blur-sm transition-colors hover:bg-ink/75"
      >
        {sound ? <Volume2 aria-hidden className="size-5" /> : <VolumeX aria-hidden className="size-5" />}
      </button>

      {/* Playback position, drawn without re-rendering (the element is updated directly). */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 z-30 h-1 bg-white/25">
        <span
          ref={progressRef}
          className="block h-full origin-left bg-white transition-transform duration-200 ease-linear"
          style={{ transform: 'scaleX(0)' }}
        />
      </span>
    </div>
  );
}
