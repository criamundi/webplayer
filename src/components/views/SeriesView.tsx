import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clapperboard, Heart, Loader2, Play, Tv } from 'lucide-react';
import type { Channel } from '@/types';
import { getChannels } from '@/lib/playlistStore';
import { storage } from '@/lib/storage';

interface SeriesViewProps { channels: Channel[]; groups: string[]; favorites: Set<string>; onSelectChannel: (ch: Channel) => void; onToggleFavorite: (id: string) => void; }
interface Episode { channel: Channel; season: number; episode: number; title: string; }
interface Show { key: string; name: string; cover?: string; episodes: Episode[]; }

function episodeData(channel: Channel, fallback: number): Episode & { showName: string } {
  const name = channel.name.trim();
  const patterns = [/(.*?)[\s._-]+S(\d{1,2})\s*E(\d{1,3})(?:[\s._-]+(.*))?$/i, /(.*?)[\s._-]+T(\d{1,2})\s*E(\d{1,3})(?:[\s._-]+(.*))?$/i, /(.*?)[\s._-]+(\d{1,2})x(\d{1,3})(?:[\s._-]+(.*))?$/i, /(.*?)\s+Temporada\s*(\d+).*?Epis[oó]dio\s*(\d+)(?:\s*[-–]\s*(.*))?$/i];
  for (const pattern of patterns) { const match = name.match(pattern); if (match) return { channel, showName: match[1].replace(/[._]+/g, ' ').trim(), season: Number(match[2]), episode: Number(match[3]), title: match[4]?.replace(/[._]+/g, ' ').trim() || `Episódio ${Number(match[3])}` }; }
  return { channel, showName: name.replace(/\s*[-–]\s*(?:ep(?:is[oó]dio)?\s*)?\d+\s*$/i, '').trim(), season: 1, episode: fallback + 1, title: `Episódio ${fallback + 1}` };
}

function makeShows(items: Channel[]): Show[] {
  const map = new Map<string, Show>();
  items.forEach((channel, index) => { const parsed = episodeData(channel, index); const key = parsed.showName.toLocaleLowerCase('pt-BR'); const show = map.get(key) || { key, name: parsed.showName, cover: channel.logo, episodes: [] }; show.cover ||= channel.logo; show.episodes.push(parsed); map.set(key, show); });
  return [...map.values()].map((show) => ({ ...show, episodes: show.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode) }));
}

export function SeriesView({ groups, favorites, onSelectChannel, onToggleFavorite }: SeriesViewProps) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [shows, setShows] = useState<Show[]>([]);
  const [selected, setSelected] = useState<Show | null>(null);
  const [season, setSeason] = useState(1);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(() => storage.getWatchProgress());

  const selectShow = useCallback((show: Show) => { setSelected(show); setSeason(show.episodes[0]?.season || 1); setProgress(storage.getWatchProgress()); window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);
  const loadGroup = useCallback(async (group: string) => { setActiveGroup(group); setLoading(true); setSelected(null); try { const items = await getChannels('series', 1200, 0, group); const next = makeShows(items); setShows(next); if (next[0]) selectShow(next[0]); } catch { setShows([]); } finally { setLoading(false); } }, [selectShow]);
  useEffect(() => { if (groups[0]) void loadGroup(groups[0]); }, [groups, loadGroup]);
  const seasons = useMemo(() => selected ? [...new Set(selected.episodes.map((item) => item.season))] : [], [selected]);
  const episodes = selected?.episodes.filter((item) => item.season === season) || [];
  const firstEpisode = episodes[0] || selected?.episodes[0];

  return <div className="-mx-5 sm:-mx-8 lg:-mx-10 lg:-mt-8">
    <div className="sticky top-0 z-30 border-b border-white/[0.05] bg-[#091018]/92 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10"><div className="mb-3 flex items-center gap-2"><Clapperboard className="h-4 w-4 text-emerald-400" /><h1 className="text-sm font-semibold">Séries</h1></div><div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">{groups.map((group) => <button key={group} onClick={() => void loadGroup(group)} className={`shrink-0 rounded-full px-4 py-2 text-xs transition ${activeGroup === group ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.055] text-white/55 hover:bg-white/10 hover:text-white'}`}>{group}</button>)}</div></div>
    {selected && <section className="relative min-h-[62vh] overflow-hidden bg-[#0a1117]">{selected.cover && <img src={selected.cover} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-48 blur-2xl" />}<div className="absolute inset-0 bg-[linear-gradient(90deg,#091018_0%,rgba(9,16,24,.82)_48%,rgba(9,16,24,.22)_100%),linear-gradient(0deg,#091018_0%,transparent_60%)]" /><div className="relative z-10 flex min-h-[62vh] max-w-2xl flex-col justify-end px-5 pb-16 pt-20 sm:px-8 lg:px-12"><span className="mb-3 text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-400">{activeGroup}</span><h2 className="text-4xl font-semibold leading-none tracking-tight lg:text-6xl">{selected.name}</h2><p className="mt-4 text-sm text-white/45">{selected.episodes.length} episódios • {seasons.length} {seasons.length === 1 ? 'temporada' : 'temporadas'}</p><div className="mt-6 flex gap-3">{firstEpisode && <button onClick={() => onSelectChannel(firstEpisode.channel)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950"><Play className="h-4 w-4 fill-current" />Reproduzir</button>}<button onClick={() => firstEpisode && onToggleFavorite(firstEpisode.channel.id)} className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm backdrop-blur"><Heart className={`h-4 w-4 ${firstEpisode && favorites.has(firstEpisode.channel.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} />Favoritos</button></div></div></section>}
    <section className="px-5 pb-16 sm:px-8 lg:px-12">{selected && <><div className="mb-6 flex gap-2 overflow-x-auto scrollbar-none">{seasons.map((value) => <button key={value} onClick={() => setSeason(value)} className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-medium transition ${season === value ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.06] text-white/55 hover:bg-white/10'}`}>Temporada {value}</button>)}</div><h3 className="mb-4 text-lg font-semibold">Episódios</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{episodes.map((item) => { const watched = progress[item.channel.id]; const percent = watched ? Math.min(100, Math.round((watched.current / watched.duration) * 100)) : 0; return <button key={item.channel.id} onClick={() => onSelectChannel(item.channel)} className="group overflow-hidden rounded-2xl bg-white/[0.035] text-left transition hover:bg-white/[0.07]"><div className="flex min-h-28">{item.channel.logo ? <img src={item.channel.logo} alt="" className="w-40 shrink-0 object-cover" /> : <span className="flex w-40 shrink-0 items-center justify-center bg-white/[0.03]"><Tv className="h-7 w-7 text-white/15" /></span>}<span className="min-w-0 flex-1 p-4"><span className="block text-[10px] uppercase tracking-wider text-emerald-400/70">T{item.season} • E{item.episode}</span><strong className="mt-1 block line-clamp-2 text-sm text-white/80">{item.title}</strong>{percent > 0 && <span className="mt-4 block"><span className="mb-1 block text-[10px] text-white/35">{percent}% assistido</span><span className="block h-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-emerald-400" style={{ width: `${percent}%` }} /></span></span>}</span></div></button>; })}</div></>}
      {!selected && loading && <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div>}
      {shows.length > 0 && <><h3 className="mb-4 mt-12 text-lg font-semibold">Mais séries em {activeGroup}</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">{shows.map((show) => <button key={show.key} onClick={() => selectShow(show)} className="group text-left"><div className="aspect-[2/3] overflow-hidden rounded-2xl bg-white/[0.04]">{show.cover ? <img src={show.cover} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <span className="flex h-full items-center justify-center"><Tv className="h-8 w-8 text-white/15" /></span>}</div><p className="mt-2 truncate text-sm font-medium text-white/70">{show.name}</p></button>)}</div></>}
    </section>
  </div>;
}
