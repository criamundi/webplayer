import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { Channel } from '@/types';

import { supabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';

import { loadLinePlaylistStreaming, validateLineAccess } from '@/lib/provider';
import { enterAppFullscreen, exitAppFullscreen } from '@/lib/platform';

import type {
  PlaylistCategory,
  StreamProgress,
} from '@/lib/m3u';

import {
  clearPlaylist,
  deletePlaylistDB,
  getChannels,
  getChannelsByIds,
  getPlaylistMeta,
  saveChannelBatch,
  savePlaylistMeta,
} from '@/lib/playlistStore';

import { useRecentlyWatched } from '@/lib/useRecentlyWatched';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ProviderAccess } from '@/components/ProviderAccess';

import { AdminShell } from '@/components/admin/AdminShell';
import { AdminLogin } from '@/components/admin/AdminLogin';

import {
  Sidebar,
  type View,
} from '@/components/layout/Sidebar';

import { TopBar } from '@/components/layout/TopBar';

import { HomeView } from '@/components/views/HomeView';
import { LiveView } from '@/components/views/LiveView';
import { MoviesView } from '@/components/views/MoviesView';
import { SeriesView } from '@/components/views/SeriesView';
import { FavoritesView } from '@/components/views/FavoritesView';
import { SearchView } from '@/components/views/SearchView';
import { SettingsView } from '@/components/views/SettingsView';
import { ContinueWatchingView } from '@/components/views/ContinueWatchingView';
import { PlaybackView } from '@/components/views/PlaybackView';

/*
|--------------------------------------------------------------------------
| TIPOS
|--------------------------------------------------------------------------
*/

interface Branding {
  app_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  background_url?: string | null;
  login_background_url?: string | null;
  main_font_scale?: number;
  font_family?: string;
}

type Phase =
  | 'loading'
  | 'login'
  | 'connecting'
  | 'access-error'
  | 'ready';

/*
|--------------------------------------------------------------------------
| CONFIGURAÇÕES
|--------------------------------------------------------------------------
*/

const defaultBranding: Branding = {
  app_name: 'Top TV Digital',
  logo_url: null,
  primary_color: '#bef264',
  secondary_color: '#091018',
  main_font_scale: 1,
  font_family: 'Inter',
};

const VIEW_LIMITS: Record<
  PlaylistCategory,
  number
> = {
  live: 2000,

  /*
   * Filmes e séries não serão carregados
   * pelo App.
   *
   * MoviesView e SeriesView carregam
   * somente a categoria selecionada.
   */
  movies: 60,
  series: 60,

  radio: 800,
  other: 800,
};

const EMPTY_TOTALS: Record<
  PlaylistCategory,
  number
> = {
  live: 0,
  movies: 0,
  series: 0,
  radio: 0,
  other: 0,
};

const EMPTY_GROUPS: Record<
  PlaylistCategory,
  string[]
> = {
  live: [],
  movies: [],
  series: [],
  radio: [],
  other: [],
};

/*
|--------------------------------------------------------------------------
| VIEW -> CATEGORIA
|--------------------------------------------------------------------------
*/

function categoryForView(
  view: View,
): PlaylistCategory | null {
  if (
    view === 'home' ||
    view === 'live'
  ) {
    return 'live';
  }

  if (view === 'movies') {
    return 'movies';
  }

  if (view === 'series') {
    return 'series';
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| APP
|--------------------------------------------------------------------------
*/

export default function App() {
  const [phase, setPhase] =
    useState<Phase>('loading');

  const [view, setView] =
    useState<View>('home');

  const [viewResetKey, setViewResetKey] =
    useState(0);

  const [seriesResumeId, setSeriesResumeId] = useState<string | null>(null);

  /*
   * Somente uma pequena janela fica no React.
   */
  const [channels, setChannels] =
    useState<Channel[]>([]);

  const [groups, setGroups] =
    useState<string[]>([]);

  const [
    groupsByCategory,
    setGroupsByCategory,
  ] = useState<
    Record<
      PlaylistCategory,
      string[]
    >
  >({
    ...EMPTY_GROUPS,
  });

  const [
    streamingDone,
    setStreamingDone,
  ] = useState(true);

  const [
    activeChannel,
    setActiveChannel,
  ] = useState<Channel | null>(
    null,
  );

  const [
    favorites,
    setFavorites,
  ] = useState<Set<string>>(
    new Set(),
  );

  const [
    sidebarOpen,
    setSidebarOpen,
  ] = useState(false);

  const [query, setQuery] =
    useState('');

  const [
    showAdmin,
    setShowAdmin,
  ] = useState(false);

  const [
    adminAuthed,
    setAdminAuthed,
  ] = useState(false);

  const [
    loadError,
    setLoadError,
  ] = useState('');

  const [
    branding,
    setBranding,
  ] = useState<Branding>(
    defaultBranding,
  );

  const [
    loadProgress,
    setLoadProgress,
  ] = useState<{
    channels: number;
    groups: number;
  } | null>(null);

  const [
    totals,
    setTotals,
  ] = useState<
    Record<
      PlaylistCategory,
      number
    >
  >({
    ...EMPTY_TOTALS,
  });

  /*
|--------------------------------------------------------------------------
| CONTROLE REMOTO / VOLTAR
|--------------------------------------------------------------------------
*/

  useEffect(() => {
    const handlePlatformBack = () => {
      if (phase !== 'ready') return;

      if (sidebarOpen) {
        setSidebarOpen(false);
        return;
      }

      if (view === 'player') {
        void exitAppFullscreen();
        setView(activeChannel?.id.startsWith('episode:') ? 'series' : 'movies');
        return;
      }

      if (view === 'live' && activeChannel?.category === 'live') {
        setActiveChannel(null);
        return;
      }

      if (view !== 'home') {
        if (activeChannel?.category === 'live') setActiveChannel(null);
        setView('home');
        return;
      }

      setSidebarOpen(true);
    };

    window.addEventListener('top-tv:back', handlePlatformBack);
    return () => window.removeEventListener('top-tv:back', handlePlatformBack);
  }, [phase, sidebarOpen, view, activeChannel]);


  const [
    reloadKey,
    setReloadKey,
  ] = useState(0);

  const {
    recents,
    addRecent,
  } = useRecentlyWatched();

  /*
   * REFS
   */

  const connectControllerRef =
    useRef<AbortController | null>(
      null,
    );

  const phaseRef =
    useRef<Phase>('loading');

  const viewRef =
    useRef<View>('home');

  const firstLiveLoadedRef =
    useRef(false);

  const lastProgressPaintRef =
    useRef(0);

  const runningTotalsRef =
    useRef<
      Record<
        PlaylistCategory,
        number
      >
    >({
      ...EMPTY_TOTALS,
    });

  /*
|--------------------------------------------------------------------------
| SINCRONIZA REFS
|--------------------------------------------------------------------------
*/

  useEffect(() => {
    phaseRef.current =
      phase;
  }, [phase]);

  useEffect(() => {
    viewRef.current =
      view;
  }, [view]);

  /*
|--------------------------------------------------------------------------
| BRANDING
|--------------------------------------------------------------------------
*/

  useEffect(() => {
    let mounted = true;

    const loadBranding = async () => {
      const credentials = storage.getCredentials();
      let data: Branding | null = null;
      if (credentials?.provider) {
        const { data: providers } = await supabase.rpc('find_public_provider', { provider_name: credentials.provider });
        const provider = providers?.[0];
        if (provider) {
          const { data: providerBranding } = await supabase.from('provider_branding').select('app_name, logo_url, primary_color, secondary_color, background_url, login_background_url, main_font_scale, font_family').eq('provider_id', provider.id).maybeSingle();
          data = providerBranding as Branding | null;
        }
      }
      if (!data) {
        const { data: globalBranding } = await supabase.from('app_branding').select('app_name, logo_url, primary_color, secondary_color, background_url, login_background_url, main_font_scale, font_family').maybeSingle();
        data = globalBranding as Branding | null;
      }

      if (
        mounted &&
        data
      ) {
        setBranding(
          data,
        );
      }
    };
    void loadBranding();
    const refreshBranding = () => void loadBranding();
    window.addEventListener('branding-updated', refreshBranding);

    return () => {
      mounted = false;
      window.removeEventListener('branding-updated', refreshBranding);
    };
  }, []);

  /*
|--------------------------------------------------------------------------
| CARREGA JANELA DO INDEXEDDB
|--------------------------------------------------------------------------
*/

  const loadCategoryPreview =
    useCallback(
      async (
        category:
          PlaylistCategory,
      ) => {
        const result =
          await getChannels(
            category,
            VIEW_LIMITS[
              category
            ],
            0,
          );

        setChannels(
          result,
        );

        return result;
      },
      [],
    );

  /*
|--------------------------------------------------------------------------
| IMPORTAÇÃO / CACHE
|--------------------------------------------------------------------------
*/

  useEffect(() => {
    const creds =
      storage.getCredentials();

    /*
     * Sem login salvo.
     */
    if (!creds) {
      setPhase('login');
      return;
    }

    const playlistScope = `${creds.provider.trim().toLocaleLowerCase('pt-BR')}::${creds.username.trim()}`;

    const controller =
      new AbortController();

    /*
     * Cancela importação anterior.
     */
    connectControllerRef.current
      ?.abort();

    connectControllerRef.current =
      controller;

    let mounted = true;

    /*
     * Nova playlist começou realmente
     * a fornecer canais.
     */
    let newPlaylistStarted =
      false;

    /*
     * Existe playlist anterior no IndexedDB.
     */
    let hadLocalPlaylist =
      false;

    void (async () => {
      setLoadError('');

      setStreamingDone(
        false,
      );

      setLoadProgress({
        channels: 0,
        groups: 0,
      });

      firstLiveLoadedRef.current =
        false;

      lastProgressPaintRef.current =
        0;

      /*
       * ======================================================
       * 1. TENTA ABRIR O CACHE PRIMEIRO
       * ======================================================
       */

      try {
        const meta =
          await getPlaylistMeta();

        if (meta && meta.scope !== playlistScope) {
          await clearPlaylist();
        } else if (
          meta &&
          mounted
        ) {
          const cachedLive =
            await getChannels(
              'live',
              VIEW_LIMITS.live,
              0,
            );

          if (
            cachedLive.length >
            0
          ) {
            hadLocalPlaylist =
              true;

            /*
             * Canais Live salvos.
             */
            setChannels(
              cachedLive,
            );

            /*
             * Totais.
             */
            setTotals(
              meta.totals,
            );

            runningTotalsRef.current =
              {
                ...meta.totals,
              };

            /*
             * Categorias salvas.
             */
            setGroupsByCategory(
              meta.groupsByCategory,
            );

            setGroups(
              meta.groupsByCategory
                .live ??
                [],
            );

            /*
             * O cache fica preparado, mas o aplicativo ainda
             * NÃO é liberado. Primeiro validamos a situação
             * atual da linha no provedor.
             */
            firstLiveLoadedRef.current =
              true;
          }
        }
      } catch (error) {
        console.warn(
          'Erro ao recuperar playlist local:',
          error,
        );
      }

      /*
       * ======================================================
       * SEM CACHE
       * ======================================================
       */

      if (
        !hadLocalPlaylist
      ) {
        setChannels(
          [],
        );

        setGroups(
          [],
        );

        setTotals({
          ...EMPTY_TOTALS,
        });

        setGroupsByCategory({
          ...EMPTY_GROUPS,
        });

        runningTotalsRef.current =
          {
            ...EMPTY_TOTALS,
          };

        phaseRef.current =
          'connecting';

        setPhase(
          'connecting',
        );
      }

      /*
       * ======================================================
       * CACHE LOCAL ENCONTRADO
       * ======================================================
       *
       * Se já temos uma playlist válida no IndexedDB,
       * NÃO acessamos connect-line novamente.
       *
       * Isso evita:
       *
       * - novo download da lista a cada abertura
       * - chamadas desnecessárias ao get.php
       * - erro 404 ao reconectar
       * - sobrecarga no provedor
       */

      if (hadLocalPlaylist) {
        try {
          await validateLineAccess(
            {
              provider: creds.provider,
              username: creds.username,
              password: creds.password,
            },
            controller.signal,
          );

          if (!mounted || controller.signal.aborted) return;

          setStreamingDone(true);
          setLoadProgress(null);

          phaseRef.current = 'ready';
          setPhase('ready');
          setView('home');

          return;
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === 'AbortError'
          ) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : 'Não foi possível validar sua lista.';

          console.error('Falha ao validar lista salva:', error);

          setLoadError(message);
          setStreamingDone(true);
          setLoadProgress(null);
          setActiveChannel(null);

          phaseRef.current = 'access-error';
          setPhase('access-error');

          return;
        }
      }

      /*
       * ======================================================
       * 2. BAIXA A LISTA SOMENTE SE NÃO EXISTIR CACHE
       * ======================================================
       */

      try {
        await loadLinePlaylistStreaming(
          creds.provider,
          creds.username,
          creds.password,

          async (
            progress:
              StreamProgress,
          ) => {
            if (
              !mounted ||
              controller.signal
                .aborted
            ) {
              return;
            }

            /*
             * =================================================
             * RECEBEU UM LOTE
             * =================================================
             */

            if (
              !progress.done &&
              progress.category &&
              progress.channels
                .length >
                0
            ) {
              /*
               * Primeira resposta válida da nova lista.
               */
              if (
                !newPlaylistStarted
              ) {
                newPlaylistStarted =
                  true;

                /*
                 * Só agora apagamos o banco antigo.
                 *
                 * Dessa forma um 404/timeout antes
                 * de começar não destrói o cache.
                 */
                await clearPlaylist();

                runningTotalsRef.current =
                  {
                    ...EMPTY_TOTALS,
                  };

                setTotals({
                  ...EMPTY_TOTALS,
                });

                /*
                 * IMPORTANTE:
                 *
                 * NÃO apagamos groupsByCategory aqui.
                 *
                 * As categorias anteriores permanecem
                 * visíveis enquanto as novas são
                 * reconstruídas progressivamente.
                 */
              }

              /*
               * Salva o lote no IndexedDB.
               */
              await saveChannelBatch(
                progress.channels,
                progress.category,
                playlistScope,
              );

              /*
               * =================================================
               * CATEGORIAS PROGRESSIVAS
               * =================================================
               *
               * Filmes e Séries não precisam mais esperar
               * os 300 mil itens terminarem.
               */

              const batchGroups =
                Array.from(
                  new Set(
                    progress.channels
                      .map(
                        (
                          channel,
                        ) =>
                          channel.group ||
                          'Outros',
                      )
                      .filter(
                        Boolean,
                      ),
                  ),
                );

              setGroupsByCategory(
                (
                  current,
                ) => {
                  const existing =
                    current[
                      progress.category!
                    ] ??
                    [];

                  const merged =
                    Array.from(
                      new Set([
                        ...existing,
                        ...batchGroups,
                      ]),
                    ).sort(
                      (
                        a,
                        b,
                      ) =>
                        a.localeCompare(
                          b,
                          'pt-BR',
                        ),
                    );

                  return {
                    ...current,

                    [progress.category!]:
                      merged,
                  };
                },
              );

              /*
               * Se o usuário estiver olhando
               * justamente a categoria que está
               * chegando, atualiza a lateral.
               */
              const currentViewCategory =
                categoryForView(
                  viewRef.current,
                );

              if (
                currentViewCategory ===
                progress.category
              ) {
                setGroups(
                  (
                    current,
                  ) =>
                    Array.from(
                      new Set([
                        ...current,
                        ...batchGroups,
                      ]),
                    ).sort(
                      (
                        a,
                        b,
                      ) =>
                        a.localeCompare(
                          b,
                          'pt-BR',
                        ),
                    ),
                );
              }

              /*
               * =================================================
               * TOTAIS
               * =================================================
               */

              if (
                progress.total !=
                null
              ) {
                runningTotalsRef.current =
                  {
                    ...runningTotalsRef.current,

                    [progress.category]:
                      progress.total,
                  };
              }

              /*
               * Atualização visual no máximo
               * aproximadamente 4x por segundo.
               */
              const now =
                performance.now();

              if (
                now -
                  lastProgressPaintRef.current >=
                250
              ) {
                lastProgressPaintRef.current =
                  now;

                setLoadProgress({
                  channels:
                    progress.overallTotal ??
                    progress.channelCount,

                  groups:
                    progress.groupCount,
                });

                setTotals({
                  ...runningTotalsRef.current,
                });
              }

              /*
               * =================================================
               * PRIMEIROS CANAIS LIVE
               * =================================================
               */

              if (
                progress.category ===
                  'live' &&
                !firstLiveLoadedRef.current
              ) {
                firstLiveLoadedRef.current =
                  true;

                await loadCategoryPreview(
                  'live',
                );

                if (
                  phaseRef.current !==
                  'ready'
                ) {
                  phaseRef.current =
                    'ready';

                  setPhase(
                    'ready',
                  );

                  setView(
                    'home',
                  );
                }
              }

              return;
            }

            /*
             * =================================================
             * IMPORTAÇÃO TERMINOU
             * =================================================
             */

            if (
              progress.done
            ) {
              /*
               * Terminou sem receber nenhum canal.
               */
              if (
                !newPlaylistStarted
              ) {
                setStreamingDone(
                  true,
                );

                setLoadProgress(
                  null,
                );

                throw new Error(
                  'A lista retornada pelo provedor está vazia.',
                );
              }

              /*
               * =================================================
               * DADOS FINAIS
               * =================================================
               */

              const finalTotals =
                progress.totals ??
                {
                  ...EMPTY_TOTALS,
                };

              const finalGroupsByCategory =
                progress.groupsByCategory ??
                {
                  ...EMPTY_GROUPS,
                };

              /*
               * Salva metadata definitiva.
               */
              await savePlaylistMeta({
                scope: playlistScope,
                totals:
                  finalTotals,

                groups:
                  progress.groups,

                groupsByCategory:
                  finalGroupsByCategory,
              });

              setTotals(
                finalTotals,
              );

              runningTotalsRef.current =
                {
                  ...finalTotals,
                };

              setGroupsByCategory(
                finalGroupsByCategory,
              );

              setStreamingDone(
                true,
              );

              setLoadProgress(
                null,
              );

              /*
               * Categoria atualmente aberta.
               */
              const currentCategory =
                categoryForView(
                  viewRef.current,
                ) ??
                'live';

              setGroups(
                finalGroupsByCategory[
                  currentCategory
                ] ??
                  [],
              );

              /*
               * Filmes e Séries são lazy.
               *
               * Não carrega 1200 itens aqui.
               */
              if (
                currentCategory !==
                  'movies' &&
                currentCategory !==
                  'series'
              ) {
                await loadCategoryPreview(
                  currentCategory,
                );
              }

              if (
                phaseRef.current !==
                'ready'
              ) {
                phaseRef.current =
                  'ready';

                setPhase(
                  'ready',
                );
              }
            }
          },

          controller.signal,
        );
      } catch (error) {
        if (!mounted) {
          return;
        }

        /*
         * Cancelamento manual.
         */
        if (
          error instanceof
            DOMException &&
          error.name ===
            'AbortError'
        ) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : 'Não foi possível atualizar a lista.';

        console.error(
          'Erro ao atualizar playlist:',
          error,
        );

        setLoadError(
          message,
        );

        setStreamingDone(
          true,
        );

        setLoadProgress(
          null,
        );

        /*
         * Qualquer falha de validação/carregamento impede a
         * abertura do player com dados antigos ou parciais.
         */
        setActiveChannel(null);

        phaseRef.current =
          'access-error';

        setPhase(
          'access-error',
        );
      }
    })();

    /*
     * CLEANUP
     */
    return () => {
      mounted =
        false;

      controller.abort();

      if (
        connectControllerRef.current ===
        controller
      ) {
        connectControllerRef.current =
          null;
      }
    };
  }, [
    reloadKey,
    loadCategoryPreview,
  ]);

  /*
|--------------------------------------------------------------------------
| MUDANÇA DE TELA
|--------------------------------------------------------------------------
|
| TV:
| carrega uma janela do IndexedDB.
|
| FILMES / SÉRIES:
| carrega somente os nomes das categorias.
| Os itens são carregados dentro das Views
| depois do clique na categoria.
|
*/

  useEffect(() => {
    if (
      phase !== 'ready'
    ) {
      return;
    }

    const category =
      categoryForView(
        view,
      );

    if (!category) {
      return;
    }

    /*
     * Mostra categorias imediatamente.
     */
    setGroups(
      groupsByCategory[
        category
      ] ??
        [],
    );

    /*
     * FILMES E SÉRIES
     *
     * Não carrega os itens aqui.
     */
    if (
      category ===
        'movies' ||
      category ===
        'series'
    ) {
      setChannels(
        [],
      );

      return;
    }

    /*
     * HOME / LIVE
     */
    void loadCategoryPreview(
      category,
    ).catch(
      (error) => {
        console.error(
          'Erro ao carregar categoria:',
          error,
        );
      },
    );
  }, [
    view,
    phase,
    groupsByCategory,
    loadCategoryPreview,
  ]);

  /*
|--------------------------------------------------------------------------
| FAVORITOS
|--------------------------------------------------------------------------
*/

  useEffect(() => {
    const saved =
      storage.getFavorites();

    if (
      saved.length
    ) {
      setFavorites(
        new Set(
          saved,
        ),
      );
    }
  }, []);

  /*
|--------------------------------------------------------------------------
| ADMIN HASH
|--------------------------------------------------------------------------
*/

  useEffect(() => {
    const checkHash =
      () => {
        setShowAdmin(
          window.location
            .hash ===
            '#admin',
        );
      };

    checkHash();

    window.addEventListener(
      'hashchange',
      checkHash,
    );

    return () => {
      window.removeEventListener(
        'hashchange',
        checkHash,
      );
    };
  }, []);

  /*
|--------------------------------------------------------------------------
| ADMIN AUTH
|--------------------------------------------------------------------------
*/

  useEffect(() => {
    if (
      !showAdmin
    ) {
      return;
    }

    let mounted =
      true;

    void (async () => {
      const { data } =
        await supabase
          .auth
          .getSession();

      if (
        !mounted ||
        !data.session
      ) {
        return;
      }

      const {
        data: profile,
      } =
        await supabase
          .from(
            'profiles',
          )
          .select(
            'role, admin_active',
          )
          .eq(
            'id',
            data.session.user.id,
          )
          .maybeSingle();

      if (
        mounted &&
        profile?.admin_active !== false &&
        ['admin', 'super_admin', 'provider_admin'].includes(profile?.role ?? '')
      ) {
        setAdminAuthed(
          true,
        );
      }
    })();

    return () => {
      mounted =
        false;
    };
  }, [
    showAdmin,
  ]);

  /*
|--------------------------------------------------------------------------
| PROVIDER
|--------------------------------------------------------------------------
*/

  const handleProviderConnecting =
    useCallback(
      () => {
        setLoadError(
          '',
        );

        setPhase(
          'connecting',
        );
      },
      [],
    );

  const handleCancelLoad =
    useCallback(
      () => {
        connectControllerRef.current
          ?.abort();

        connectControllerRef.current =
          null;

        setPhase(
          'login',
        );
      },
      [],
    );

  const handleProviderError =
    useCallback(
      (
        message:
          string,
      ) => {
        setLoadError(
          message,
        );

        setPhase(
          'login',
        );
      },
      [],
    );

  /*
   * ProviderAccess apenas salva
   * as credenciais.
   *
   * O App faz a importação.
   */
  const handleProviderSuccess =
    useCallback(
      async () => {
        const credentials = storage.getCredentials();
        if (credentials?.provider) {
          const { data: providers } = await supabase.rpc('find_public_provider', { provider_name: credentials.provider });
          const provider = providers?.[0];
          if (provider) {
            const { data } = await supabase.from('provider_branding').select('app_name, logo_url, primary_color, secondary_color, background_url, login_background_url, main_font_scale, font_family').eq('provider_id', provider.id).maybeSingle();
            if (data) setBranding(data as Branding);
          }
        }
        setReloadKey(
          (
            value,
          ) =>
            value +
            1,
        );
      },
      [],
    );

  /*
|--------------------------------------------------------------------------
| SELEÇÃO
|--------------------------------------------------------------------------
*/

  const handleSelectChannel =
    useCallback(
      (
        channel:
          Channel,
      ) => {
        const isLive = channel.category === 'live';
        if (channel.id.startsWith('episode:')) setSeriesResumeId(channel.parentSeriesId || null);
        if (!isLive) {
          void enterAppFullscreen(document.documentElement);
        }

        setActiveChannel(
          channel,
        );

        setView(isLive ? 'live' : 'player');

        addRecent(
          channel,
        );

        storage.saveRecents(
          [
            channel.id,

            ...recents.map(
              (
                item,
              ) =>
                item.id,
            ),
          ].slice(
            0,
            20,
          ),
        );
      },
      [
        recents,
        addRecent,
      ],
    );

  /*
|--------------------------------------------------------------------------
| FAVORITAR
|--------------------------------------------------------------------------
*/

  const handleToggleFavorite =
    useCallback(
      (
        id:
          string,
        channel?:
          Channel,
      ) => {
        setFavorites(
          (
            current,
          ) => {
            const next =
              new Set(
                current,
              );

            if (
              next.has(
                id,
              )
            ) {
              next.delete(
                id,
              );
              storage.removeFavoriteItem(id);
            } else {
              next.add(
                id,
              );
              if (channel) storage.saveFavoriteItem(channel);
            }

            storage.saveFavorites(
              Array.from(
                next,
              ),
            );

            return next;
          },
        );
      },
      [],
    );

  /*
|--------------------------------------------------------------------------
| CARREGA FAVORITOS
|--------------------------------------------------------------------------
*/

  const handleLoadFavorites =
    useCallback(
      async () => {
        const ids = Array.from(favorites);
        const stored = await getChannelsByIds(
          ids,
          500,
        );
        const storedById = new Map(stored.map((item) => [item.id, item]));
        const catalogItems = storage.getFavoriteItems();
        return ids.map((id) => storedById.get(id) ?? catalogItems[id]).filter(Boolean) as Channel[];
      },
      [
        favorites,
      ],
    );

  /*
|--------------------------------------------------------------------------
| TOTAL
|--------------------------------------------------------------------------
*/

  const totalItemCount =
    totals.live +
    totals.movies +
    totals.series +
    totals.radio +
    totals.other;

  /*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

  const handleSignOut =
    useCallback(
      async () => {
        connectControllerRef.current
          ?.abort();

        connectControllerRef.current =
          null;

        /*
         * Logout real:
         * aqui sim removemos credenciais.
         */
        storage.clearCredentials();

        storage.clearCache();

        try {
          await deletePlaylistDB();
        } catch {
          /*
           * noop
           */
        }

        setChannels(
          [],
        );

        setGroups(
          [],
        );

        setGroupsByCategory({
          ...EMPTY_GROUPS,
        });

        setActiveChannel(
          null,
        );

        setTotals({
          ...EMPTY_TOTALS,
        });

        setStreamingDone(
          true,
        );

        setLoadProgress(
          null,
        );

        setLoadError(
          '',
        );

        setPhase(
          'login',
        );
      },
      [],
    );

  /*
|--------------------------------------------------------------------------
| FALHA DE ACESSO À LISTA
|--------------------------------------------------------------------------
*/

  const handleRetryListAccess =
    useCallback(
      () => {
        setLoadError('');
        phaseRef.current = 'loading';
        setPhase('loading');
        setReloadKey((value) => value + 1);
      },
      [],
    );

  const handleChangeListCredentials =
    useCallback(
      () => {
        connectControllerRef.current?.abort();
        connectControllerRef.current = null;

        storage.clearCredentials();

        setLoadError('');
        setActiveChannel(null);
        setChannels([]);
        setGroups([]);
        setGroupsByCategory({
          ...EMPTY_GROUPS,
        });
        setTotals({
          ...EMPTY_TOTALS,
        });
        setStreamingDone(true);
        setLoadProgress(null);

        phaseRef.current = 'login';
        setPhase('login');
      },
      [],
    );

  /*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
*/

  const handleAdminExit =
    useCallback(
      () => {
        window.location.hash =
          '';

        setShowAdmin(
          false,
        );
      },
      [],
    );

  const handleAdminSignOut =
    useCallback(
      async () => {
        await supabase
          .auth
          .signOut();

        setAdminAuthed(
          false,
        );

        handleAdminExit();
      },
      [
        handleAdminExit,
      ],
    );

  /*
|--------------------------------------------------------------------------
| ADMIN RENDER
|--------------------------------------------------------------------------
*/

  if (
    showAdmin
  ) {
    return adminAuthed ? (
      <AdminShell
        onExit={
          handleAdminExit
        }
        onSignOut={
          handleAdminSignOut
        }
      />
    ) : (
      <AdminLogin
        onSuccess={() =>
          setAdminAuthed(
            true,
          )
        }
        onCancel={
          handleAdminExit
        }
      />
    );
  }

  /*
|--------------------------------------------------------------------------
| LOADING
|--------------------------------------------------------------------------
*/

  if (
    phase ===
    'loading'
  ) {
    return (
      <LoadingScreen
        message="Verificando acesso..."
        branding={
          branding
        }
        onCancel={
          handleCancelLoad
        }
        channelCount={
          loadProgress
            ?.channels
        }
        groupCount={
          loadProgress
            ?.groups
        }
      />
    );
  }

  /*
|--------------------------------------------------------------------------
| CONNECTING
|--------------------------------------------------------------------------
*/

  if (
    phase ===
    'connecting'
  ) {
    return (
      <LoadingScreen
        message="Carregando sua lista..."
        branding={
          branding
        }
        onCancel={
          handleCancelLoad
        }
        channelCount={
          loadProgress
            ?.channels
        }
        groupCount={
          loadProgress
            ?.groups
        }
      />
    );
  }

  /*
|--------------------------------------------------------------------------
| FALHA AO CARREGAR A LISTA
|--------------------------------------------------------------------------
*/

  if (
    phase ===
    'access-error'
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#091018] px-5 text-white">
        <div className="w-full max-w-lg text-center">
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt={branding.app_name}
              className="mx-auto mb-8 max-h-16 max-w-[12rem] object-contain"
            />
          ) : (
            <div className="mb-3 text-sm font-semibold uppercase tracking-[.05em] text-white/35">
              {branding.app_name}
            </div>
          )}

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/[.06] text-2xl text-white/55">
            !
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight">
            Falha ao carregar a lista
          </h1>

          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/50">
            Não foi possível validar ou carregar sua lista neste momento.
            Entre em contato com o provedor da lista para verificar seu acesso.
          </p>

          {loadError && (
            <p className="mx-auto mt-4 max-w-md rounded-xl bg-white/[.045] px-4 py-3 text-xs leading-5 text-white/45">
              {loadError}
            </p>
          )}

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleRetryListAccess}
              autoFocus
              className="min-h-12 rounded-xl px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-[#091018]"
              style={{ backgroundColor: branding.primary_color }}
            >
              Recarregar
            </button>

            <button
              type="button"
              onClick={handleChangeListCredentials}
              className="min-h-12 rounded-xl bg-white/[.08] px-5 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/[.13] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-4 focus-visible:ring-offset-[#091018]"
            >
              Alterar dados da lista
            </button>
          </div>
        </div>
      </div>
    );
  }

  /*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

  if (
    phase ===
    'login'
  ) {
    return (
      <div className="min-h-screen text-white">

        {loadError && (
          <div className="absolute inset-x-0 top-0 z-10 flex justify-center px-5 pt-6">

            <p className="max-w-md rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-200 backdrop-blur-md">
              {loadError}
            </p>

          </div>
        )}

        <ProviderAccess
          branding={
            branding
          }
          onConnecting={
            handleProviderConnecting
          }
          onError={
            handleProviderError
          }
          onSuccess={
            handleProviderSuccess
          }
          controllerRef={
            connectControllerRef
          }
        />

      </div>
    );
  }

  /*
|--------------------------------------------------------------------------
| NAVEGAÇÃO
|--------------------------------------------------------------------------
*/

  const handleNavigate =
    (
      nextView:
        View,
    ) => {
      if (
        nextView !== 'live' &&
        activeChannel?.category === 'live'
      ) {
        setActiveChannel(null);
      }

      if (nextView === view) {
        setViewResetKey((current) => current + 1);
      }
      setView(
        nextView,
      );

      setSidebarOpen(
        false,
      );
    };

  /*
|--------------------------------------------------------------------------
| APP
|--------------------------------------------------------------------------
*/

  return (
    <div className="app-font-scale min-h-screen overflow-x-hidden bg-[#091018] text-white selection:bg-lime-300 selection:text-slate-950" style={{
      '--app-font-scale': branding.main_font_scale || 1,
      '--app-font-family': `'${branding.font_family || 'Inter'}', Arial, sans-serif`,
      '--brand-primary': branding.primary_color || '#bef264',
      '--brand-secondary': branding.secondary_color || '#091018',
    } as React.CSSProperties}>

      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_35%_0%,rgba(46,72,86,.32),transparent_38%),radial-gradient(circle_at_90%_80%,rgba(61,104,85,.16),transparent_30%)]" />

      <div className="flex min-h-screen w-full">

        <Sidebar
          branding={branding}
          view={
            view
          }
          setView={
            handleNavigate
          }
          open={
            sidebarOpen
          }
          onClose={() =>
            setSidebarOpen(
              false,
            )
          }
        />

        <main className="min-w-0 flex-1 px-5 pb-12 sm:px-8 lg:ml-20 lg:px-10 lg:py-8">

          {!['home', 'movies', 'series', 'live', 'favorites', 'settings'].includes(view) && <TopBar
            query={
              query
            }
            setQuery={
              setQuery
            }
            onMenuOpen={() =>
              setSidebarOpen(
                true,
              )
            }
            onSignOut={
              handleSignOut
            }
            home={false}
          />}

          {view ===
            'home' && (
            <HomeView
              favorites={
                favorites
              }
              onSelectChannel={
                handleSelectChannel
              }
              onToggleFavorite={
                handleToggleFavorite
              }
              onNavigate={
                handleNavigate
              }
              onSelectSeries={(seriesId) => {
                setSeriesResumeId(seriesId);
                handleNavigate('series');
              }}
              branding={{
                primaryColor: branding.primary_color,
                secondaryColor: branding.secondary_color,
              }}
            />
          )}

          {view ===
            'live' && (
            <LiveView
              channels={
                channels
              }
              groups={groups}
              activeChannel={
                activeChannel
              }
              favorites={
                favorites
              }
              onMenuOpen={() =>
                setSidebarOpen(
                  true,
                )
              }
              onBack={() =>
                handleNavigate(
                  'home',
                )
              }
              onSelectChannel={
                handleSelectChannel
              }
              onToggleFavorite={
                handleToggleFavorite
              }
            />
          )}

          {view ===
            'movies' && (
            <MoviesView
              key={`movies-${viewResetKey}`}
              channels={
                channels
              }
              groups={
                groups
              }
              favorites={
                favorites
              }
              onSelectChannel={
                handleSelectChannel
              }
              onToggleFavorite={
                handleToggleFavorite
              }
            />
          )}

          {view ===
            'series' && (
            <SeriesView
              key={`series-${viewResetKey}`}
              channels={
                channels
              }
              groups={
                groups
              }
              favorites={
                favorites
              }
              onSelectChannel={
                handleSelectChannel
              }
              onToggleFavorite={
                handleToggleFavorite
              }
              resumeSeriesId={seriesResumeId}
              onResumeHandled={() => setSeriesResumeId(null)}
            />
          )}

          {view === 'player' && activeChannel && (
            <PlaybackView
              channel={activeChannel}
              onClose={() => {
                void exitAppFullscreen();
                handleNavigate(activeChannel.id.startsWith('episode:') ? 'series' : 'movies');
              }}
            />
          )}

          {view ===
            'favorites' && (
            <FavoritesView
              favorites={
                favorites
              }
              onSelectChannel={
                handleSelectChannel
              }
              onToggleFavorite={
                handleToggleFavorite
              }
              loadFavorites={
                handleLoadFavorites
              }
              onNavigate={handleNavigate}
            />
          )}

          {view ===
            'continue' && (
            <ContinueWatchingView
              recents={recents}
              favorites={favorites}
              onSelectChannel={handleSelectChannel}
              onToggleFavorite={handleToggleFavorite}
            />
          )}

          {view ===
            'search' && (
            <SearchView
              favorites={
                favorites
              }
              onSelectChannel={
                handleSelectChannel
              }
              onToggleFavorite={
                handleToggleFavorite
              }
              initialQuery={
                query
              }
              totalCount={
                totalItemCount
              }
            />
          )}

          {view ===
            'settings' && (
            <SettingsView onSignOut={handleSignOut} />
          )}

          {!streamingDone &&
            phase ===
              'ready' && (
              <div className="fixed bottom-4 right-4 z-40 rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 text-xs text-white/60 shadow-xl backdrop-blur">

                Atualizando lista em segundo plano…

              </div>
            )}

        </main>

      </div>

    </div>
  );
}
