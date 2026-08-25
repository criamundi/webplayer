import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Heart, Loader2, Play, Search, Star, Tv } from 'lucide-react';
import type { Channel } from '@/types';
import { loadContentInfo, loadMovieCatalog, type ContentInfo, type MovieCategory, type MovieShow } from '@/lib/provider';
import { getChannels } from '@/lib/playlistStore';
import { getPlayableStreamUrl } from '@/lib/streamProxy';
import { TrailerPlayer } from '@/components/TrailerPlayer';

interface MoviesViewProps {
  channels: Channel[];
  groups: string[];
  favorites: Set<string>;
  onSelectChannel: (channel: Channel) => void;
  onToggleFavorite: (id: string, channel?: Channel) => void;
}

const LATEST = 'recent';
const PAGE_SIZE = 40;

function MovieCover({ movie }: { movie: MovieShow }) {
  const [loading, setLoading] = useState(Boolean(movie.logo));
  const [failed, setFailed] = useState(false);
  const [source, setSource] = useState(movie.logo);
  useEffect(() => { setLoading(Boolean(movie.logo)); setFailed(false); setSource(movie.logo); }, [movie.logo]);
  return <>
    {loading && <span className="absolute inset-0 z-10 flex items-center justify-center bg-[#111a20]"><Loader2 className="h-6 w-6 animate-spin text-emerald-400/70" /></span>}
    {source && !failed ? <img src={source} alt={movie.name} loading="lazy" decoding="async" onLoad={() => setLoading(false)} onError={() => { const proxied = getPlayableStreamUrl(movie.logo || ''); if (source !== proxied) setSource(proxied); else { setLoading(false); setFailed(true); } }} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <span className="flex h-full items-center justify-center"><Tv className="h-9 w-9 text-white/15" /></span>}
  </>;
}

export function MoviesView({ groups, favorites, onSelectChannel, onToggleFavorite }: MoviesViewProps) {
  const [categories, setCategories] = useState<MovieCategory[]>([]);
  const [movies, setMovies] = useState<MovieShow[]>([]);
  const [activeCategory, setActiveCategory] = useState(LATEST);
  const [selected, setSelected] = useState<MovieShow | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<ContentInfo | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [localMode, setLocalMode] = useState(false);
  const [localOffset, setLocalOffset] = useState(0);
  const [localHasMore, setLocalHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLocalMode(true);
      setCategories(groups.map((name) => ({ id: name, name })));
      const initial = await getChannels('movies', 10, 0);
      if (!active) return;
      setMovies(initial as MovieShow[]);
      setLocalOffset(initial.length);
      setLocalHasMore(false);
      setLoading(false);
      try {
        const catalog = await loadMovieCatalog();
        if (!active) return;
        if (catalog?.movies.length) {
          setLocalMode(false);
          setActiveCategory(LATEST);
          setCategories(catalog.categories);
          setMovies(catalog.movies);
        }
      } catch { /* usa a lista local abaixo */ }
    })();
    return () => { active = false; };
  }, [groups]);

  useEffect(() => {
    if (!localMode) return;
    let active = true;
    void (async () => {
      setLoading(true);
      const group = activeCategory === LATEST ? undefined : activeCategory;
      const limit = activeCategory === LATEST ? 10 : PAGE_SIZE;
      const result = await getChannels('movies', limit, 0, group);
      if (!active) return;
      setMovies(result as MovieShow[]);
      setLocalOffset(result.length);
      setLocalHasMore(activeCategory !== LATEST && result.length === PAGE_SIZE);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [activeCategory, localMode]);

  const categoryMovies = useMemo(() => {
    const base = activeCategory === LATEST
      ? [...movies].sort((a, b) => Number(b.added || 0) - Number(a.added || 0)).slice(0, 10)
      : localMode ? movies : movies.filter((movie) => movie.categoryId === activeCategory);
    const value = query.trim().toLocaleLowerCase('pt-BR');
    return value ? base.filter((movie) => movie.name.toLocaleLowerCase('pt-BR').includes(value)) : base;
  }, [activeCategory, localMode, movies, query]);

  const visibleMovies = categoryMovies.slice(0, visibleCount);

  useEffect(() => { setVisibleCount(PAGE_SIZE); window.scrollTo({ top: 0, behavior: 'smooth' }); }, [activeCategory, query]);

  useEffect(() => {
    if (selected || (visibleCount >= categoryMovies.length && !(localMode && localHasMore && activeCategory !== LATEST))) return;
    const loadMore = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 900) {
        if (visibleCount < categoryMovies.length) {
          setVisibleCount((current) => Math.min(current + PAGE_SIZE, categoryMovies.length));
        } else if (localMode && localHasMore && !loadingMore && activeCategory !== LATEST) {
          setLoadingMore(true);
          void getChannels('movies', PAGE_SIZE, localOffset, activeCategory).then((result) => {
            setMovies((current) => [...current, ...(result as MovieShow[])]);
            setLocalOffset((current) => current + result.length);
            setLocalHasMore(result.length === PAGE_SIZE);
            setVisibleCount((current) => current + result.length);
          }).finally(() => setLoadingMore(false));
        }
      }
    };
    window.addEventListener('scroll', loadMore, { passive: true });
    loadMore();
    return () => window.removeEventListener('scroll', loadMore);
  }, [activeCategory, categoryMovies.length, loadingMore, localHasMore, localMode, localOffset, selected, visibleCount]);

  const selectMovie = useCallback(async (movie: MovieShow) => {
    setSelected(movie);
    setSelectedInfo(null);
    setDetailLoading(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try { setSelectedInfo(await loadContentInfo(movie)); }
    finally { setDetailLoading(false); }
  }, []);

  if (!selected) {
    return <div data-movie-catalog className="-mx-5 -mt-6 min-h-screen bg-[#091018] sm:-mx-8 lg:-mx-10 lg:-mt-8">
      <div className="grid min-h-screen lg:grid-cols-[17rem_1fr]">
        <aside className="sticky top-0 z-40 border-b border-white/[0.05] bg-[#0b141b]/95 p-4 backdrop-blur-xl lg:fixed lg:bottom-0 lg:left-20 lg:top-0 lg:w-[17rem] lg:border-b-0 lg:border-r lg:p-5">
          <div className="relative mb-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar" className="w-full rounded-xl bg-white/[0.055] py-3 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30" /></div>
          <div className="flex gap-2 overflow-x-auto scrollbar-none lg:h-[calc(100vh-6rem)] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:pr-1">
            <button onClick={() => setActiveCategory(LATEST)} className={`shrink-0 rounded-xl px-4 py-3 text-left text-sm transition ${activeCategory === LATEST ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.035] text-white/55 hover:bg-white/[0.07]'}`}>Últimos adicionados</button>
            {categories.map((category) => <button key={category.id} onClick={() => setActiveCategory(category.id)} className={`shrink-0 rounded-xl px-4 py-3 text-left text-sm transition ${activeCategory === category.id ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.035] text-white/55 hover:bg-white/[0.07]'}`}>{category.name}</button>)}
          </div>
        </aside>

        <main className="min-w-0 p-5 sm:p-7 lg:col-start-2 lg:p-8">
          <div className="mb-6 flex items-end justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-emerald-400">Filmes</p><h1 className="mt-1 text-2xl font-semibold">{activeCategory === LATEST ? 'Últimos adicionados' : categories.find((item) => item.id === activeCategory)?.name}</h1></div><span className="text-xs text-white/30">{categoryMovies.length} títulos</span></div>
          {loading ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-[2/3] animate-pulse rounded-2xl bg-white/[0.045]" />)}</div> : <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{visibleMovies.map((movie) => <button key={movie.id} onClick={() => void selectMovie(movie)} className="group text-left"><div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-white/[0.04]"><MovieCover movie={movie} />{Number(movie.rating) > 0 && <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/75 px-2 py-1 text-[10px] font-semibold text-amber-300 backdrop-blur"><Star className="h-3 w-3 fill-current" />{movie.rating}</span>}</div><p className="mt-2 truncate text-sm font-medium text-white/75">{movie.name}</p></button>)}</div>
            {visibleMovies.length < categoryMovies.length && <div className="flex items-center justify-center gap-2 py-10 text-sm text-white/35"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" />Carregando mais filmes</div>}
            {!categoryMovies.length && <div className="py-20 text-center text-sm text-white/35">Nenhum filme encontrado nesta categoria.</div>}
          </>}
        </main>
      </div>
    </div>;
  }

  const heroImage = selectedInfo?.backdrop || selected.backdrop || selectedInfo?.cover || selected.logo;
  const rating = selectedInfo?.rating || selected.rating;
  const duration = selectedInfo?.duration && !/^(?:0+:)+0+$/.test(selectedInfo.duration) ? selectedInfo.duration : undefined;
  const trailerSource = selectedInfo?.trailerKey;
  const similarMovies = movies.filter((movie) => movie.id !== selected.id && movie.categoryId === selected.categoryId).slice(0, 10);

  return <div className="-mx-5 sm:-mx-8 lg:-mx-10 lg:-mt-8">
    <section className="relative min-h-screen overflow-hidden bg-[#0a1117]">
      {heroImage && <img src={heroImage} alt="" className={`absolute inset-0 h-full w-full ${selectedInfo?.backdrop || selected.backdrop ? 'object-cover' : 'scale-110 object-cover opacity-48 blur-2xl'}`} />}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#091018_0%,rgba(9,16,24,.84)_45%,rgba(9,16,24,.12)_100%),linear-gradient(0deg,#091018_0%,transparent_65%)]" />
      <button onClick={() => setSelected(null)} className="absolute left-5 top-6 z-20 flex items-center gap-2 rounded-xl bg-black/35 px-3 py-2 text-xs text-white/70 backdrop-blur-lg sm:left-8 lg:left-12"><ArrowLeft className="h-4 w-4" />Voltar para capas</button>
      <div className="relative z-10 flex min-h-screen max-w-2xl flex-col justify-end px-5 pb-16 pt-24 sm:px-8 lg:px-12">
        <span className="mb-3 text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-400">{categories.find((item) => item.id === selected.categoryId)?.name || 'Filme'}</span>
        {selectedInfo?.titleLogo ? <img src={selectedInfo.titleLogo} alt={selected.name} className="mb-3 max-h-28 max-w-sm object-contain object-left" /> : <h1 className="text-4xl font-semibold leading-none tracking-tight lg:text-6xl">{selectedInfo?.name || selected.name}</h1>}
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/55">{rating && Number(rating) > 0 && <span className="flex items-center gap-1 text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />{rating}</span>}{selectedInfo?.releaseDate && <span>{selectedInfo.releaseDate.match(/\d{4}/)?.[0]}</span>}{duration && <span>{duration}</span>}{selectedInfo?.genre && <span>{selectedInfo.genre}</span>}</div>
        {detailLoading ? <Loader2 className="mt-5 h-6 w-6 animate-spin text-emerald-400" /> : selectedInfo?.plot && <p className="mt-4 line-clamp-3 text-sm leading-6 text-white/55">{selectedInfo.plot}</p>}
        {selectedInfo?.cast && <p className="mt-3 line-clamp-2 text-xs leading-5 text-white/40"><span className="font-medium text-white/65">Elenco:</span> {selectedInfo.cast}</p>}
        <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => onSelectChannel(selected)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950"><Play className="h-4 w-4 fill-current" />Reproduzir</button>{trailerSource && <button type="button" onClick={() => setTrailerOpen(true)} className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm text-white backdrop-blur"><Play className="h-4 w-4" />Trailer</button>}<button onClick={() => onToggleFavorite(selected.id, selected)} className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm text-white backdrop-blur"><Heart className={`h-4 w-4 ${favorites.has(selected.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} />Favoritos</button></div>
      </div>
    </section>
    {similarMovies.length > 0 && <section className="bg-[#091018] px-5 pb-16 pt-8 sm:px-8 lg:px-12"><h2 className="mb-4 text-lg font-semibold">Filmes semelhantes</h2><div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none">{similarMovies.map((movie) => <button key={movie.id} onClick={() => void selectMovie(movie)} className="group w-40 shrink-0 text-left"><div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-white/[0.04]"><MovieCover movie={movie} />{Number(movie.rating) > 0 && <span className="absolute right-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[10px] text-amber-300">★ {movie.rating}</span>}</div><p className="mt-2 truncate text-sm text-white/65">{movie.name}</p></button>)}</div></section>}
    {trailerOpen && trailerSource && <TrailerPlayer source={trailerSource} title={selected.name} onClose={() => setTrailerOpen(false)} />}
  </div>;
}
