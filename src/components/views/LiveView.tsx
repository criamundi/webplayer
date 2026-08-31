import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Heart, Loader2, Menu, Radio, Search, Tag, Tv, Wifi } from 'lucide-react';
import type { Channel } from '@/types';
import { VideoPlayer } from '@/components/VideoPlayer';
import { getChannelGroupsInOrder, getChannels, getChannelsByIds, searchChannels } from '@/lib/playlistStore';
import { getPlayableStreamUrl } from '@/lib/streamProxy';
import { loadLiveCatalog, loadLiveEpg, type LiveChannel, type LiveEpg, type LiveProgram } from '@/lib/provider';

interface LiveViewProps {
  channels: Channel[];
  groups: string[];
  activeChannel: Channel | null;
  favorites: Set<string>;
  onMenuOpen: () => void;
  onBack: () => void;
  onSelectChannel: (channel: Channel) => void;
  onToggleFavorite: (id: string, channel?: Channel) => void;
}

const PAGE_SIZE = 100;
const ALL_CHANNELS = '__all_live_channels__';
const SEARCH_CHANNELS = '__search_live_channels__';
const FAVORITE_CHANNELS = '__favorite_live_channels__';
const CHANNEL_SELECTION_DELAY = 1400;
const cleanGroupName = (name: string) => name.trim() || 'Outros';
const categoryInitial = (name: string) => name.replace(/^CANAIS\s*\|?\s*/i, '').trim().charAt(0).toUpperCase() || 'C';
const groupLabel = (group: string) => {
  if (group === ALL_CHANNELS) return 'Todos';
  if (group === SEARCH_CHANNELS) return 'Procurar';
  if (group === FAVORITE_CHANNELS) return 'Favoritos';
  return cleanGroupName(group);
};
const channelsForGroup = (channels: LiveChannel[], group: string) => group === ALL_CHANNELS ? channels : channels.filter((channel) => channel.group === group);
const normalizeChannelText = (value = '') => value.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
const programTime = (value?: string) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
};
const programSchedule = (program?: LiveProgram | null) => {
  const start = programTime(program?.start);
  const end = programTime(program?.end);
  return start && end ? `${start} – ${end}` : start;
};

function streamIdFromUrl(value: string) {
  try {
    const url = new URL(value);
    return url.searchParams.get('stream_id') || url.pathname.match(/\/(\d+)(?:\.[a-z0-9]+)?\/?$/i)?.[1] || '';
  } catch {
    return value.match(/\/(\d+)(?:\.[a-z0-9]+)?(?:\?.*)?$/i)?.[1] || '';
  }
}

function mergeOfficialChannels(official: LiveChannel[], stored: Channel[]): LiveChannel[] {
  const byStreamId = new Map<string, Channel>();
  const byNameAndGroup = new Map<string, Channel[]>();
  const byName = new Map<string, Channel[]>();

  stored.forEach((channel) => {
    const streamId = streamIdFromUrl(channel.url);
    if (streamId && !byStreamId.has(streamId)) byStreamId.set(streamId, channel);

    const name = normalizeChannelText(channel.name);
    const identity = `${name}\u0000${normalizeChannelText(channel.group)}`;
    byNameAndGroup.set(identity, [...(byNameAndGroup.get(identity) || []), channel]);
    byName.set(name, [...(byName.get(name) || []), channel]);
  });

  const used = new Set<string>();
  const nextUnused = (matches?: Channel[]) => matches?.find((channel) => !used.has(channel.id));

  return official.map((channel) => {
    const identity = `${normalizeChannelText(channel.name)}\u0000${normalizeChannelText(channel.group)}`;
    const byId = byStreamId.get(channel.streamId);
    const match = (byId && !used.has(byId.id) ? byId : undefined)
      || nextUnused(byNameAndGroup.get(identity))
      || nextUnused(byName.get(normalizeChannelText(channel.name)));

    if (!match) return channel;
    used.add(match.id);
    return {
      ...channel,
      id: match.id,
      url: match.url,
      logo: channel.logo || match.logo,
      tvgId: channel.tvgId || match.tvgId,
    };
  });
}

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

export const LiveView = memo(function LiveView({ groups, activeChannel, favorites, onMenuOpen, onBack, onSelectChannel, onToggleFavorite }: LiveViewProps) {
  const [activeGroup, setActiveGroup] = useState(ALL_CHANNELS);
  const [orderedGroups, setOrderedGroups] = useState(groups);
  const [officialChannels, setOfficialChannels] = useState<LiveChannel[] | null>(null);
  const [catalogReady, setCatalogReady] = useState(false);
  const [items, setItems] = useState<Channel[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [liveEpg, setLiveEpg] = useState<LiveEpg | null>(null);
  const [epgLoading, setEpgLoading] = useState(false);
  const loadingMoreRef = useRef(false);
  const categoryListRef = useRef<HTMLElement>(null);
  const channelListRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const channelSelectionTimerRef = useRef<number | null>(null);
  const onSelectChannelRef = useRef(onSelectChannel);
  const liveActive = activeChannel?.category === 'live' && Boolean(activeChannel.url) ? activeChannel : null;
  const activeOfficialChannel = liveActive && officialChannels?.find((channel) => channel.id === liveActive.id || (
    normalizeChannelText(channel.name) === normalizeChannelText(liveActive.name)
    && normalizeChannelText(channel.group) === normalizeChannelText(liveActive.group)
  ));
  const activeStreamId = liveActive ? ((liveActive as LiveChannel).streamId || activeOfficialChannel?.streamId || streamIdFromUrl(liveActive.url)) : '';

  useEffect(() => {
    onSelectChannelRef.current = onSelectChannel;
  }, [onSelectChannel]);

  useEffect(() => () => {
    if (channelSelectionTimerRef.current !== null) {
      window.clearTimeout(channelSelectionTimerRef.current);
    }
  }, []);

  const selectChannelSafely = useCallback((channel: Channel) => {
    if (channel.id === liveActive?.id) return;
    if (channelSelectionTimerRef.current !== null) {
      window.clearTimeout(channelSelectionTimerRef.current);
    }
    channelSelectionTimerRef.current = window.setTimeout(() => {
      channelSelectionTimerRef.current = null;
      onSelectChannelRef.current(channel);
    }, liveActive ? CHANNEL_SELECTION_DELAY : 0);
  }, [liveActive?.id]);

  useEffect(() => {
    let active = true;
    setLiveEpg(null);
    if (!activeStreamId) {
      setEpgLoading(false);
      return;
    }
    setEpgLoading(true);
    const refresh = () => void loadLiveEpg(activeStreamId).then((result) => {
      if (active) setLiveEpg(result);
    }).finally(() => {
      if (active) setEpgLoading(false);
    });
    refresh();
    const interval = window.setInterval(refresh, 10 * 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [activeStreamId]);

  useEffect(() => {
    let active = true;
    setCatalogReady(false);
    void loadLiveCatalog().then(async (catalog) => {
      if (!active) return;
      if (catalog?.channels.length) {
        const storedChannels = await getChannels('live', 1_000_000, 0);
        if (!active) return;
        setOfficialChannels(mergeOfficialChannels(catalog.channels, storedChannels));
        setOrderedGroups(catalog.categories.map((category) => category.name));
        return;
      }
      setOfficialChannels(null);
      const result = await getChannelGroupsInOrder('live');
      if (!active) return;
      setOrderedGroups([...result, ...groups.filter((group) => !result.includes(group))]);
    }).catch(() => {
      if (active) {
        setOfficialChannels(null);
        setOrderedGroups(groups);
      }
    }).finally(() => {
      if (active) setCatalogReady(true);
    });
    return () => { active = false; };
  }, [groups]);

  useEffect(() => {
    if (!catalogReady || [SEARCH_CHANNELS, FAVORITE_CHANNELS].includes(activeGroup)) return;
    let active = true;
    setLoading(true);
    setItems([]);
    if (officialChannels) {
      const source = channelsForGroup(officialChannels, activeGroup);
      const result = source.slice(0, PAGE_SIZE);
      setItems(result);
      setOffset(result.length);
      setHasMore(result.length < source.length);
      setLoading(false);
      return;
    }
    const group = activeGroup === ALL_CHANNELS ? undefined : activeGroup;
    void getChannels('live', PAGE_SIZE, 0, group).then((result) => {
      if (!active) return;
      setItems(result);
      setOffset(result.length);
      setHasMore(result.length === PAGE_SIZE);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [activeGroup, catalogReady, officialChannels]);

  useEffect(() => {
    if (activeGroup !== FAVORITE_CHANNELS) return;
    let active = true;
    setLoading(true);
    void getChannelsByIds(Array.from(favorites), 500).then((stored) => {
      if (!active) return;
      if (officialChannels) {
        const savedNames = new Set(stored.map((channel) => channel.name.trim().toLocaleLowerCase('pt-BR')));
        setItems(officialChannels.filter((channel) => favorites.has(channel.id) || savedNames.has(channel.name.trim().toLocaleLowerCase('pt-BR'))));
      } else {
        setItems(stored.filter((channel) => channel.category === 'live'));
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    setHasMore(false);
    return () => { active = false; };
  }, [activeGroup, favorites, officialChannels]);


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
      const request = officialChannels
        ? Promise.resolve(officialChannels.filter((channel) => channel.name.toLocaleLowerCase('pt-BR').includes(value.toLocaleLowerCase('pt-BR'))).slice(0, 120))
        : searchChannels(value, 120, 'live');
      void request.then((result) => {
        if (active) setItems(result);
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [activeGroup, officialChannels, query]);

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
      if (officialChannels) {
        const source = channelsForGroup(officialChannels, activeGroup);
        const result = source.slice(offset, offset + PAGE_SIZE);
        setItems((current) => [...current, ...result]);
        setOffset((current) => current + result.length);
        setHasMore(offset + result.length < source.length);
        return;
      }
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
  }, [activeGroup, hasMore, officialChannels, offset]);

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
                onClick={() => selectChannelSafely(channel)}
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

          {!loading && !items.length && <div className="live-list-empty"><Search className="h-7 w-7" /><strong>{activeGroup === SEARCH_CHANNELS && query.trim().length < 2 ? 'Procure um canal' : 'Nenhum canal encontrado'}</strong><span>{activeGroup === SEARCH_CHANNELS && query.trim().length < 2 ? 'Digite pelo menos duas letras.' : activeGroup === FAVORITE_CHANNELS ? 'Você ainda não favoritou canais.' : 'Não há canais disponíveis nesta categoria.'}</span></div>}

          {hasMore && <div ref={loadMoreTriggerRef} className="live-auto-loader"><Loader2 className={`h-4 w-4 ${loadingMore ? 'animate-spin' : ''}`} /><span>{loadingMore ? 'Carregando mais canais...' : 'Preparando mais canais...'}</span></div>}
        </div>
      </section>

      <main className="live-player-panel">
        <section className="live-player-card">
          <div className="live-video-frame">
            {liveActive
              ? <VideoPlayer
                channel={liveActive}
                onClose={onBack}
                liveProgram={liveEpg?.current ? { title: liveEpg.current.title, schedule: programSchedule(liveEpg.current) } : null}
                liveNextProgram={liveEpg?.next ? { title: liveEpg.next.title, schedule: programSchedule(liveEpg.next) } : null}
              />
              : <div className="live-player-empty"><span><Radio className="h-9 w-9" /></span><strong>Pronto para assistir</strong><p>Escolha um canal na lista para iniciar a transmissão.</p></div>}
          </div>

          <section className="live-day-guide" aria-label="Programação do dia">
            <div className="live-day-guide-title">
              <span>Programação do dia</span>
              {liveActive && <strong>{liveActive.name}</strong>}
            </div>

            {epgLoading && (
              <div className="live-day-guide-state">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando programação...
              </div>
            )}

            {!epgLoading && !liveEpg?.programs?.length && (
              <div className="live-day-guide-state">
                Programação não informada para este canal.
              </div>
            )}

            {!epgLoading && Boolean(liveEpg?.programs?.length) && (
              <div className="live-day-program-list">
                {liveEpg!.programs.map((program, index) => {
                  const isCurrent = liveEpg?.current?.start === program.start && liveEpg?.current?.title === program.title;
                  return (
                    <div key={`${program.start || index}-${program.title}`} className={`live-day-program ${isCurrent ? 'live-day-program-current' : ''}`}>
                      <span className="live-day-program-time">{programSchedule(program) || '--:--'}</span>
                      <span className="min-w-0 flex-1">
                        <strong>{program.title}</strong>
                        {program.description && <small>{program.description}</small>}
                      </span>
                      {isCurrent && <span className="live-day-program-now">Agora</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  </div>;
});
