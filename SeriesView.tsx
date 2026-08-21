import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  Clapperboard,
  Loader2,
  Star,
} from 'lucide-react';

import type { Channel } from '@/types';

import { ChannelCard } from '@/components/shared/ChannelCard';

import {
  getChannels,
} from '@/lib/playlistStore';

interface SeriesViewProps {
  channels: Channel[];
  groups: string[];
  favorites: Set<string>;
  onSelectChannel: (ch: Channel) => void;
  onToggleFavorite: (id: string) => void;
}

const PAGE_SIZE = 60;

export function SeriesView({
  groups,
  favorites,
  onSelectChannel,
  onToggleFavorite,
}: SeriesViewProps) {
  const [activeGroup, setActiveGroup] =
    useState<string | null>(null);

  const [series, setSeries] =
    useState<Channel[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [offset, setOffset] =
    useState(0);

  const [hasMore, setHasMore] =
    useState(false);

  useEffect(() => {
    setActiveGroup(null);
    setSeries([]);
    setOffset(0);
    setHasMore(false);
  }, []);

  const loadGroup =
    useCallback(
      async (
        group:
          string,
      ) => {
        setActiveGroup(
          group,
        );

        setLoading(
          true,
        );

        try {
          const result =
            await getChannels(
              'series',
              PAGE_SIZE,
              0,
              group,
            );

          setSeries(
            result,
          );

          setOffset(
            result.length,
          );

          setHasMore(
            result.length ===
              PAGE_SIZE,
          );
        } catch (error) {
          console.error(
            'Erro ao carregar séries:',
            error,
          );

          setSeries(
            [],
          );

          setOffset(
            0,
          );

          setHasMore(
            false,
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );

  const loadMore =
    useCallback(
      async () => {
        if (
          !activeGroup ||
          loading
        ) {
          return;
        }

        setLoading(
          true,
        );

        try {
          const result =
            await getChannels(
              'series',
              PAGE_SIZE,
              offset,
              activeGroup,
            );

          setSeries(
            (
              current,
            ) => [
              ...current,
              ...result,
            ],
          );

          setOffset(
            (
              current,
            ) =>
              current +
              result.length,
          );

          setHasMore(
            result.length ===
              PAGE_SIZE,
          );
        } catch (error) {
          console.error(
            'Erro ao carregar mais séries:',
            error,
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        activeGroup,
        loading,
        offset,
      ],
    );

  return (
    <div className="mt-6">

      <div className="mb-6 flex items-center gap-3">

        <div className="rounded-xl bg-lime-300/15 p-2.5 text-lime-300">
          <Clapperboard className="h-5 w-5" />
        </div>

        <div>

          <h1 className="text-2xl font-semibold tracking-tight">
            Séries
          </h1>

          <p className="text-xs text-white/40">
            Escolha uma categoria
          </p>

        </div>

      </div>

      {groups.length ===
      0 ? (

        <div className="flex flex-col items-center justify-center py-20 text-center">

          <Clapperboard className="mb-4 h-12 w-12 text-white/15" />

          <p className="text-sm font-medium text-white/50">
            Nenhuma categoria de séries encontrada
          </p>

        </div>

      ) : (

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">

          <aside className="hidden lg:block">

            <div className="sticky top-8 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">

              <div className="flex flex-col gap-2">

                {groups.map(
                  (
                    group,
                  ) => {
                    const active =
                      activeGroup ===
                      group;

                    return (
                      <button
                        key={
                          group
                        }
                        type="button"
                        onClick={() =>
                          void loadGroup(
                            group,
                          )
                        }
                        className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                          active
                            ? 'border-lime-300/40 bg-lime-300/15 text-lime-200'
                            : 'border-white/5 bg-white/[0.035] text-white/65 hover:bg-white/[0.07] hover:text-white'
                        }`}
                      >
                        <span className="line-clamp-1">
                          {group}
                        </span>
                      </button>
                    );
                  },
                )}

              </div>

            </div>

          </aside>

          <div className="lg:hidden">

            <select
              value={
                activeGroup ??
                ''
              }
              onChange={(
                event,
              ) => {
                if (
                  event.target
                    .value
                ) {
                  void loadGroup(
                    event.target
                      .value,
                  );
                }
              }}
              className="w-full rounded-xl border border-white/10 bg-[#101923] px-4 py-3 text-sm text-white outline-none"
            >

              <option value="">
                Escolha uma categoria
              </option>

              {groups.map(
                (
                  group,
                ) => (
                  <option
                    key={
                      group
                    }
                    value={
                      group
                    }
                  >
                    {group}
                  </option>
                ),
              )}

            </select>

          </div>

          <section className="min-w-0">

            {!activeGroup &&
              !loading && (

                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/[0.02] text-center">

                  <Clapperboard className="mb-4 h-12 w-12 text-white/10" />

                  <p className="text-sm text-white/45">
                    Escolha uma categoria para ver as séries
                  </p>

                </div>

              )}

            {loading &&
              series.length ===
                0 && (

                <div className="flex min-h-[420px] flex-col items-center justify-center">

                  <Loader2 className="mb-3 h-8 w-8 animate-spin text-lime-300" />

                  <p className="text-sm text-white/45">
                    Carregando séries...
                  </p>

                </div>

              )}

            {activeGroup &&
              !loading &&
              series.length ===
                0 && (

                <div className="flex min-h-[420px] flex-col items-center justify-center text-center">

                  <Clapperboard className="mb-4 h-12 w-12 text-white/10" />

                  <p className="text-sm text-white/45">
                    Nenhuma série encontrada nesta categoria
                  </p>

                </div>

              )}

            {series.length >
              0 && (
              <>
                <div className="mb-5">

                  <h2 className="truncate text-lg font-semibold text-white">
                    {activeGroup}
                  </h2>

                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">

                  {series.map(
                    (
                      item,
                    ) => (
                      <div
                        key={
                          item.id
                        }
                        className="relative"
                      >

                        <div className="pointer-events-none absolute left-2 top-2 z-20 flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-1 backdrop-blur-sm">

                          {Array.from({
                            length:
                              5,
                          }).map(
                            (
                              _,
                              index,
                            ) => (
                              <Star
                                key={
                                  index
                                }
                                className="h-3 w-3 fill-yellow-300 text-yellow-300"
                              />
                            ),
                          )}

                        </div>

                        <ChannelCard
                          channel={
                            item
                          }
                          isFavorite={favorites.has(
                            item.id,
                          )}
                          onSelect={
                            onSelectChannel
                          }
                          onToggleFavorite={
                            onToggleFavorite
                          }
                        />

                      </div>
                    ),
                  )}

                </div>

                {hasMore && (

                  <div className="mt-7 flex justify-center">

                    <button
                      type="button"
                      disabled={
                        loading
                      }
                      onClick={() =>
                        void loadMore()
                      }
                      className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                    >

                      {loading && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}

                      Carregar mais

                    </button>

                  </div>

                )}

              </>
            )}

          </section>

        </div>

      )}

    </div>
  );
}