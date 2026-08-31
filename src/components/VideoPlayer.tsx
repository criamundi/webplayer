import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import Hls from 'hls.js';
import mpegts from 'mpegts.js';

import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Settings2,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';

import type { Channel } from '@/types';
import { resolvePlayableStreamUrl } from '@/lib/streamProxy';
import { storage } from '@/lib/storage';

interface VideoPlayerProps {
  channel: Channel | null;
  startMuted?: boolean;
  immersive?: boolean;
  onClose?: () => void;
  liveProgram?: { title: string; schedule: string } | null;
  liveNextProgram?: { title: string; schedule: string } | null;
}

type PlayerStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'error';

const START_TIMEOUT = 25000;
const SWITCH_DELAY = 350;

function formatPlayerTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '00:00';
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  const minutes = Math.floor((value / 60) % 60).toString().padStart(2, '0');
  const hours = Math.floor(value / 3600);
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

export function VideoPlayer({
  channel,
  startMuted = false,
  immersive = false,
  onClose,
}: VideoPlayerProps) {
  const videoRef =
    useRef<HTMLVideoElement>(null);

  const containerRef =
    useRef<HTMLDivElement>(null);

  const hlsRef =
    useRef<Hls | null>(null);

  const mpegtsRef =
    useRef<mpegts.Player | null>(null);

  const generationRef =
    useRef(0);

  const startTimerRef =
    useRef<number | null>(null);

  const timeoutRef =
    useRef<number | null>(null);

  const hideTimerRef =
    useRef<number | null>(null);

  const lastProgressSecondRef = useRef(-1);

  const [status, setStatus] =
    useState<PlayerStatus>('idle');

  const [errorMsg, setErrorMsg] =
    useState('');

  const [muted, setMuted] =
    useState(startMuted);

  const [volume, setVolume] =
    useState(1);

  const [paused, setPaused] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);

  const [duration, setDuration] = useState(0);

  const [buffered, setBuffered] = useState(0);

  const [playbackRate, setPlaybackRate] = useState(1);

  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');

  const [settingsOpen, setSettingsOpen] = useState(false);

  const [
    isFullscreen,
    setIsFullscreen,
  ] =
    useState(false);

  const [
    showControls,
    setShowControls,
  ] =
    useState(true);

  /*
  |--------------------------------------------------------------------------
  | DESTROI REPRODUÇÃO ATUAL
  |--------------------------------------------------------------------------
  */

  const destroyPlayback =
    useCallback(() => {
      generationRef.current += 1;

      if (
        startTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          startTimerRef.current,
        );

        startTimerRef.current =
          null;
      }

      if (
        timeoutRef.current !==
        null
      ) {
        window.clearTimeout(
          timeoutRef.current,
        );

        timeoutRef.current =
          null;
      }

      /*
       * HLS
       */
      const hls =
        hlsRef.current;

      if (hls) {
        hlsRef.current = null;

        try {
          hls.stopLoad();
        } catch { /* player may already be stopped */ }

        try {
          hls.detachMedia();
        } catch { /* media may already be detached */ }

        try {
          hls.destroy();
        } catch { /* instance may already be destroyed */ }
      }

      /*
       * MPEG-TS
       */
      const player =
        mpegtsRef.current;

      if (player) {
        mpegtsRef.current =
          null;

        try {
          player.pause();
        } catch { /* player may already be paused */ }

        try {
          player.unload();
        } catch { /* player may already be unloaded */ }

        try {
          player.detachMediaElement();
        } catch { /* media may already be detached */ }

        try {
          player.destroy();
        } catch { /* instance may already be destroyed */ }
      }

      /*
       * VIDEO NATIVO
       */
      const video =
        videoRef.current;

      if (video) {
        try {
          video.pause();
        } catch { /* video may already be paused */ }

        try {
          video.removeAttribute(
            'src',
          );
        } catch { /* source may already be empty */ }

        try {
          video.load();
        } catch { /* browser may reject load during teardown */ }
      }
    }, []);

  /*
  |--------------------------------------------------------------------------
  | ERRO
  |--------------------------------------------------------------------------
  */

  const fail =
    useCallback(
      (
        generation: number,
        message: string,
      ) => {
        if (
          generation !==
          generationRef.current
        ) {
          return;
        }

        if (
          timeoutRef.current !==
          null
        ) {
          window.clearTimeout(
            timeoutRef.current,
          );

          timeoutRef.current =
            null;
        }

        setStatus('error');
        setErrorMsg(message);
      },
      [],
    );

  const playMedia = useCallback(async (video: HTMLVideoElement, generation: number) => {
    try {
      await video.play();
    } catch (error) {
      if (generation !== generationRef.current) return;
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        video.muted = true;
        setMuted(true);
        try {
          await video.play();
          return;
        } catch { /* exibe o erro real abaixo */ }
      }
      fail(generation, 'O navegador não conseguiu iniciar este conteúdo.');
    }
  }, [fail]);

  /*
  |--------------------------------------------------------------------------
  | HLS
  |--------------------------------------------------------------------------
  */

  const startHls =
    useCallback(
      (
        url: string,
        generation: number,
      ) => {
        const video =
          videoRef.current;

        if (!video) {
          return false;
        }

        /*
         * Safari / HLS nativo
         */
        const native =
          video.canPlayType(
            'application/vnd.apple.mpegurl',
          );

        if (
          native === 'probably' ||
          native === 'maybe'
        ) {
          video.src = url;

          void playMedia(video, generation);

          return true;
        }

        if (!Hls.isSupported()) {
          return false;
        }

        const hls =
          new Hls({
            enableWorker: true,

            lowLatencyMode: false,

            maxBufferLength: 30,

            maxMaxBufferLength: 60,

            backBufferLength: 15,

            manifestLoadingTimeOut:
              15000,

            levelLoadingTimeOut:
              15000,

            fragLoadingTimeOut:
              20000,

            /*
             * Pequenas oscilações do provedor não devem encerrar o canal.
             */
            manifestLoadingMaxRetry: 2,

            levelLoadingMaxRetry: 3,

            fragLoadingMaxRetry: 4,
          });

        hlsRef.current =
          hls;

        hls.on(
          Hls.Events.MEDIA_ATTACHED,
          () => {
            if (
              generation !==
              generationRef.current
            ) {
              return;
            }

            hls.loadSource(url);
          },
        );

        hls.on(
          Hls.Events.MANIFEST_PARSED,
          () => {
            if (
              generation !==
              generationRef.current
            ) {
              return;
            }

            void playMedia(video, generation);
          },
        );

        hls.on(
          Hls.Events.ERROR,
          (_event, data) => {
            if (
              generation !==
              generationRef.current
            ) {
              return;
            }

            if (!data.fatal) {
              return;
            }

            console.error(
              'HLS ERROR:',
              {
                type:
                  data.type,

                details:
                  data.details,

                fatal:
                  data.fatal,

                url,
              },
            );

            fail(
              generation,
              'Não foi possível reproduzir este canal.',
            );

            try {
              hls.stopLoad();
            } catch { /* player may already be stopped */ }

            try {
              hls.detachMedia();
            } catch { /* media may already be detached */ }

            try {
              hls.destroy();
            } catch { /* instance may already be destroyed */ }

            if (
              hlsRef.current ===
              hls
            ) {
              hlsRef.current =
                null;
            }
          },
        );

        hls.attachMedia(video);

        return true;
      },
      [fail, playMedia],
    );

  /*
  |--------------------------------------------------------------------------
  | MPEG-TS
  |--------------------------------------------------------------------------
  */

  const startMpegTs =
    useCallback(
      (
        url: string,
        generation: number,
      ) => {
        const video =
          videoRef.current;

        if (
          !video ||
          !mpegts.isSupported()
        ) {
          return false;
        }

        try {
          const player =
            mpegts.createPlayer(
              {
                type:
                  'mpegts',

                isLive:
                  true,

                url,
              },
              {
                enableWorker:
                  true,

                enableStashBuffer:
                  true,

                stashInitialSize:
                  1024 * 1024,

                lazyLoad:
                  false,

                autoCleanupSourceBuffer:
                  true,

                autoCleanupMaxBackwardDuration:
                  60,

                autoCleanupMinBackwardDuration:
                  20,

                liveBufferLatencyChasing:
                  false,

                liveBufferLatencyMaxLatency:
                  10,

                liveBufferLatencyMinRemain:
                  2,
              },
            );

          mpegtsRef.current =
            player;

          player.attachMediaElement(
            video,
          );

          player.load();

          void playMedia(video, generation);

          player.on(
            mpegts.Events.ERROR,
            (
              type,
              detail,
              info,
            ) => {
              if (
                generation !==
                generationRef.current
              ) {
                return;
              }

              console.error(
                'MPEGTS ERROR:',
                {
                  type,
                  detail,
                  info,
                  url,
                },
              );

              const transportInfo = info && typeof info === 'object' ? info as Record<string, unknown> : {};
              const httpStatus = Number(transportInfo.code ?? transportInfo.status ?? 0);

              fail(
                generation,
                httpStatus === 403
                  ? 'O servidor do canal recusou a conexão. Atualize a lista ou verifique a linha no provedor.'
                  : 'Não foi possível reproduzir este canal.',
              );

              try {
                player.pause();
              } catch { /* player may already be paused */ }

              try {
                player.unload();
              } catch { /* player may already be unloaded */ }

              try {
                player.detachMediaElement();
              } catch { /* media may already be detached */ }

              try {
                player.destroy();
              } catch { /* instance may already be destroyed */ }

              if (
                mpegtsRef.current ===
                player
              ) {
                mpegtsRef.current =
                  null;
              }
            },
          );

          return true;
        } catch (error) {
          console.error(
            'ERRO AO INICIAR MPEGTS:',
            error,
          );

          return false;
        }
      },
      [fail, playMedia],
    );

  /*
  |--------------------------------------------------------------------------
  | INICIA STREAM
  |--------------------------------------------------------------------------
  */

  const startPlayback =
    useCallback(
      (
        url: string,
        generation: number,
        category?: Channel['category'],
      ) => {
        let decoded = url;

        try {
          decoded =
            decodeURIComponent(
              url,
            );
        } catch { /* keep the original URL when it is not encoded */ }

        /*
         * HLS
         */
        const isHls =
          /\.m3u8(?:\?|$)/i.test(
            decoded,
          );

        if (isHls) {
          if (
            startHls(
              url,
              generation,
            )
          ) {
            return;
          }
        }

        /*
         * MPEG-TS
         */
        const isTs =
          /\.ts(?:\?|$)/i.test(
            decoded,
          ) ||
          /\/live\//i.test(
            decoded,
          ) || category === 'live';

        if (isTs) {
          if (
            startMpegTs(
              url,
              generation,
            )
          ) {
            return;
          }
        }

        /*
         * Fallback nativo
         */
        const video =
          videoRef.current;

        if (!video) {
          return;
        }

        video.src = url;

        void playMedia(video, generation);
      },
      [
        startHls,
        startMpegTs,
        playMedia,
      ],
    );

  /*
  |--------------------------------------------------------------------------
  | TROCA DE CANAL
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    /*
     * Fecha completamente
     * o canal anterior.
     */
    destroyPlayback();

    const video =
      videoRef.current;

    if (
      !channel ||
      !video
    ) {
      setStatus('idle');
      setErrorMsg('');

      return;
    }

    const originalUrl =
      channel.url?.trim();

    if (!originalUrl) {
      setStatus('error');

      setErrorMsg(
        'Canal sem URL válida.',
      );

      return;
    }

    /*
     * IMPORTANTE:
     *
     * Usa o stream-proxy.
     *
     * NÃO transforma HTTP em HTTPS.
     * NÃO troca DNS.
     * NÃO troca hostname.
     */
    const generation =
      generationRef.current;

    setStatus('loading');
    setErrorMsg('');
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setPaused(false);
    setPlaybackRate(1);
    setSettingsOpen(false);
    video.playbackRate = 1;

    /*
     * Pequeno intervalo para
     * garantir que a conexão
     * anterior encerrou.
     */
    void resolvePlayableStreamUrl(originalUrl)
      .then((playableUrl) => {
        if (generation !== generationRef.current) return;

        console.log('PLAYER STREAM:', {
          channel: channel.name,
          originalUrl,
          playableUrl,
        });

        startTimerRef.current = window.setTimeout(() => {
          if (
            generation !==
            generationRef.current
          ) {
            return;
          }

          startTimerRef.current =
            null;

          timeoutRef.current =
            window.setTimeout(
              () => {
                if (
                  generation !==
                  generationRef.current
                ) {
                  return;
                }

                fail(
                  generation,
                  'O canal demorou muito para responder.',
                );

                destroyPlayback();
              },
              START_TIMEOUT,
            );

          startPlayback(
            playableUrl,
            generation,
            channel.category,
          );
        }, SWITCH_DELAY);
      })
      .catch(() => {
        if (generation !== generationRef.current) return;
        fail(generation, 'Não foi possível preparar a conexão segura do canal.');
      });

    const onPlaying =
      () => {
        if (
          generation !==
          generationRef.current
        ) {
          return;
        }

        if (
          timeoutRef.current !==
          null
        ) {
          window.clearTimeout(
            timeoutRef.current,
          );

          timeoutRef.current =
            null;
        }

        setStatus('playing');
      };

    video.addEventListener(
      'playing',
      onPlaying,
    );

    return () => {
      video.removeEventListener(
        'playing',
        onPlaying,
      );

      destroyPlayback();
    };
  }, [
    channel,
    destroyPlayback,
    fail,
    startPlayback,
  ]);

  /*
  |--------------------------------------------------------------------------
  | VOLUME
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const video =
      videoRef.current;

    if (!video) {
      return;
    }

    video.muted =
      muted;

    video.volume =
      volume;
  }, [
    muted,
    volume,
  ]);

  /*
  |--------------------------------------------------------------------------
  | FULLSCREEN
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const onChange =
      () => {
        setIsFullscreen(
          Boolean(
            document.fullscreenElement,
          ),
        );
      };

    document.addEventListener(
      'fullscreenchange',
      onChange,
    );

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        onChange,
      );
    };
  }, []);

  const toggleFullscreen =
    useCallback(() => {
      if (
        !document.fullscreenElement
      ) {
        containerRef.current
          ?.requestFullscreen?.();
      } else {
        document
          .exitFullscreen?.();
      }
    }, []);

  const isLive = channel?.category === 'live';
  const canSeek = !isLive && Number.isFinite(duration) && duration > 0;

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const seekTo = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = Math.min(Math.max(value, 0), video.duration);
    setCurrentTime(video.currentTime);
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    seekTo(video.currentTime + seconds);
  }, [seekTo]);

  const changePlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
    setPlaybackRate(rate);
    setSettingsOpen(false);
  }, []);

  /*
  |--------------------------------------------------------------------------
  | CONTROLES
  |--------------------------------------------------------------------------
  */

  const handleMouseMove =
    useCallback(() => {
      setShowControls(true);

      if (
        hideTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          hideTimerRef.current,
        );
      }

      hideTimerRef.current =
        window.setTimeout(
          () => {
            setShowControls(
              false,
            );
            setSettingsOpen(false);
          },
          4000,
        );
    }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'BUTTON') return;
    if (event.key === ' ' || event.key.toLowerCase() === 'k') {
      event.preventDefault();
      togglePlayback();
    } else if (event.key === 'ArrowLeft' && canSeek) {
      event.preventDefault();
      seekBy(-10);
    } else if (event.key === 'ArrowRight' && canSeek) {
      event.preventDefault();
      seekBy(10);
    } else if (event.key.toLowerCase() === 'm') {
      setMuted((value) => !value);
    } else if (event.key.toLowerCase() === 'f') {
      toggleFullscreen();
    }
    handleMouseMove();
  }, [canSeek, handleMouseMove, seekBy, toggleFullscreen, togglePlayback]);

  useEffect(() => {
    if (!immersive) {
      setShowControls(true);
      return;
    }

    handleMouseMove();

    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [channel?.id, handleMouseMove, immersive]);

  /*
  |--------------------------------------------------------------------------
  | RETRY MANUAL
  |--------------------------------------------------------------------------
  */

  const retry =
    useCallback(() => {
      if (!channel) {
        return;
      }

      destroyPlayback();

      const originalUrl =
        channel.url?.trim();

      if (!originalUrl) {
        return;
      }

      /*
       * Retry usa o mesmo proxy.
       */
      const generation =
        generationRef.current;

      setStatus('loading');
      setErrorMsg('');

      void resolvePlayableStreamUrl(originalUrl)
        .then((playableUrl) => {
          if (generation !== generationRef.current) return;

          startTimerRef.current = window.setTimeout(() => {
            if (
              generation !==
              generationRef.current
            ) {
              return;
            }

            timeoutRef.current =
              window.setTimeout(
                () => {
                  if (
                    generation !==
                    generationRef.current
                  ) {
                    return;
                  }

                  fail(
                    generation,
                    'O canal demorou muito para responder.',
                  );

                  destroyPlayback();
                },
                START_TIMEOUT,
              );

            startPlayback(
              playableUrl,
              generation,
              channel.category,
            );
          }, SWITCH_DELAY);
        })
        .catch(() => {
          if (generation !== generationRef.current) return;
          fail(generation, 'Não foi possível preparar a conexão segura do canal.');
        });
    }, [
      channel,
      destroyPlayback,
      fail,
      startPlayback,
    ]);

  /*
  |--------------------------------------------------------------------------
  | CLEANUP FINAL
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    return () => {
      if (
        hideTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          hideTimerRef.current,
        );
      }

      destroyPlayback();
    };
  }, [
    destroyPlayback,
  ]);

  /*
  |--------------------------------------------------------------------------
  | RENDER
  |--------------------------------------------------------------------------
  */

  return (
    <div
      ref={containerRef}
      onMouseMove={
        handleMouseMove
      }
      onPointerMove={handleMouseMove}
      onTouchStart={handleMouseMove}
      onMouseLeave={() => setShowControls(!immersive)}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target === event.currentTarget || target.tagName === 'VIDEO') event.currentTarget.focus();
      }}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).tagName === 'VIDEO') toggleFullscreen();
      }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className={`relative h-full w-full overflow-hidden bg-black ${immersive ? 'rounded-none' : 'rounded-2xl'} ${immersive && !showControls ? 'cursor-none' : ''}`}
    >
      {immersive && onClose && <button type="button" onClick={onClose} className={`absolute left-4 top-4 z-40 flex h-11 items-center gap-2 rounded-xl bg-black/55 px-4 text-sm font-medium text-white/80 backdrop-blur-md transition-all duration-300 hover:bg-black/75 hover:text-white ${showControls ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'}`} aria-label="Voltar"><ArrowLeft className="h-4 w-4" />Voltar</button>}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        preload="none"
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) && value > 0 ? value : 0);
        }}
        onProgress={(event) => {
          const video = event.currentTarget;
          if (!Number.isFinite(video.duration) || video.duration <= 0 || video.buffered.length === 0) {
            setBuffered(0);
            return;
          }
          setBuffered(Math.min(100, (video.buffered.end(video.buffered.length - 1) / video.duration) * 100));
        }}
        onError={(event) => {
          if (status === 'error') return;
          const code = event.currentTarget.error?.code;
          const message = code === 4 ? 'Formato de vídeo não suportado pelo navegador.' : 'O servidor interrompeu o carregamento do vídeo.';
          fail(generationRef.current, message);
        }}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0);
          const saved = storage.getWatchProgress()[channel?.id || ''];
          if (saved && Number.isFinite(video.duration) && saved.current < video.duration - 15) video.currentTime = saved.current;
          setCurrentTime(video.currentTime || 0);
        }}
        onTimeUpdate={(event) => {
          if (!channel) return;
          const video = event.currentTarget;
          setCurrentTime(video.currentTime || 0);
          if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
          const second = Math.floor(video.currentTime);
          if (Number.isFinite(video.duration) && video.duration > 0 && second % 5 === 0 && second !== lastProgressSecondRef.current) {
            lastProgressSecondRef.current = second;
            storage.saveWatchProgress(channel.id, video.currentTime, video.duration);
          }
        }}
        className={`h-full w-full ${fitMode === 'cover' ? 'object-cover' : 'object-contain'}`}
      />

      {!channel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 text-white/70">

          <Tv className="mb-4 h-16 w-16 opacity-40" />

          <p className="text-lg font-medium">
            Selecione um canal
          </p>

        </div>
      )}

      {channel &&
        status ===
          'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">

            <Loader2 className="mb-3 h-11 w-11 animate-spin text-white" />

            <p className="text-sm text-white/80">
              Conectando...
            </p>

          </div>
        )}

      {channel &&
        status ===
          'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 px-6 text-center">

            <AlertTriangle className="mb-3 h-12 w-12 text-red-400" />

            <p className="font-medium text-white">
              Erro na reprodução
            </p>

            <p className="mt-1 text-sm text-white/50">
              {errorMsg}
            </p>

            <button
              type="button"
              onClick={retry}
              className="mt-5 flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm text-white"
            >
              <RefreshCw className="h-4 w-4" />

              Tentar novamente
            </button>

          </div>
        )}

      {channel &&
        status !==
          'error' && (
          <div
            className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pb-4 pt-16 transition-all duration-300 sm:px-6 sm:pb-5 ${
              showControls
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-3 opacity-0'
            }`}
          >
            {canSeek ? <div className="group/progress relative mb-3 flex h-5 items-center">
              <div className="pointer-events-none absolute inset-x-0 h-1 rounded-full bg-white/20 transition-all group-hover/progress:h-1.5">
                <span className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${buffered}%` }} />
                <span className="absolute inset-y-0 left-0 rounded-full bg-emerald-400" style={{ width: `${Math.min(100, (currentTime / duration) * 100)}%` }} />
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.1}
                value={Math.min(currentTime, duration)}
                onChange={(event) => seekTo(Number(event.target.value))}
                className="player-progress-range relative z-10 h-5 w-full cursor-pointer appearance-none bg-transparent"
                aria-label="Progresso do vídeo"
              />
            </div> : null}

            <div className="relative flex items-center gap-1.5 text-white sm:gap-2">

              <button
                type="button"
                onClick={togglePlayback}
                className="player-control-primary"
                aria-label={paused ? 'Reproduzir' : 'Pausar'}
              >
                {paused ? <Play className="h-5 w-5 fill-current" /> : <Pause className="h-5 w-5 fill-current" />}
              </button>

              {canSeek && <><button type="button" onClick={() => seekBy(-10)} className="player-control-button hidden sm:flex" aria-label="Voltar 10 segundos"><RotateCcw className="h-5 w-5" /><span className="absolute mt-0.5 text-[8px] font-bold">10</span></button><button type="button" onClick={() => seekBy(10)} className="player-control-button hidden sm:flex" aria-label="Avançar 10 segundos"><RotateCw className="h-5 w-5" /><span className="absolute mt-0.5 text-[8px] font-bold">10</span></button></>}

              <button
                type="button"
                onClick={() =>
                  setMuted(
                    (
                      value,
                    ) =>
                      !value,
                  )
                }
                className="player-control-button"
                aria-label={muted ? 'Ativar som' : 'Silenciar'}
              >
                {muted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(
                  event,
                ) => {
                  const value =
                    Number(
                      event.target
                        .value,
                    );

                  setVolume(
                    value,
                  );

                  setMuted(
                    value === 0,
                  );
                }}
                className="hidden w-20 accent-emerald-400 sm:block lg:w-24"
              />

              <div className="min-w-0 flex-1 px-1 sm:px-2">
                <div className="truncate text-xs font-semibold sm:text-sm">{channel.name}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/55 sm:text-xs">
                  {canSeek ? <span className="tabular-nums">{formatPlayerTime(currentTime)} <span className="text-white/30">/</span> {formatPlayerTime(duration)}</span> : <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />Ao vivo</span>}
                </div>
              </div>

              <div className="relative">
                <button type="button" onClick={() => setSettingsOpen((value) => !value)} className={`player-control-button ${settingsOpen ? 'bg-white/15 text-emerald-300' : ''}`} aria-label="Configurações do player"><Settings2 className="h-5 w-5" /></button>
                {settingsOpen && <div className="absolute bottom-12 right-0 w-56 overflow-hidden rounded-2xl border border-white/10 bg-[#10171d]/95 p-2 text-sm shadow-2xl backdrop-blur-xl">
                  {canSeek && <div className="border-b border-white/8 px-2 pb-2"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Velocidade</p><div className="grid grid-cols-3 gap-1">{[0.75, 1, 1.25, 1.5, 2].map((rate) => <button key={rate} type="button" onClick={() => changePlaybackRate(rate)} className={`rounded-lg px-2 py-1.5 text-xs transition ${playbackRate === rate ? 'bg-emerald-400 text-slate-950' : 'bg-white/5 text-white/65 hover:bg-white/10'}`}>{rate === 1 ? 'Normal' : `${rate}x`}</button>)}</div></div>}
                  <div className="px-2 pt-2"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Imagem</p><div className="grid grid-cols-2 gap-1"><button type="button" onClick={() => setFitMode('contain')} className={`rounded-lg px-2 py-2 text-xs transition ${fitMode === 'contain' ? 'bg-emerald-400 text-slate-950' : 'bg-white/5 text-white/65 hover:bg-white/10'}`}>Ajustar</button><button type="button" onClick={() => setFitMode('cover')} className={`rounded-lg px-2 py-2 text-xs transition ${fitMode === 'cover' ? 'bg-emerald-400 text-slate-950' : 'bg-white/5 text-white/65 hover:bg-white/10'}`}>Preencher</button></div></div>
                </div>}
              </div>

              <button
                type="button"
                onClick={
                  toggleFullscreen
                }
                className="player-control-button"
                aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              >
                {isFullscreen ? (
                  <Minimize className="h-5 w-5" />
                ) : (
                  <Maximize className="h-5 w-5" />
                )}
              </button>

            </div>
          </div>
        )}
    </div>
  );
}
