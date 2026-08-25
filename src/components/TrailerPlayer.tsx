import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Film, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react';

interface TrailerPlayerProps {
  source: string;
  title: string;
  onClose: () => void;
}

interface YoutubePlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  destroy: () => void;
}

interface YoutubePlayerEvent {
  data: number;
  target: YoutubePlayer;
}

interface YoutubeApi {
  Player: new (element: HTMLElement, options: {
    width: string;
    height: string;
    videoId: string;
    host?: string;
    playerVars: Record<string, string | number>;
    events: {
      onReady: (event: YoutubePlayerEvent) => void;
      onStateChange: (event: YoutubePlayerEvent) => void;
      onError: () => void;
    };
  }) => YoutubePlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
  };
}

declare global {
  interface Window {
    YT?: YoutubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YoutubeApi> | null = null;

function loadYoutubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YoutubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error('API do YouTube indisponível.'));
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-nexus-youtube-api]');
    if (existing) return;

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.nexusYoutubeApi = 'true';
    script.onerror = () => reject(new Error('Não foi possível carregar o trailer.'));
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
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
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const hideTimerRef = useRef<number | null>(null);
  const youtubeHostRef = useRef<HTMLDivElement>(null);
  const youtubePlayerRef = useRef<YoutubePlayer | null>(null);
  const directVideoRef = useRef<HTMLVideoElement>(null);
  const youtubeId = useMemo(() => getYoutubeId(source), [source]);
  const directVideo = !youtubeId && isDirectVideo(source);

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

  useEffect(() => {
    if (!youtubeId || !youtubeHostRef.current) return;
    let active = true;
    let player: YoutubePlayer | null = null;

    void loadYoutubeApi().then((api) => {
      if (!active || !youtubeHostRef.current) return;
      player = new api.Player(youtubeHostRef.current, {
        width: '100%',
        height: '100%',
        videoId: youtubeId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
          rel: 0,
          cc_load_policy: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (!active) return;
            youtubePlayerRef.current = event.target;
            setLoading(false);
            event.target.playVideo();
          },
          onStateChange: (event) => {
            if (!active) return;
            if (event.data === api.PlayerState.ENDED) {
              close();
              return;
            }
            if (event.data === api.PlayerState.PLAYING) setPlaying(true);
            if (event.data === api.PlayerState.PAUSED) {
              setPlaying(false);
              revealControls();
            }
          },
          onError: () => {
            if (!active) return;
            setLoading(false);
            setError('Este trailer não permite reprodução incorporada.');
          },
        },
      });
      youtubePlayerRef.current = player;
    }).catch(() => {
      if (!active) return;
      setLoading(false);
      setError('Não foi possível carregar o trailer.');
    });

    return () => {
      active = false;
      youtubePlayerRef.current = null;
      player?.destroy();
    };
  }, [close, revealControls, youtubeId]);

  const togglePlayback = () => {
    if (youtubePlayerRef.current) {
      if (playing) youtubePlayerRef.current.pauseVideo();
      else youtubePlayerRef.current.playVideo();
      return;
    }
    const video = directVideoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    if (youtubePlayerRef.current) {
      if (next) youtubePlayerRef.current.mute();
      else youtubePlayerRef.current.unMute();
    }
    if (directVideoRef.current) directVideoRef.current.muted = next;
  };

  return <div
    className={`fixed inset-0 z-[120] bg-black ${showControls ? '' : 'cursor-none'}`}
    onMouseMove={revealControls}
    onPointerMove={revealControls}
    onTouchStart={revealControls}
  >
    {youtubeId && <div ref={youtubeHostRef} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0" />}
    {directVideo && <video
      ref={directVideoRef}
      src={source}
      autoPlay
      playsInline
      onCanPlay={() => setLoading(false)}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={close}
      onError={() => { setLoading(false); setError('Não foi possível carregar o trailer.'); }}
      className="h-full w-full object-contain"
    />}
    {!youtubeId && !directVideo && <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/55">
      <Film className="h-12 w-12 text-white/20" />
      <p>Trailer indisponível para reprodução interna.</p>
    </div>}

    {loading && (youtubeId || directVideo) && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/55"><Loader2 className="h-10 w-10 animate-spin text-emerald-400" /></div>}
    {error && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center"><Film className="h-12 w-12 text-white/20" /><p className="text-sm text-white/55">{error}</p></div>}

    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-24 bg-gradient-to-b from-black via-black/80 to-transparent" />
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-black via-black/80 to-transparent" />
    <div className="absolute inset-x-0 top-0 z-30 h-24" onMouseMove={revealControls} />

    <div className={`pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center gap-3 px-4 pt-4 transition-all duration-300 ${showControls ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'}`}>
      <button type="button" onClick={close} className="pointer-events-auto flex h-11 items-center gap-2 rounded-xl bg-black/60 px-4 text-sm font-medium text-white/85 backdrop-blur-md transition hover:bg-black/80 hover:text-white">
        <ArrowLeft className="h-4 w-4" />Voltar
      </button>
      <span className="min-w-0 truncate text-sm font-medium text-white/70">{title}</span>
    </div>

    {(youtubeId || directVideo) && !error && <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-40 flex items-center gap-2 p-4 transition-all duration-300 ${showControls ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
      <div className="pointer-events-auto flex items-center gap-1 rounded-xl bg-black/60 p-1.5 text-white backdrop-blur-md">
        <button type="button" onClick={togglePlayback} className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-white/10" aria-label={playing ? 'Pausar trailer' : 'Reproduzir trailer'}>
          {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
        </button>
        <button type="button" onClick={toggleMuted} className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-white/10" aria-label={muted ? 'Ativar som' : 'Silenciar'}>
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
    </div>}
  </div>;
}
