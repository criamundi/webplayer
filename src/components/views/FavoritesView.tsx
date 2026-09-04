import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Heart, Loader2, Play, Search, Star, Tv } from 'lucide-react';
import type { Channel } from '@/types';
import type { View } from '@/components/layout/Sidebar';
import { loadContentInfo, type ContentInfo } from '@/lib/provider';
import { getPlayableStreamUrl } from '@/lib/streamProxy';

type FavoriteItem = Channel & { rating?: string; backdrop?: string; plot?: string; genre?: string; contentType?: 'movie' | 'series' };
interface FavoritesViewProps { favorites: Set<string>; onSelectChannel: (channel: Channel) => void; onToggleFavorite: (id: string, channel?: Channel) => void; loadFavorites: () => Promise<Channel[]>; onNavigate: (view: View) => void; }

function FavoriteCover({ item }: { item: FavoriteItem }) {
  const [source, setSource] = useState(item.logo);
  const [failed, setFailed] = useState(!item.logo);
  useEffect(() => { setSource(item.logo); setFailed(!item.logo); }, [item.logo]);
  return source && !failed ? <img src={source} alt={item.name} loading="lazy" onError={() => { const proxy = getPlayableStreamUrl(item.logo || ''); if (source !== proxy) setSource(proxy); else setFailed(true); }} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center"><Tv className="h-9 w-9 text-white/15" /></span>;
}

export function FavoritesView({ favorites, onSelectChannel, onToggleFavorite, loadFavorites, onNavigate }: FavoritesViewProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [selected, setSelected] = useState<FavoriteItem | null>(null);
  const [info, setInfo] = useState<ContentInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);

  useEffect(() => { let active = true; void loadFavorites().then((result) => { if (active) setItems(result as FavoriteItem[]); }); return () => { active = false; }; }, [favorites, loadFavorites]);
  const filtered = useMemo(() => { const value = query.trim().toLocaleLowerCase('pt-BR'); return value ? items.filter((item) => item.name.toLocaleLowerCase('pt-BR').includes(value)) : items; }, [items, query]);

  const openFavorite = async (item: FavoriteItem) => {
    if (!item.id.startsWith('movie:') && !item.id.startsWith('series:')) { onSelectChannel(item); onNavigate('live'); return; }
    setSelected(item); setInfo(item.id.startsWith('series:') ? { name: item.name, plot: item.plot, genre: item.genre, rating: item.rating, backdrop: item.backdrop, cover: item.logo } : null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (item.id.startsWith('movie:')) { setLoadingInfo(true); try { setInfo(await loadContentInfo(item)); } finally { setLoadingInfo(false); } }
  };

  if (selected) {
    const hero = info?.backdrop || selected.backdrop || info?.cover || selected.logo;
    const rating = info?.rating || selected.rating;
    return <div className="-mx-5 sm:-mx-8 lg:-mx-10 lg:-mt-8"><section className="relative min-h-screen overflow-hidden bg-[#0a1117]">{hero && <img src={hero} alt="" className={`absolute inset-0 h-full w-full ${info?.backdrop || selected.backdrop ? 'object-cover' : 'scale-110 object-cover opacity-48 blur-2xl'}`} />}<div className="absolute inset-0 bg-[linear-gradient(90deg,#091018_0%,rgba(9,16,24,.84)_48%,rgba(9,16,24,.12)_100%),linear-gradient(0deg,#091018_0%,transparent_65%)]" /><button onClick={() => setSelected(null)} className="absolute left-5 top-6 z-20 flex items-center gap-2 rounded-xl bg-black/35 px-3 py-2 text-xs text-white/70 backdrop-blur sm:left-8 lg:left-12"><ArrowLeft className="h-4 w-4" />Voltar aos favoritos</button><div className="relative z-10 flex min-h-screen max-w-2xl flex-col justify-end px-5 pb-16 pt-24 sm:px-8 lg:px-12"><span className="mb-3 text-[10px] uppercase tracking-[.05em] text-emerald-400">Favorito</span><h1 className="text-4xl font-semibold leading-none lg:text-6xl">{info?.name || selected.name}</h1><div className="mt-4 flex gap-3 text-xs text-white/55">{rating && Number(rating) > 0 && <span className="flex items-center gap-1 text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />{rating}</span>}{info?.genre && <span>{info.genre}</span>}</div>{loadingInfo ? <Loader2 className="mt-5 h-6 w-6 animate-spin text-emerald-400" /> : info?.plot && <p className="mt-4 line-clamp-3 text-sm leading-6 text-white/55">{info.plot}</p>}<div className="mt-6 flex gap-3">{selected.id.startsWith('movie:') ? <button onClick={() => onSelectChannel(selected)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950"><Play className="h-4 w-4 fill-current" />Reproduzir</button> : <button onClick={() => onNavigate('series')} className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950">Ver episódios</button>}<button onClick={() => { onToggleFavorite(selected.id, selected); setSelected(null); }} className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm"><Heart className="h-4 w-4 fill-emerald-400 text-emerald-400" />Remover favorito</button></div></div></section></div>;
  }

  return <div className="mt-6"><div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-400/12 p-2.5 text-emerald-300"><Heart className="h-5 w-5 fill-current" /></div><div><h1 className="text-2xl font-semibold">Favoritos</h1><p className="text-xs text-white/40">{favorites.size} itens marcados</p></div></div>{favorites.size > 0 && <div className="relative max-w-xs flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nos favoritos" className="w-full rounded-xl bg-white/5 py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-white/30" /></div>}</div>{favorites.size === 0 ? <div className="flex flex-col items-center py-20 text-center"><Heart className="mb-4 h-12 w-12 text-white/15" /><p className="text-sm text-white/50">Nenhum favorito ainda</p></div> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">{filtered.map((item) => <button key={item.id} onClick={() => void openFavorite(item)} className="group text-left"><div className={`relative overflow-hidden rounded-2xl bg-white/[0.04] ${item.id.startsWith('movie:') || item.id.startsWith('series:') ? 'aspect-[2/3]' : 'aspect-video'}`}><FavoriteCover item={item} />{Number(item.rating) > 0 && <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/75 px-2 py-1 text-[10px] text-amber-300"><Star className="h-3 w-3 fill-current" />{item.rating}</span>}<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-10"><p className="truncate text-sm font-semibold">{item.name}</p></div></div></button>)}</div>}</div>;
}
