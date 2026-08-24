import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Film, Heart, Loader2, Play, Star } from 'lucide-react';
import type { Channel } from '@/types';
import { ChannelCard } from '@/components/shared/ChannelCard';
import { getChannels } from '@/lib/playlistStore';
import { loadContentInfo, type ContentInfo } from '@/lib/provider';

interface MoviesViewProps { channels: Channel[]; groups: string[]; favorites: Set<string>; onSelectChannel: (ch: Channel) => void; onToggleFavorite: (id: string) => void; }
const PAGE_SIZE = 60;

export function MoviesView({ groups, favorites, onSelectChannel, onToggleFavorite }: MoviesViewProps) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [movies, setMovies] = useState<Channel[]>([]);
  const [featured, setFeatured] = useState<Channel | null>(null);
  const [featuredInfo, setFeaturedInfo] = useState<ContentInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const selectMovie = useCallback((movie: Channel) => {
    setFeatured(movie); setFeaturedInfo(null);
    void loadContentInfo(movie).then(setFeaturedInfo);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const loadGroup = useCallback(async (group: string) => {
    setActiveGroup(group); setLoading(true); setFeatured(null); setFeaturedInfo(null);
    try { const result = await getChannels('movies', PAGE_SIZE, 0, group); setMovies(result); setOffset(result.length); setHasMore(result.length === PAGE_SIZE); if (result[0]) selectMovie(result[0]); }
    catch { setMovies([]); setOffset(0); setHasMore(false); }
    finally { setLoading(false); }
  }, [selectMovie]);

  useEffect(() => { if (groups[0]) void loadGroup(groups[0]); }, [groups, loadGroup]);

  const loadMore = async () => {
    if (!activeGroup || loading) return; setLoading(true);
    try { const result = await getChannels('movies', PAGE_SIZE, offset, activeGroup); setMovies((current) => [...current, ...result]); setOffset((value) => value + result.length); setHasMore(result.length === PAGE_SIZE); } finally { setLoading(false); }
  };
  const rating = featuredInfo?.rating && Number(featuredInfo.rating.replace(',', '.')) > 0 ? featuredInfo.rating : null;
  const heroImage = featuredInfo?.backdrop || featuredInfo?.cover || featured?.logo;

  return <div className="-mx-5 sm:-mx-8 lg:-mx-10 lg:-mt-8">
    <div className="sticky top-0 z-30 border-b border-white/[0.05] bg-[#091018]/92 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10"><div className="mb-3 flex items-center gap-2"><Film className="h-4 w-4 text-emerald-400" /><h1 className="text-sm font-semibold text-white">Filmes</h1></div><div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">{groups.map((group) => <button key={group} onClick={() => void loadGroup(group)} className={`shrink-0 rounded-full px-4 py-2 text-xs transition ${activeGroup === group ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.055] text-white/55 hover:bg-white/10 hover:text-white'}`}>{group}</button>)}</div></div>
    {featured && <section className="relative min-h-[68vh] overflow-hidden bg-[#0a1117]">{heroImage && <img src={heroImage} alt="" className={`absolute inset-0 h-full w-full ${featuredInfo?.backdrop ? 'object-cover' : 'scale-110 object-cover opacity-50 blur-2xl'}`} />}<div className="absolute inset-0 bg-[linear-gradient(90deg,#091018_0%,rgba(9,16,24,.84)_38%,rgba(9,16,24,.12)_75%),linear-gradient(0deg,#091018_0%,transparent_55%)]" /><div className="relative z-10 flex min-h-[68vh] max-w-2xl flex-col justify-end px-5 pb-20 pt-20 sm:px-8 lg:px-12"><span className="mb-3 text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-400">{activeGroup}</span>{featuredInfo?.titleLogo ? <img src={featuredInfo.titleLogo} alt={featured.name} className="mb-3 max-h-28 max-w-sm object-contain object-left" /> : <h2 className="text-4xl font-semibold leading-none tracking-tight text-white lg:text-6xl">{featuredInfo?.name || featured.name}</h2>}<div className="mt-4 flex flex-wrap gap-3 text-xs text-white/55">{rating && <span className="flex items-center gap-1 text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />{rating}</span>}{featuredInfo?.releaseDate && <span>{featuredInfo.releaseDate.match(/\d{4}/)?.[0]}</span>}{featuredInfo?.duration && !/^0/.test(featuredInfo.duration) && <span>{featuredInfo.duration}</span>}{featuredInfo?.genre && <span>{featuredInfo.genre}</span>}</div>{featuredInfo?.plot && <p className="mt-4 line-clamp-3 text-sm leading-6 text-white/55">{featuredInfo.plot}</p>}<div className="mt-6 flex gap-3"><button onClick={() => onSelectChannel(featured)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950"><Play className="h-4 w-4 fill-current" />Reproduzir</button><button onClick={() => onToggleFavorite(featured.id)} className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm text-white backdrop-blur"><Heart className={`h-4 w-4 ${favorites.has(featured.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} />Favoritos</button></div></div></section>}
    <section className="relative z-20 px-5 pb-16 sm:px-8 lg:px-12">{loading && !movies.length ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div> : <><div className="mb-5 flex items-center gap-2"><h2 className="text-lg font-semibold text-white">{activeGroup || 'Escolha uma categoria'}</h2><ChevronRight className="h-4 w-4 text-white/20" /></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">{movies.map((movie) => <ChannelCard key={movie.id} channel={movie} isFavorite={favorites.has(movie.id)} onSelect={selectMovie} onToggleFavorite={onToggleFavorite} />)}</div>{hasMore && <div className="mt-8 text-center"><button onClick={() => void loadMore()} disabled={loading} className="rounded-xl bg-white/[0.06] px-6 py-3 text-sm text-white/65 hover:bg-white/10">{loading ? 'Carregando...' : 'Carregar mais'}</button></div>}</>}</section>
  </div>;
}
