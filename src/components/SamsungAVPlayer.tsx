import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, Pause, Play, RefreshCw, RotateCcw, RotateCw } from 'lucide-react';
import type { Channel } from '@/types';
import { resolvePlayableStreamUrl } from '@/lib/streamProxy';
import { storage } from '@/lib/storage';

interface SamsungAVPlayerProps {
  channel: Channel | null;
  immersive?: boolean;
  onClose?: () => void;
  liveProgram?: { title: string; schedule: string } | null;
  liveNextProgram?: { title: string; schedule: string } | null;
}

interface AVPlayListener {
  onbufferingstart?: () => void;
  onbufferingprogress?: (percent: number) => void;
  onbufferingcomplete?: () => void;
  oncurrentplaytime?: (milliseconds: number) => void;
  onstreamcompleted?: () => void;
  onerror?: (error: string) => void;
  onevent?: (eventType: string, eventData: unknown) => void;
  ondrmevent?: (eventType: string, eventData: unknown) => void;
  onsubtitlechange?: (duration: number, text: string, data: unknown, type: number) => void;
}

interface SamsungAVPlay {
  open: (url: string) => void;
  close: () => void;
  stop: () => void;
  play: () => boolean | void;
  pause: () => void;
  prepareAsync: (success: () => void, failure: (error: unknown) => void) => void;
  setListener: (listener: AVPlayListener) => void;
  setDisplayRect: (x: number, y: number, width: number, height: number) => void;
  setDisplayMethod?: (method: string) => void;
  getState?: () => string;
  getDuration?: () => number;
  getCurrentTime?: () => number;
  seekTo?: (milliseconds: number, success?: () => void, failure?: () => void) => void;
  jumpForward?: (milliseconds: number) => void;
  jumpBackward?: (milliseconds: number) => void;
}

type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
const PREPARE_TIMEOUT = 25_000;

function formatTime(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = String(Math.floor(total / 60) % 60).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  return hours ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

function avplayInstance() {
  return window.webapis?.avplay as SamsungAVPlay | undefined;
}

export function SamsungAVPlayer({ channel, immersive = false, onClose, liveProgram, liveNextProgram }: SamsungAVPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const lastProgressSecondRef = useRef(-1);
  const [status, setStatus] = useState<Status>('idle');
  const [buffering, setBuffering] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const isLive = channel?.category === 'live';

  const clearPrepareTimeout = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const closePlayer = useCallback(() => {
    generationRef.current += 1;
    clearPrepareTimeout();
    const avplay = avplayInstance();
    if (!avplay) return;
    try {
      const state = avplay.getState?.();
      if (state && state !== 'NONE' && state !== 'IDLE') avplay.stop();
    } catch { /* o player pode já ter sido encerrado pela TV */ }
    try { avplay.close(); } catch { /* noop */ }
  }, [clearPrepareTimeout]);

  const syncDisplayRect = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    const avplay = avplayInstance();
    if (!rect || !avplay) return;
    const scaleX = 1920 / Math.max(1, window.innerWidth);
    const scaleY = 1080 / Math.max(1, window.innerHeight);
    try {
      avplay.setDisplayRect(
        Math.round(rect.left * scaleX),
        Math.round(rect.top * scaleY),
        Math.max(1, Math.round(rect.width * scaleX)),
        Math.max(1, Math.round(rect.height * scaleY)),
      );
    } catch { /* alguns firmwares só aceitam a área após open() */ }
  }, []);

  const start = useCallback(async () => {
    if (!channel?.url) return;
    closePlayer();
    const generation = generationRef.current;
    setStatus('loading');
    setBuffering(0);
    setCurrentTime(0);
    setDuration(0);
    setError('');

    try {
      const playableUrl = await resolvePlayableStreamUrl(channel.url.trim());
      if (generation !== generationRef.current) return;
      const avplay = avplayInstance();
      if (!avplay) throw new Error('AVPlay indisponível neste modelo.');

      avplay.open(playableUrl);
      avplay.setDisplayMethod?.('PLAYER_DISPLAY_MODE_LETTER_BOX');
      syncDisplayRect();
      avplay.setListener({
        onbufferingstart: () => { if (generation === generationRef.current) setStatus('loading'); },
        onbufferingprogress: (percent) => { if (generation === generationRef.current) setBuffering(percent); },
        onbufferingcomplete: () => { if (generation === generationRef.current) setBuffering(100); },
        oncurrentplaytime: (milliseconds) => {
          if (generation !== generationRef.current) return;
          setCurrentTime(milliseconds);
          const second = Math.floor(milliseconds / 1000);
          const totalDuration = avplay.getDuration?.() || 0;
          if (!isLive && totalDuration > 0 && second !== lastProgressSecondRef.current && second % 10 === 0) {
            lastProgressSecondRef.current = second;
            storage.saveWatchProgress(channel.id, second, totalDuration / 1000);
          }
        },
        onstreamcompleted: () => { if (generation === generationRef.current) setStatus('paused'); },
        onerror: () => {
          if (generation !== generationRef.current) return;
          clearPrepareTimeout();
          setError('Não foi possível reproduzir esta transmissão.');
          setStatus('error');
        },
      });

      timeoutRef.current = window.setTimeout(() => {
        if (generation !== generationRef.current) return;
        setError('A transmissão demorou muito para responder.');
        setStatus('error');
      }, PREPARE_TIMEOUT);

      avplay.prepareAsync(() => {
        if (generation !== generationRef.current) return;
        clearPrepareTimeout();
        const mediaDuration = avplay.getDuration?.() || 0;
        setDuration(mediaDuration);
        const saved = !isLive ? storage.getWatchProgress()[channel.id] : null;
        const resumeAt = saved && saved.current > 15 && saved.current < saved.duration - 30 ? saved.current * 1000 : 0;
        const play = () => {
          if (generation !== generationRef.current) return;
          try {
            avplay.play();
            setStatus('playing');
          } catch {
            setError('A TV não conseguiu iniciar o vídeo.');
            setStatus('error');
          }
        };
        if (resumeAt && avplay.seekTo) avplay.seekTo(resumeAt, play, play);
        else play();
      }, () => {
        if (generation !== generationRef.current) return;
        clearPrepareTimeout();
        setError('Formato ou endereço de transmissão não aceito pela TV.');
        setStatus('error');
      });
    } catch {
      if (generation !== generationRef.current) return;
      clearPrepareTimeout();
      setError('Não foi possível preparar a transmissão.');
      setStatus('error');
    }
  }, [channel, clearPrepareTimeout, closePlayer, isLive, syncDisplayRect]);

  const togglePlayback = useCallback(() => {
    const avplay = avplayInstance();
    if (!avplay) return;
    try {
      if (status === 'playing') {
        avplay.pause();
        setStatus('paused');
      } else if (status === 'paused') {
        avplay.play();
        setStatus('playing');
      }
    } catch { /* o estado pode mudar durante buffering */ }
  }, [status]);

  const seek = useCallback((milliseconds: number) => {
    if (isLive) return;
    const avplay = avplayInstance();
    try {
      if (milliseconds > 0) avplay?.jumpForward?.(milliseconds);
      else avplay?.jumpBackward?.(Math.abs(milliseconds));
    } catch { /* stream pode não permitir seek */ }
  }, [isLive]);

  useEffect(() => {
    void start();
    return closePlayer;
  }, [closePlayer, start]);

  useEffect(() => {
    const resize = () => syncDisplayRect();
    window.addEventListener('resize', resize);
    const frame = window.requestAnimationFrame(syncDisplayRect);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [syncDisplayRect]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const code = event.keyCode || event.which;
      if (code === 10252 || code === 415 || code === 19 || event.key === 'MediaPlayPause') {
        event.preventDefault();
        event.stopPropagation();
        togglePlayback();
      } else if (!isLive && (code === 417 || event.key === 'MediaFastForward')) {
        event.preventDefault(); event.stopPropagation(); seek(10_000);
      } else if (!isLive && (code === 412 || event.key === 'MediaRewind')) {
        event.preventDefault(); event.stopPropagation(); seek(-10_000);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isLive, seek, togglePlayback]);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div ref={containerRef} className={`samsung-av-player ${immersive ? 'samsung-av-player-immersive' : ''}`}>
      <object type="application/avplayer" className="samsung-av-surface" aria-label={channel?.name || 'Player'} />
      <div className="samsung-av-shade" />

      {status === 'loading' && <div className="samsung-av-state"><Loader2 className="h-8 w-8 animate-spin" /><strong>Preparando transmissão</strong><span>{buffering > 0 ? `${Math.round(buffering)}%` : 'Conectando...'}</span></div>}
      {status === 'error' && <div className="samsung-av-state samsung-av-error"><AlertTriangle className="h-10 w-10" /><strong>Erro na reprodução</strong><span>{error}</span><button type="button" data-tv-autofocus="true" onClick={() => void start()}><RefreshCw className="h-4 w-4" />Tentar novamente</button></div>}

      <div className="samsung-av-topbar">
        {onClose && <button type="button" onClick={onClose} aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>}
        <div><strong>{channel?.name || 'Selecione um conteúdo'}</strong>{liveProgram && <span>{liveProgram.schedule} · {liveProgram.title}</span>}</div>
      </div>

      {channel && status !== 'error' && <div className="samsung-av-controls">
        {!isLive && <div className="samsung-av-progress"><span style={{ width: `${progress}%` }} /></div>}
        <div data-tv-axis="horizontal" className="samsung-av-actions">
          {!isLive && <button type="button" onClick={() => seek(-10_000)} aria-label="Voltar 10 segundos"><RotateCcw className="h-5 w-5" /></button>}
          <button type="button" data-tv-priority="primary" onClick={togglePlayback} aria-label={status === 'playing' ? 'Pausar' : 'Reproduzir'}>{status === 'playing' ? <Pause className="h-6 w-6 fill-current" /> : <Play className="h-6 w-6 fill-current" />}</button>
          {!isLive && <button type="button" onClick={() => seek(10_000)} aria-label="Avançar 10 segundos"><RotateCw className="h-5 w-5" /></button>}
          {!isLive && <span className="samsung-av-time">{formatTime(currentTime)} / {formatTime(duration)}</span>}
          {isLive && <span className="samsung-av-live"><i /> AO VIVO</span>}
          {liveNextProgram && <span className="samsung-av-next">A seguir: {liveNextProgram.schedule} · {liveNextProgram.title}</span>}
        </div>
      </div>}
    </div>
  );
}
