import { memo, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Heart, Loader2, Radio, Search, Tag, Tv } from 'lucide-react';
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

const PAGE_SIZE = 100;
const categoryInitial = (name: string) => name.replace(/^CANAIS\s*\|?\s*/i, '').trim().charAt(0).toUpperCase() || 'C';

function Logo({ channel, compact = false }: { channel: Channel; compact?: boolean }) {
  const [source, setSource] = useState(channel.logo);
  const [failed, setFailed] = useState(!channel.logo);
  useEffect(() => { setSource(channel.logo); setFailed(!channel.logo); }, [channel.logo]);
  if (!source || failed) return <Tv className={`${compact ? 'h-5 w-5' : 'h-8 w-8'} text-white/15`} />;
  return <img src={source} alt="" loading="lazy" onError={() => { const proxy = getPlayableStreamUrl(channel.logo || ''); if (source !== proxy) setSource(proxy); else setFailed(true); }} className={`${compact ? 'h-8 w-10' : 'max-h-16 max-w-[75%]'} object-contain`} />;
}

export const LiveView = memo(function LiveView({ groups, activeChannel, favorites, onSelectChannel, onToggleFavorite }: LiveViewProps) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [items, setItems] = useState<Channel[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const liveActive = activeChannel?.category === 'live' && Boolean(activeChannel.url) ? activeChannel : null;

  useEffect(() => {
    if (!activeGroup) { setItems([]); return; }
    let active = true;
    setLoading(true);
    void getChannels('live', PAGE_SIZE, 0, activeGroup).then((result) => {
      if (!active) return;
      setItems(result); setOffset(result.length); setHasMore(result.length === PAGE_SIZE);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activeGroup]);

  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase('pt-BR');
    return value ? items.filter((channel) => channel.name.toLocaleLowerCase('pt-BR').includes(value)) : items;
  }, [items, query]);

  const loadMore = async () => {
    if (!activeGroup || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await getChannels('live', PAGE_SIZE, offset, activeGroup);
      setItems((current) => [...current, ...result]);
      setOffset((current) => current + result.length);
      setHasMore(result.length === PAGE_SIZE);
    } finally { setLoadingMore(false); }
  };

  if (!activeGroup) {
    return <div className="-mx-5 -mt-6 min-h-screen bg-[#091018] p-5 sm:-mx-8 sm:p-8 lg:-mx-10 lg:-mt-8 lg:p-10">
      <div className="mb-7"><p className="text-[10px] uppercase tracking-[.18em] text-emerald-400">Ao vivo</p><h1 className="mt-1 text-3xl font-semibold">Escolha uma categoria</h1></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{groups.map((group) => <button key={group} onClick={() => setActiveGroup(group)} className="group flex min-h-24 items-center justify-between rounded-2xl bg-white/[0.045] px-5 text-left transition hover:bg-emerald-400/10"><span className="text-sm font-medium text-white/70 group-hover:text-white">{group}</span><span className="flex h-14 w-14 items-center justify-center rounded-xl bg-black/25 text-xl font-semibold text-emerald-300">{categoryInitial(group)}</span></button>)}</div>
    </div>;
  }

  return <div className="-mx-5 -mt-6 min-h-screen bg-[#091018] sm:-mx-8 lg:-mx-10 lg:-mt-8">
    <div className="grid min-h-screen grid-cols-[3.5rem_minmax(15rem,22rem)_minmax(0,1fr)]">
      <aside className="sticky top-0 h-screen overflow-y-auto border-r border-white/[0.04] bg-[#0b141b] p-2 scrollbar-none">
        <button onClick={() => { setActiveGroup(null); setQuery(''); }} title="Voltar às categorias" className="mb-3 flex h-11 w-full items-center justify-center rounded-xl bg-white/[0.05] text-white/55 hover:text-emerald-300"><Tag className="h-4 w-4" /></button>
        {groups.map((group) => <button key={group} title={group} onClick={() => setActiveGroup(group)} className={`mb-2 flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition ${activeGroup === group ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.035] text-white/45 hover:bg-white/[0.08]'}`}>{categoryInitial(group)}</button>)}
      </aside>

      <aside className="sticky top-0 flex h-screen min-w-0 flex-col border-r border-white/[0.04] bg-[#0d161d] p-3">
        <div className="mb-3 flex items-center gap-2"><button onClick={() => setActiveGroup(null)} className="rounded-lg p-2 text-white/45 hover:bg-white/[0.06]"><ArrowLeft className="h-4 w-4" /></button><span className="truncate text-sm font-semibold text-white">{activeGroup}</span></div>
        <div className="relative mb-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar canal" className="w-full rounded-xl bg-white/[0.05] py-3 pl-9 pr-3 text-sm outline-none placeholder:text-white/25" /></div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">{loading ? Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />) : filtered.map((channel, index) => <button key={channel.id} onClick={() => onSelectChannel(channel)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${liveActive?.id === channel.id ? 'bg-emerald-400/12 ring-1 ring-emerald-400/45' : 'bg-white/[0.035] hover:bg-white/[0.07]'}`}><span className="w-5 text-center text-xs text-white/25">{index + 1}</span><span className="flex h-10 w-12 shrink-0 items-center justify-center"><Logo channel={channel} compact /></span><span className="min-w-0 flex-1 truncate text-sm text-white/70">{channel.name}</span><span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onToggleFavorite(channel.id, channel); }} className="p-1 text-white/25 hover:text-emerald-300"><Heart className={`h-4 w-4 ${favorites.has(channel.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} /></span></button>)}{hasMore && <button onClick={() => void loadMore()} disabled={loadingMore} className="flex w-full items-center justify-center gap-2 py-4 text-xs text-white/35">{loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}Carregar mais canais</button>}</div>
      </aside>

      <main className="min-w-0 p-4 lg:p-6">
        <div className="mb-4"><p className="text-[10px] uppercase tracking-[.18em] text-emerald-400">Ao vivo</p><h1 className="mt-1 truncate text-2xl font-semibold">{liveActive?.name || activeGroup}</h1></div>
        <section className="overflow-hidden rounded-3xl bg-white/[0.035] p-3"><div className="aspect-video overflow-hidden rounded-2xl bg-black">{liveActive ? <VideoPlayer channel={liveActive} /> : <div className="flex h-full flex-col items-center justify-center text-center"><Radio className="mb-3 h-9 w-9 text-emerald-400/40" /><p className="text-sm text-white/55">Escolha um canal da lista</p></div>}</div>{liveActive && <div className="flex items-center gap-3 px-2 pb-1 pt-3"><span className="flex h-10 w-12 items-center justify-center"><Logo channel={liveActive} compact /></span><span><strong className="block text-sm">{liveActive.name}</strong><small className="text-white/35">{liveActive.group}</small></span></div>}</section>
      </main>
    </div>
  </div>;
});
