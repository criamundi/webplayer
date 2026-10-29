import { useEffect, useState } from 'react';
import { Cast, Loader2 } from 'lucide-react';

type CastSession = {
  loadMedia: (request: unknown) => Promise<unknown>;
};
type CastContext = {
  setOptions: (options: Record<string, unknown>) => void;
  requestSession: () => Promise<unknown>;
  getCurrentSession: () => CastSession | null;
};
type CastWindow = Window & {
  __onGCastApiAvailable?: (available: boolean) => void;
  cast?: { framework: { CastContext: { getInstance: () => CastContext } } };
  chrome?: { cast?: {
    media: {
      DEFAULT_MEDIA_RECEIVER_APP_ID: string;
      MediaInfo: new (url: string, mime: string) => { metadata?: unknown; streamType?: string };
      LoadRequest: new (info: unknown) => { currentTime?: number; autoplay?: boolean };
      GenericMediaMetadata: new () => { title?: string };
      StreamType: { LIVE: string; BUFFERED: string };
    };
    AutoJoinPolicy: { ORIGIN_SCOPED: string };
  } };
};

let initialized = false;
const listeners = new Set<(available: boolean) => void>();
function initCast() {
  const w = window as CastWindow;
  if (!w.cast || !w.chrome?.cast) return false;
  if (!initialized) {
    w.cast.framework.CastContext.getInstance().setOptions({
      receiverApplicationId: w.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    initialized = true;
  }
  return true;
}
function loadSdk(onAvailable: (available: boolean) => void) {
  listeners.add(onAvailable);
  const w = window as CastWindow;
  if (initCast()) onAvailable(true);
  else {
    w.__onGCastApiAvailable = (available) => {
      const ready = available && initCast();
      listeners.forEach((listener) => listener(Boolean(ready)));
    };
    if (!document.querySelector('script[data-google-cast-sdk]')) {
      const script = document.createElement('script');
      script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      script.async = true;
      script.dataset.googleCastSdk = 'true';
      document.head.appendChild(script);
    }
  }
  return () => { listeners.delete(onAvailable); };
}

export function ChromecastButton({ url, name, isLive, position = 0, onStart }: {
  url: string;
  name: string;
  isLive: boolean;
  position?: number;
  onStart: () => void;
}) {
  const [supported, setSupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!('chrome' in window)) return;
    return loadSdk(setSupported);
  }, []);

  if (!supported) return null;

  const castVideo = async () => {
    setError('');
    if (!url) { setError('Aguarde o vídeo carregar antes de transmitir.'); return; }
    const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ''; } })();
    if (/\.ts$/.test(path)) {
      setError('O Chromecast padrão não aceita streams MPEG-TS diretos. Use HLS (.m3u8) ou MP4.');
      return;
    }
    const w = window as CastWindow;
    if (!w.cast || !w.chrome?.cast) return;
    setBusy(true);
    try {
      const context = w.cast.framework.CastContext.getInstance();
      if (!context.getCurrentSession()) await context.requestSession();
      const session = context.getCurrentSession();
      if (!session) throw new Error('Nenhuma TV conectada.');
      const mime = path.endsWith('.m3u8') || url.includes('.m3u8?') ? 'application/x-mpegURL' : 'video/mp4';
      const media = new w.chrome.cast.media.MediaInfo(url, mime);
      const metadata = new w.chrome.cast.media.GenericMediaMetadata();
      metadata.title = name;
      media.metadata = metadata;
      media.streamType = isLive ? w.chrome.cast.media.StreamType.LIVE : w.chrome.cast.media.StreamType.BUFFERED;
      const request = new w.chrome.cast.media.LoadRequest(media);
      if (!isLive && Number.isFinite(position)) request.currentTime = Math.max(0, position);
      request.autoplay = true;
      await session.loadMedia(request);
      onStart();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível transmitir. Verifique se a TV e o celular estão na mesma rede.');
    } finally { setBusy(false); }
  };

  return <div className="relative flex items-center">
    <button type="button" onClick={() => void castVideo()} disabled={busy} className="player-control-button" title="Transmitir via Chromecast" aria-label="Transmitir para TV via Chromecast">
      {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Cast className="h-5 w-5" />}
    </button>
    {error && <div role="alert" className="absolute bottom-12 right-0 z-50 w-64 rounded-xl bg-[#161d23] p-3 text-xs text-white shadow-xl border border-white/15">
      {error}<button type="button" onClick={() => setError('')} className="ml-2 font-bold text-emerald-300">Fechar</button>
    </div>}
  </div>;
}
