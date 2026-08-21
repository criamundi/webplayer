import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Search,
  Star,
  ChevronDown,
  Tv2,
} from 'lucide-react';

import type { Channel } from '@/types';

interface ChannelListProps {
  channels: Channel[];
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
  onSelect: (channel: Channel) => void;
  activeChannelId?: string;
}

const ITEM_HEIGHT = 58;
const OVERSCAN = 6;

const ChannelRow = memo(function ChannelRow({
  channel,
  isActive,
  isFav,
  onSelect,
  onToggleFavorite,
  style,
}: {
  channel: Channel;
  isActive: boolean;
  isFav: boolean;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (id: string) => void;
  style: React.CSSProperties;
}) {
  return (
    <div style={style} className="px-0.5">
      <div
        onClick={() => onSelect(channel)}
        className={`group flex h-[54px] cursor-pointer items-center gap-3 rounded-xl border p-2.5 ${
          isActive
            ? 'border-white/30 bg-white/15'
            : 'border-white/5 bg-white/[0.025] hover:bg-white/[0.07]'
        }`}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
          {channel.logo ? (
            <img
              src={channel.logo}
              alt=""
              className="h-full w-full object-contain"
              loading="lazy"
              decoding="async"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <Tv2 className="h-5 w-5 text-white/25" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white/90">
            {channel.name}
          </p>

          <p className="truncate text-xs text-white/35">
            {channel.group || 'Outros'}
          </p>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(channel.id);
          }}
          className={`rounded-lg p-1.5 ${
            isFav
              ? 'text-amber-300'
              : 'text-white/25 opacity-0 group-hover:opacity-100'
          }`}
          aria-label={
            isFav
              ? 'Remover dos favoritos'
              : 'Adicionar aos favoritos'
          }
        >
          <Star
            className={`h-4 w-4 ${
              isFav ? 'fill-amber-300' : ''
            }`}
          />
        </button>
      </div>
    </div>
  );
});

export function ChannelList({
  channels,
  favorites,
  onToggleFavorite,
  onSelect,
  activeChannelId,
}: ChannelListProps) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('Todos');
  const [showFavoritesOnly, setShowFavoritesOnly] =
    useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(500);

  const scrollRef = useRef<HTMLDivElement>(null);

  /*
   * =========================================================
   * GRUPOS
   * =========================================================
   *
   * Só recalcula quando a referência da lista realmente muda.
   */
  const groups = useMemo(() => {
    const groupSet = new Set<string>();

    for (const channel of channels) {
      groupSet.add(channel.group || 'Outros');
    }

    const result = Array.from(groupSet);

    result.sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );

    return ['Todos', ...result];
  }, [channels]);

  /*
   * Se o grupo selecionado deixar de existir,
   * volta automaticamente para Todos.
   */
  useEffect(() => {
    if (
      group !== 'Todos' &&
      !groups.includes(group)
    ) {
      setGroup('Todos');
    }
  }, [groups, group]);

  /*
   * =========================================================
   * FILTRO
   * =========================================================
   *
   * IMPORTANTE:
   *
   * Se não existe busca, filtro ou favoritos,
   * NÃO fazemos .filter() em 229.000 itens.
   *
   * Usamos diretamente o array original.
   */
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();

    const noFilter =
      !q &&
      group === 'Todos' &&
      !showFavoritesOnly;

    if (noFilter) {
      return channels;
    }

    const result: Channel[] = [];

    for (const channel of channels) {
      if (
        showFavoritesOnly &&
        !favorites.has(channel.id)
      ) {
        continue;
      }

      const channelGroup =
        channel.group || 'Outros';

      if (
        group !== 'Todos' &&
        channelGroup !== group
      ) {
        continue;
      }

      if (
        q &&
        !channel.name
          .toLocaleLowerCase()
          .includes(q)
      ) {
        continue;
      }

      result.push(channel);
    }

    return result;
  }, [
    channels,
    query,
    group,
    favorites,
    showFavoritesOnly,
  ]);

  /*
   * =========================================================
   * RESIZE
   * =========================================================
   */
  useEffect(() => {
    const element = scrollRef.current;

    if (!element) return;

    const resizeObserver =
      new ResizeObserver((entries) => {
        const height =
          entries[0]?.contentRect.height;

        if (height) {
          setContainerHeight(height);
        }
      });

    resizeObserver.observe(element);

    setContainerHeight(
      element.clientHeight || 500
    );

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  /*
   * =========================================================
   * SCROLL
   * =========================================================
   */
  const handleScroll = useCallback(() => {
    const element = scrollRef.current;

    if (!element) return;

    setScrollTop(element.scrollTop);
  }, []);

  /*
   * =========================================================
   * VIRTUALIZAÇÃO
   * =========================================================
   *
   * Mesmo tendo 229.000 canais,
   * somente ~20 são colocados no DOM.
   */
  const totalHeight =
    filtered.length * ITEM_HEIGHT;

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / ITEM_HEIGHT) -
      OVERSCAN
  );

  const endIndex = Math.min(
    filtered.length,
    Math.ceil(
      (scrollTop + containerHeight) /
        ITEM_HEIGHT
    ) + OVERSCAN
  );

  const visibleItems = [];

  for (
    let index = startIndex;
    index < endIndex;
    index++
  ) {
    const channel = filtered[index];

    if (!channel) continue;

    visibleItems.push(
      <ChannelRow
        key={channel.id}
        channel={channel}
        isActive={
          channel.id === activeChannelId
        }
        isFav={favorites.has(channel.id)}
        onSelect={onSelect}
        onToggleFavorite={
          onToggleFavorite
        }
        style={{
          position: 'absolute',
          top:
            index * ITEM_HEIGHT,
          left: 0,
          right: 0,
          height: ITEM_HEIGHT,
        }}
      />
    );
  }

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */
  return (
    <div className="flex h-full min-h-0 flex-col">

      {/* BUSCA */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />

        <input
          value={query}
          onChange={(event) =>
            setQuery(event.target.value)
          }
          placeholder="Buscar canal..."
          className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/20"
        />
      </div>

      {/* FILTROS */}
      <div className="mb-3 flex gap-2">

        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() =>
              setGroupOpen(
                (value) => !value
              )
            }
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-xs font-medium text-white"
          >
            <span className="truncate">
              {group}
            </span>

            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                groupOpen
                  ? 'rotate-180'
                  : ''
              }`}
            />
          </button>

          {groupOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#111820] shadow-2xl">

              {groups.map(
                (groupName) => (
                  <button
                    key={groupName}
                    type="button"
                    onClick={() => {
                      setGroup(
                        groupName
                      );
                      setGroupOpen(
                        false
                      );

                      if (
                        scrollRef.current
                      ) {
                        scrollRef.current.scrollTop = 0;
                      }

                      setScrollTop(0);
                    }}
                    className={`w-full px-3 py-2.5 text-left text-xs ${
                      groupName === group
                        ? 'bg-white/10 text-white'
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {groupName}
                  </button>
                )
              )}

            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() =>
            setShowFavoritesOnly(
              (value) => !value
            )
          }
          className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium ${
            showFavoritesOnly
              ? 'border-amber-400/40 bg-amber-400/15 text-amber-300'
              : 'border-white/10 bg-white/5 text-white/60'
          }`}
        >
          <Star
            className={`h-3.5 w-3.5 ${
              showFavoritesOnly
                ? 'fill-amber-300'
                : ''
            }`}
          />

          Favoritos
        </button>
      </div>

      {/* CONTADOR */}
      <div className="mb-2 px-1 text-xs text-white/35">
        {filtered.length.toLocaleString(
          'pt-BR'
        )}{' '}
        canais
      </div>

      {/* LISTA VIRTUAL */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-white/30">
            <Tv2 className="mb-2 h-8 w-8" />

            <p className="text-xs">
              Nenhum canal encontrado
            </p>
          </div>
        ) : (
          <div
            style={{
              position: 'relative',
              height: totalHeight,
            }}
          >
            {visibleItems}
          </div>
        )}
      </div>
    </div>
  );
}