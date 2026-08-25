import { memo, useEffect, useMemo, useState } from 'react';
import { Heart, Loader2, Radio, Search, Tv } from 'lucide-react';
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
  onSelectChannel: (channel: Channel) => void;
  onToggleFavorite: (id: string, channel?: Channel) => void;
}

const ALL = '__all__';
const PAGE_SIZE = 80;

function ChannelLogo({ channel }: { channel: Channel }) {
  const [source, setSource] = useState(channel.logo);
  const [loading, setLoading] = useState(Boolean(channel.logo));
  const [failed, setFailed] = useState(!channel.logo);
  useEffect(() => { setSource(channel.logo); setLoading(Boolean(channel.logo)); setFailed(!channel.logo); }, [channel.logo]);
  if (failed || !source) return <Tv className="h-9 w-9 text-white/15" />;
  return <>{loading && <Loader2 className="absolute h-5 w-5 animate-spin text-emerald-400/60" />}<img src={source} alt={channel.name} loading="lazy" decoding="async" onLoad={() => setLoading(false)} onError={() => { const proxied = getPlayableStreamUrl(channel.logo || ''); if (source !== proxied) setSource(proxied); else { setLoading(false); setFailed(true); } }} className={`max-h-20 max-w-[80%] object-contain transition ${loading ? 'opacity-0' : 'opacity-100'}`} /></>;
}

export const LiveView = memo(function LiveView({ groups, activeChannel, favorites, onSelectChannel, onToggleFavorite }: LiveViewProps) {
  const [activeGroup, setActiveGroup] = useState(ALL);
  const [items, setItems] = useState<Channel[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      const group = activeGroup === ALL ? undefined : activeGroup;
      const result = await getChannels('live', PAGE_SIZE, 0, group);
      if (!active) return;
      setItems(result);
      setOffset(result.length);
      setHasMore(result.length === PAGE_SIZE);
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    })();
    return () => { active = false; };
  }, [activeGroup]);

  useEffect(() => {
    if (!hasMore || loadingMore) return;
    const loadMore = () => {
      if (window.innerHeight + window.scrollY < document.documentElement.scrollHeight - 900) return;
      setLoadingMore(true);
      const group = activeGroup === ALL ? undefined : activeGroup;
      void getChannels('live', PAGE_SIZE, offset, group).then((result) => {
        setItems((current) => [...current, ...result]);
        setOffset((current) => current + result.length);
        setHasMore(result.length === PAGE_SIZE);
      }).finally(() => setLoadingMore(false));
    };
    window.addEventListener('scroll', loadMore, { passive: true });
    loadMore();
    return () => window.removeEventListener('scroll', loadMore);
  }, [activeGroup, hasMore, loadingMore, offset]);

  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase('pt-BR');
    return value ? items.filter((channel) => channel.name.toLocaleLowerCase('pt-BR').includes(value)) : items;
  }, [items, query]);

  return <div data-live-catalog className="-mx-5 -mt-6 min-h-screen bg-[#091018] sm:-mx-8 lg:-mx-10 lg:-mt-8">
    <div className="grid min-h-screen lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 z-40 border-b border-white/[0.05] bg-[#0b141b]/95 p-4 backdrop-blur-xl lg:fixed lg:bottom-0 lg:left-20 lg:top-0 lg:w-[17rem] lg:border-b-0 lg:border-r lg:p-5">
        <div className="relative mb-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar canal" className="w-full rounded-xl bg-white/[0.055] py-3 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30" /></div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none lg:h-[calc(100vh-6rem)] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:pr-1">
          <button onClick={() => setActiveGroup(ALL)} className={`shrink-0 rounded-xl px-4 py-3 text-left text-sm transition ${activeGroup === ALL ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.035] text-white/55 hover:bg-white/[0.07]'}`}>Todos os canais</button>
          {groups.map((group) => <button key={group} onClick={() => setActiveGroup(group)} className={`shrink-0 rounded-xl px-4 py-3 text-left text-sm transition ${activeGroup === group ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.035] text-white/55 hover:bg-white/[0.07]'}`}>{group}</button>)}
        </div>
      </aside>

      <main className="min-w-0 p-5 sm:p-7 lg:col-start-2 lg:p-8">
        <div className="mb-6 flex items-end justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-emerald-400">Ao vivo</p><h1 className="mt-1 text-2xl font-semibold">{activeGroup === ALL ? 'Todos os canais' : activeGroup}</h1></div><span className="text-xs text-white/30">{filtered.length} carregados</span></div>

        {activeChannel && <section className="mb-8 overflow-hidden rounded-3xl bg-white/[0.035] p-3"><div className="aspect-video max-h-[68vh] overflow-hidden rounded-2xl bg-black"><VideoPlayer channel={activeChannel} /></div><div className="flex items-center gap-3 px-2 pb-1 pt-3">{activeChannel.logo ? <img src={activeChannel.logo} alt="" className="h-10 w-10 rounded-lg object-contain" /> : <Radio className="h-5 w-5 text-emerald-400" />}<span><strong className="block text-sm text-white">{activeChannel.name}</strong><small className="text-white/35">{activeChannel.group || 'Canal ao vivo'}</small></span></div></section>}

        {loading ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-video animate-pulse rounded-2xl bg-white/[0.045]" />)}</div> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{filtered.map((channel) => <button key={channel.id} onClick={() => onSelectChannel(channel)} className="group min-w-0 text-left"><div className={`relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-white/[0.04] transition hover:bg-white/[0.07] ${activeChannel?.id === channel.id ? 'ring-2 ring-emerald-400/70' : ''}`}><ChannelLogo channel={channel} /><span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[9px] uppercase tracking-wider text-emerald-300 backdrop-blur"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Ao vivo</span><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onToggleFavorite(channel.id, channel); }} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/55 backdrop-blur transition hover:text-emerald-300"><Heart className={`h-4 w-4 ${favorites.has(channel.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} /></span><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8"><p className="truncate text-sm font-semibold text-white">{channel.name}</p></div></div></button>)}</div>}
        {loadingMore && <div className="flex items-center justify-center gap-2 py-10 text-sm text-white/35"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" />Carregando mais canais</div>}
        {!loading && !filtered.length && <div className="py-20 text-center text-sm text-white/35">Nenhum canal encontrado.</div>}
      </main>
    </div>
  </div>;
});
