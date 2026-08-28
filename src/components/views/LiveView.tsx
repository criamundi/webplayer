import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Heart, Loader2, Menu, Radio, Search, Tag, Tv, Wifi } from 'lucide-react';
import type { Channel } from '@/types';
import { VideoPlayer } from '@/components/VideoPlayer';
import { getChannels } from '@/lib/playlistStore';
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
const cleanGroupName = (name: string) => name.replace(/^CANAIS\s*\|?\s*/i, '').trim() || name;
const categoryInitial = (name: string) => cleanGroupName(name).charAt(0).toUpperCase() || 'C';
const groupLabel = (group: string) => group === ALL_CHANNELS ? 'Todos os canais' : cleanGroupName(group);

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

export const LiveView = memo(function LiveView({ groups, activeChannel, favorites, onMenuOpen, onSelectChannel, onToggleFavorite }: LiveViewProps) {
  const [activeGroup, setActiveGroup] = useState(ALL_CHANNELS);
  const [items, setItems] = useState<Channel[]>([]);
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const categoryListRef = useRef<HTMLElement>(null);
  const channelListRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const liveActive = activeChannel?.category === 'live' && Boolean(activeChannel.url) ? activeChannel : null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setItems([]);
    const group = activeGroup === ALL_CHANNELS ? undefined : activeGroup;
    void getChannels('live', PAGE_SIZE, 0, group).then((result) => {
      if (!active) return;
      setItems(result);
      setOffset(result.length);
      setHasMore(result.length === PAGE_SIZE);
      if (result[0]) onSelectChannel(result[0]);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [activeGroup, onSelectChannel]);

  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase('pt-BR');
    if (!value && !favoritesOnly) return items;
    return items.filter((channel) => {
      if (favoritesOnly && !favorites.has(channel.id)) return false;
      return !value || channel.name.toLocaleLowerCase('pt-BR').includes(value);
    });
  }, [favorites, favoritesOnly, items, query]);

  const chooseGroup = useCallback((group: string) => {
    setActiveGroup(group);
    setQuery('');
  }, []);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const group = activeGroup === ALL_CHANNELS ? undefined : activeGroup;
      const result = await getChannels('live', PAGE_SIZE, offset, group);
      setItems((current) => [...current, ...result]);
      setOffset((current) => current + result.length);
      setHasMore(result.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
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
        <button
          type="button"
          data-live-category
          onClick={() => chooseGroup(ALL_CHANNELS)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') moveFocus(event, categoryListRef.current, '[data-live-category]', 1);
            if (event.key === 'ArrowRight') { event.preventDefault(); searchRef.current?.focus(); }
          }}
          className={`live-rail-all ${activeGroup === ALL_CHANNELS ? 'live-rail-item-active' : ''}`}
          title="Todos os canais"
        ><Tag className="h-5 w-5" /><span className="live-rail-label">Todos os canais</span><span className="live-rail-initial"><Tag className="h-4 w-4" /></span></button>
        <div className="live-rail-list">
          {groups.map((group) => <button
            key={group}
            type="button"
            data-live-category
            title={cleanGroupName(group)}
            onClick={() => chooseGroup(group)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') moveFocus(event, categoryListRef.current, '[data-live-category]', 1);
              if (event.key === 'ArrowUp') moveFocus(event, categoryListRef.current, '[data-live-category]', -1);
              if (event.key === 'ArrowRight') { event.preventDefault(); searchRef.current?.focus(); }
            }}
            className={`live-rail-item ${activeGroup === group ? 'live-rail-item-active' : ''}`}
          >
            <span className="live-rail-initial">{categoryInitial(group)}</span>
            <span className="live-rail-label">{cleanGroupName(group)}</span>
          </button>)}
        </div>
      </aside>

      <section className="live-channel-panel" aria-label={`Canais de ${groupLabel(activeGroup)}`}>
        <div className="live-channel-header">
          <div className="flex min-w-0 items-center gap-3"><span className="live-channel-header-icon"><Wifi className="h-4 w-4" /></span><span className="min-w-0"><strong className="block truncate text-sm text-white">{groupLabel(activeGroup)}</strong><small className="block text-[11px] text-white/35">{loading ? 'Carregando canais...' : `${filtered.length} canais exibidos`}</small></span></div>
          <select value={activeGroup} onChange={(event) => chooseGroup(event.target.value)} className="live-category-select" aria-label="Trocar categoria">
            <option value={ALL_CHANNELS}>Todos os canais</option>
            {groups.map((group) => <option key={group} value={group}>{cleanGroupName(group)}</option>)}
          </select>
        </div>

        <div className="live-search-wrap">
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
        </div>

        <div className="live-filter-tabs" aria-label="Filtros de canais">
          <button type="button" onClick={() => setFavoritesOnly(false)} className={!favoritesOnly ? 'live-filter-active' : ''}>Todos</button>
          <button type="button" onClick={() => setFavoritesOnly(true)} className={favoritesOnly ? 'live-filter-active' : ''}><Heart className={`h-3.5 w-3.5 ${favoritesOnly ? 'fill-current' : ''}`} /> Favoritos</button>
        </div>

        <div ref={channelListRef} className="live-channel-list">
          {loading
            ? Array.from({ length: 8 }).map((_, index) => <div key={index} className="live-channel-skeleton" />)
            : filtered.map((channel, index) => <div key={channel.id} className={`live-channel-row ${liveActive?.id === channel.id ? 'live-channel-row-active' : ''}`}>
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

          {!loading && !filtered.length && <div className="live-list-empty"><Search className="h-7 w-7" /><strong>Nenhum canal encontrado</strong><span>{favoritesOnly ? 'Você ainda não favoritou canais nesta categoria.' : 'Tente buscar por outro nome.'}</span></div>}

          {hasMore && !query && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="live-load-more">{loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}{loadingMore ? 'Carregando...' : 'Mostrar mais canais'}</button>}
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
