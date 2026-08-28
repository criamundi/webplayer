import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Heart, History, Loader2, Menu, Radio, Search, Tag, Tv, Wifi } from 'lucide-react';
import type { Channel } from '@/types';
import { VideoPlayer } from '@/components/VideoPlayer';
import { getChannelGroupsInOrder, getChannels, getChannelsByIds, searchChannels } from '@/lib/playlistStore';
import { getPlayableStreamUrl } from '@/lib/streamProxy';

interface LiveViewProps {
  channels: Channel[];
  groups: string[];
  activeChannel: Channel | null;
  favorites: Set<string>;
  recents: Channel[];
  onMenuOpen: () => void;
  onSelectChannel: (channel: Channel) => void;
  onToggleFavorite: (id: string, channel?: Channel) => void;
}

const PAGE_SIZE = 100;
const ALL_CHANNELS = '__all_live_channels__';
const SEARCH_CHANNELS = '__search_live_channels__';
const FAVORITE_CHANNELS = '__favorite_live_channels__';
const RECENT_CHANNELS = '__recent_live_channels__';
const cleanGroupName = (name: string) => name.trim() || 'Outros';
const categoryInitial = (name: string) => name.replace(/^CANAIS\s*\|?\s*/i, '').trim().charAt(0).toUpperCase() || 'C';
const groupLabel = (group: string) => {
  if (group === ALL_CHANNELS) return 'Todos';
  if (group === SEARCH_CHANNELS) return 'Procurar';
  if (group === FAVORITE_CHANNELS) return 'Favoritos';
  if (group === RECENT_CHANNELS) return 'Últimos assistidos';
  return cleanGroupName(group);
};

function moveFocus(event: KeyboardEvent<HTMLElement>, container: HTMLElement | null, selector: string, direction: -1 | 1) {
  if (!container) return;
  const targets = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((item) => !item.hasAttribute('disabled'));
  const current = targets.indexOf(event.currentTarget);
  if (current < 0) return;
  const next = targets[Math.min(Math.max(current + direction, 0), targets.length - 1)];
  if (!next || next === event.currentTarget) return;
  event.preventDefault();
  next.focus();
  next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function Logo({ channel, compact = false }: { channel: Channel; compact?: boolean }) {
  const [source, setSource] = useState(channel.logo);
  const [failed, setFailed] = useState(!channel.logo);

  useEffect(() => {
    setSource(channel.logo);
    setFailed(!channel.logo);
  }, [channel.logo]);

  if (!source || failed) return <Tv className={`${compact ? 'h-5 w-5' : 'h-8 w-8'} text-white/18`} />;

  return <img
    src={source}
    alt=""
    loading="lazy"
    decoding="async"
    onError={() => {
      const proxy = getPlayableStreamUrl(channel.logo || '');
      if (source !== proxy) setSource(proxy);
      else setFailed(true);
    }}
    className={`${compact ? 'max-h-10 max-w-12' : 'max-h-16 max-w-[75%]'} object-contain`}
  />;
}

export const LiveView = memo(function LiveView({ groups, activeChannel, favorites, recents, onMenuOpen, onSelectChannel, onToggleFavorite }: LiveViewProps) {
  const [activeGroup, setActiveGroup] = useState(ALL_CHANNELS);
  const [orderedGroups, setOrderedGroups] = useState(groups);
  const [items, setItems] = useState<Channel[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const categoryListRef = useRef<HTMLElement>(null);
  const channelListRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const onSelectChannelRef = useRef(onSelectChannel);
  const liveActive = activeChannel?.category === 'live' && Boolean(activeChannel.url) ? activeChannel : null;

  useEffect(() => {
    onSelectChannelRef.current = onSelectChannel;
  }, [onSelectChannel]);

  useEffect(() => {
    let active = true;
    void getChannelGroupsInOrder('live').then((result) => {
      if (!active) return;
      const merged = [...result, ...groups.filter((group) => !result.includes(group))];
      setOrderedGroups(merged);
    }).catch(() => {
      if (active) setOrderedGroups(groups);
    });
    return () => { active = false; };
  }, [groups]);

  useEffect(() => {
    if ([SEARCH_CHANNELS, FAVORITE_CHANNELS, RECENT_CHANNELS].includes(activeGroup)) return;
    let active = true;
    setLoading(true);
    setItems([]);
    const group = activeGroup === ALL_CHANNELS ? undefined : activeGroup;
    void getChannels('live', PAGE_SIZE, 0, group).then((result) => {
      if (!active) return;
      setItems(result);
      setOffset(result.length);
      setHasMore(result.length === PAGE_SIZE);
      if (result[0]) onSelectChannelRef.current(result[0]);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [activeGroup]);

  useEffect(() => {
    if (activeGroup !== FAVORITE_CHANNELS) return;
    let active = true;
    setLoading(true);
    void getChannelsByIds(Array.from(favorites), 500).then((result) => {
      if (active) setItems(result.filter((channel) => channel.category === 'live'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    setHasMore(false);
    return () => { active = false; };
  }, [activeGroup, favorites]);

  useEffect(() => {
    if (activeGroup !== RECENT_CHANNELS) return;
    setItems(recents.filter((channel) => channel.category === 'live'));
    setHasMore(false);
    setLoading(false);
  }, [activeGroup, recents]);

  useEffect(() => {
    if (activeGroup !== SEARCH_CHANNELS) return;
    setHasMore(false);
    const value = query.trim();
    if (value.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    const timeout = window.setTimeout(() => {
      void searchChannels(value, 120, 'live').then((result) => {
        if (active) setItems(result);
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [activeGroup, query]);

  useEffect(() => {
    if (activeGroup !== SEARCH_CHANNELS) return;
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [activeGroup]);

  const chooseGroup = useCallback((group: string) => {
    setActiveGroup(group);
    setQuery('');
    setItems([]);
    setHasMore(false);
    setLoading(true);
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const group = activeGroup === ALL_CHANNELS ? undefined : activeGroup;
      const result = await getChannels('live', PAGE_SIZE, offset, group);
      setItems((current) => [...current, ...result]);
      setOffset((current) => current + result.length);
      setHasMore(result.length === PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [activeGroup, hasMore, offset]);

  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (!trigger || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    }, { rootMargin: '320px 0px' });
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const handleCategoryKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown') moveFocus(event, categoryListRef.current, '[data-live-category]', 1);
    if (event.key === 'ArrowUp') moveFocus(event, categoryListRef.current, '[data-live-category]', -1);
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (activeGroup === SEARCH_CHANNELS) searchRef.current?.focus();
      else channelListRef.current?.querySelector<HTMLElement>('[data-live-channel]')?.focus();
    }
  };

  return <div className="live-page -mx-5 min-h-screen sm:-mx-8 lg:-mx-10 lg:-mt-8">
    <header className="live-topbar">
      <button type="button" onClick={onMenuOpen} className="live-mobile-back" aria-label="Abrir menu principal"><Menu className="h-5 w-5" /></button>
      <span className="live-topbar-icon"><Radio className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold uppercase tracking-[.17em] text-emerald-300/65">Canais ao Vivo</span><strong className="block truncate text-base text-white">{groupLabel(activeGroup)}</strong></span>
      <span className="live-status"><span /> Ao vivo</span>
    </header>

    <div className="live-workspace">
      <aside ref={categoryListRef} className="live-category-rail" aria-label="Categorias de canais">
        <button type="button" data-live-category onClick={() => chooseGroup(SEARCH_CHANNELS)} onKeyDown={handleCategoryKeyDown} className={`live-rail-action ${activeGroup === SEARCH_CHANNELS ? 'live-rail-item-active' : ''}`}><span className="live-rail-icon"><Search className="h-4 w-4" /></span><span className="live-rail-label">Procurar</span></button>
        <button type="button" data-live-category onClick={() => chooseGroup(FAVORITE_CHANNELS)} onKeyDown={handleCategoryKeyDown} className={`live-rail-action ${activeGroup === FAVORITE_CHANNELS ? 'live-rail-item-active' : ''}`}><span className="live-rail-icon"><Heart className="h-4 w-4" /></span><span className="live-rail-label">Favoritos</span></button>
        <button type="button" data-live-category onClick={() => chooseGroup(RECENT_CHANNELS)} onKeyDown={handleCategoryKeyDown} className={`live-rail-action ${activeGroup === RECENT_CHANNELS ? 'live-rail-item-active' : ''}`}><span className="live-rail-icon"><History className="h-4 w-4" /></span><span className="live-rail-label">Últimos assistidos</span></button>
        <button
          type="button"
          data-live-category
          onClick={() => chooseGroup(ALL_CHANNELS)}
          onKeyDown={handleCategoryKeyDown}
          className={`live-rail-all ${activeGroup === ALL_CHANNELS ? 'live-rail-item-active' : ''}`}
          title="Todos os canais"
        ><span className="live-rail-icon"><Tag className="h-4 w-4" /></span><span className="live-rail-label">Todos</span></button>
        <div className="live-rail-list">
          {orderedGroups.map((group) => <button
            key={group}
            type="button"
            data-live-category
            title={cleanGroupName(group)}
            onClick={() => chooseGroup(group)}
            onKeyDown={handleCategoryKeyDown}
            className={`live-rail-item ${activeGroup === group ? 'live-rail-item-active' : ''}`}
          >
            <span className="live-rail-initial">{categoryInitial(group)}</span>
            <span className="live-rail-label">{cleanGroupName(group)}</span>
          </button>)}
        </div>
      </aside>

      <section className="live-channel-panel" aria-label={`Canais de ${groupLabel(activeGroup)}`}>
        <div className="live-channel-header">
          <div className="flex min-w-0 items-center gap-3"><span className="live-channel-header-icon"><Wifi className="h-4 w-4" /></span><span className="min-w-0"><strong className="block truncate text-sm text-white">{groupLabel(activeGroup)}</strong><small className="block text-[11px] text-white/35">{loading ? 'Carregando canais...' : `${items.length} canais exibidos`}</small></span></div>
          <select value={activeGroup} onChange={(event) => chooseGroup(event.target.value)} className="live-category-select" aria-label="Trocar categoria">
            <option value={SEARCH_CHANNELS}>Procurar</option>
            <option value={FAVORITE_CHANNELS}>Favoritos</option>
            <option value={RECENT_CHANNELS}>Últimos assistidos</option>
            <option value={ALL_CHANNELS}>Todos</option>
            {orderedGroups.map((group) => <option key={group} value={group}>{cleanGroupName(group)}</option>)}
          </select>
        </div>

        {activeGroup === SEARCH_CHANNELS && <div className="live-search-wrap">
          <Search className="h-4 w-4" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                channelListRef.current?.querySelector<HTMLElement>('[data-live-channel]')?.focus();
              }
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                categoryListRef.current?.querySelector<HTMLElement>('.live-rail-item-active')?.focus();
              }
            }}
            placeholder="Procurar canal"
            aria-label="Procurar canal"
          />
        </div>}

        <div ref={channelListRef} className="live-channel-list">
          {loading
            ? Array.from({ length: 8 }).map((_, index) => <div key={index} className="live-channel-skeleton" />)
            : items.map((channel, index) => <div key={channel.id} className={`live-channel-row ${liveActive?.id === channel.id ? 'live-channel-row-active' : ''}`}>
              <button
                type="button"
                data-live-channel
                onClick={() => onSelectChannel(channel)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') moveFocus(event, channelListRef.current, '[data-live-channel]', 1);
                  if (event.key === 'ArrowUp') moveFocus(event, channelListRef.current, '[data-live-channel]', -1);
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault();
                    categoryListRef.current?.querySelector<HTMLElement>('.live-rail-item-active')?.focus();
                  }
                }}
                className="live-channel-main"
              >
                <span className="live-channel-position">{index + 1}</span>
                <span className="live-channel-logo"><Logo channel={channel} compact /></span>
                <span className="min-w-0 flex-1"><strong>{channel.name}</strong><small>{cleanGroupName(channel.group || 'Canais ao Vivo')}</small></span>
                {liveActive?.id === channel.id && <span className="live-playing-dot" title="Reproduzindo"><span /></span>}
              </button>
              <button
                type="button"
                onClick={() => onToggleFavorite(channel.id, channel)}
                className="live-channel-favorite"
                aria-label={favorites.has(channel.id) ? `Remover ${channel.name} dos favoritos` : `Adicionar ${channel.name} aos favoritos`}
              ><Heart className={`h-4 w-4 ${favorites.has(channel.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} /></button>
            </div>)}

          {!loading && !items.length && <div className="live-list-empty"><Search className="h-7 w-7" /><strong>{activeGroup === SEARCH_CHANNELS && query.trim().length < 2 ? 'Procure um canal' : 'Nenhum canal encontrado'}</strong><span>{activeGroup === SEARCH_CHANNELS && query.trim().length < 2 ? 'Digite pelo menos duas letras.' : activeGroup === FAVORITE_CHANNELS ? 'Você ainda não favoritou canais.' : activeGroup === RECENT_CHANNELS ? 'Os canais assistidos aparecerão aqui.' : 'Não há canais disponíveis nesta categoria.'}</span></div>}

          {hasMore && <div ref={loadMoreTriggerRef} className="live-auto-loader"><Loader2 className={`h-4 w-4 ${loadingMore ? 'animate-spin' : ''}`} /><span>{loadingMore ? 'Carregando mais canais...' : 'Preparando mais canais...'}</span></div>}
        </div>
      </section>

      <main className="live-player-panel">
        <section className="live-player-card">
          <div className="live-player-heading">
            <span className="live-player-logo">{liveActive ? <Logo channel={liveActive} compact /> : <Radio className="h-5 w-5 text-emerald-300/55" />}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.17em] text-emerald-300/70"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Ao vivo agora</span>
              <strong className="mt-1 block truncate text-base text-white sm:text-lg">{liveActive?.name || 'Selecione um canal'}</strong>
              <small className="block truncate text-xs text-white/35">{liveActive ? cleanGroupName(liveActive.group || 'Canais ao Vivo') : groupLabel(activeGroup)}</small>
            </span>
            {liveActive && <button type="button" onClick={() => onToggleFavorite(liveActive.id, liveActive)} className="live-player-favorite" aria-label={favorites.has(liveActive.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}><Heart className={`h-5 w-5 ${favorites.has(liveActive.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} /></button>}
          </div>

          <div className="live-video-frame">
            {liveActive
              ? <VideoPlayer channel={liveActive} />
              : <div className="live-player-empty"><span><Radio className="h-9 w-9" /></span><strong>Pronto para assistir</strong><p>Escolha um canal na lista para iniciar a transmissão.</p></div>}
          </div>

          <div className="live-player-footer"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /><span>A transmissão inicia ao selecionar um canal</span><span className="ml-auto hidden text-white/25 sm:block">Use tela cheia para uma experiência melhor</span></div>
        </section>
      </main>
    </div>
  </div>;
});
