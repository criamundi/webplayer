import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Film } from 'lucide-react';

interface TrailerPlayerProps {
  source: string;
  title: string;
  onClose: () => void;
}

function getYoutubeId(source: string) {
  const value = source.trim();
  if (!value) return '';
  if (/^[\w-]{6,}$/.test(value) && !value.includes('.')) return value;

  try {
    const url = new URL(value);
    if (url.hostname.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || '';
    if (url.hostname.includes('youtube.com')) {
      return url.searchParams.get('v')
        || url.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]
        || '';
    }
  } catch {
    return '';
  }

  return '';
}

function isDirectVideo(source: string) {
  return /\.(?:mp4|webm|ogg)(?:$|[?#])/i.test(source);
}

export function TrailerPlayer({ source, title, onClose }: TrailerPlayerProps) {
  const [showControls, setShowControls] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const youtubeId = useMemo(() => getYoutubeId(source), [source]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setShowControls(false), 3000);
  }, []);

  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    onClose();
  }, [onClose]);

  useEffect(() => {
    revealControls();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    };
  }, [close, revealControls]);

  return <div
    className={`fixed inset-0 z-[120] bg-black ${showControls ? '' : 'cursor-none'}`}
    onMouseMove={revealControls}
    onPointerMove={revealControls}
    onTouchStart={revealControls}
  >
    {youtubeId
      ? <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
        title={`${title} — trailer`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="h-full w-full border-0"
      />
      : isDirectVideo(source)
        ? <video src={source} autoPlay controls playsInline className="h-full w-full object-contain" />
        : <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/55">
          <Film className="h-12 w-12 text-white/20" />
          <p>Trailer indisponível para reprodução interna.</p>
        </div>}

    <div className="absolute inset-x-0 top-0 z-20 h-24" onMouseMove={revealControls} />
    <div className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center gap-3 bg-gradient-to-b from-black/85 to-transparent px-4 pb-10 pt-4 transition-all duration-300 ${showControls ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'}`}>
      <button type="button" onClick={close} className="pointer-events-auto flex h-11 items-center gap-2 rounded-xl bg-black/55 px-4 text-sm font-medium text-white/85 backdrop-blur-md transition hover:bg-black/75 hover:text-white">
        <ArrowLeft className="h-4 w-4" />Voltar
      </button>
      <span className="min-w-0 truncate text-sm font-medium text-white/70">{title}</span>
    </div>
  </div>;
}
