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
  Loader2,
  Maximize,
  Minimize,
  RefreshCw,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';

import type { Channel } from '@/types';
import { getPlayableStreamUrl } from '@/lib/streamProxy';

interface VideoPlayerProps {
  channel: Channel | null;
  startMuted?: boolean;
}

type PlayerStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'error';

const START_TIMEOUT = 15000;
const SWITCH_DELAY = 350;

export function VideoPlayer({
  channel,
  startMuted = false,
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

  const [status, setStatus] =
    useState<PlayerStatus>('idle');

  const [errorMsg, setErrorMsg] =
    useState('');

  const [muted, setMuted] =
    useState(startMuted);

  const [volume, setVolume] =
    useState(1);

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

          video
            .play()
            .catch(() => {});

          return true;
        }

        if (!Hls.isSupported()) {
          return false;
        }

        const hls =
          new Hls({
            enableWorker: true,

            lowLatencyMode: false,

            maxBufferLength: 15,

            maxMaxBufferLength: 25,

            backBufferLength: 5,

            manifestLoadingTimeOut:
              10000,

            levelLoadingTimeOut:
              10000,

            fragLoadingTimeOut:
              12000,

            /*
             * Sem retry automático.
             */
            manifestLoadingMaxRetry: 0,

            levelLoadingMaxRetry: 0,

            fragLoadingMaxRetry: 0,
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

            video
              .play()
              .catch(() => {});
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
      [fail],
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
                  false,

                lazyLoad:
                  false,

                autoCleanupSourceBuffer:
                  true,

                autoCleanupMaxBackwardDuration:
                  15,

                autoCleanupMinBackwardDuration:
                  5,

                liveBufferLatencyChasing:
                  true,

                liveBufferLatencyMaxLatency:
                  3,

                liveBufferLatencyMinRemain:
                  0.5,
              },
            );

          mpegtsRef.current =
            player;

          player.attachMediaElement(
            video,
          );

          player.load();

          void Promise
            .resolve(player.play())
            .catch(() => {});

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

              fail(
                generation,
                'Não foi possível reproduzir este canal.',
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
      [fail],
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
          );

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

        video
          .play()
          .catch(() => {
            fail(
              generation,
              'Formato não suportado pelo navegador.',
            );
          });
      },
      [
        startHls,
        startMpegTs,
        fail,
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
    const playableUrl =
      getPlayableStreamUrl(
        originalUrl,
      );

    console.log(
      'PLAYER STREAM:',
      {
        channel:
          channel.name,

        originalUrl,

        playableUrl,
      },
    );

    const generation =
      generationRef.current;

    setStatus('loading');
    setErrorMsg('');

    /*
     * Pequeno intervalo para
     * garantir que a conexão
     * anterior encerrou.
     */
    startTimerRef.current =
      window.setTimeout(
        () => {
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
          );
        },
        SWITCH_DELAY,
      );

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
          },
          3000,
        );
    }, []);

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
      const playableUrl =
        getPlayableStreamUrl(
          originalUrl,
        );

      const generation =
        generationRef.current;

      setStatus('loading');
      setErrorMsg('');

      startTimerRef.current =
        window.setTimeout(
          () => {
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
            );
          },
          SWITCH_DELAY,
        );
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
      onMouseLeave={() =>
        setShowControls(
          true,
        )
      }
      className="relative h-full w-full overflow-hidden rounded-2xl bg-black"
    >
      <video
        ref={videoRef}
        playsInline
        autoPlay
        preload="none"
        className="h-full w-full object-contain"
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
            className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 transition-opacity ${
              showControls
                ? 'opacity-100'
                : 'pointer-events-none opacity-0'
            }`}
          >
            <div className="flex items-center gap-3 text-white">

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
                className="rounded-lg p-2 hover:bg-white/10"
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
                className="w-24 accent-white"
              />

              <div className="min-w-0 flex-1 truncate px-2 text-sm font-medium">
                {channel.name}
              </div>

              <button
                type="button"
                onClick={
                  toggleFullscreen
                }
                className="rounded-lg p-2 hover:bg-white/10"
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
