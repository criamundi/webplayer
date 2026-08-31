import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Heart, Loader2, Play, Search, Star } from 'lucide-react';
import type { Channel } from '@/types';
import { loadContentInfo, loadMovieCatalog, type ContentInfo, type MovieCategory, type MovieShow } from '@/lib/provider';
import { getChannels } from '@/lib/playlistStore';
import { storage } from '@/lib/storage';
import { TrailerPlayer } from '@/components/TrailerPlayer';
import {
  MediaArrowRow,
  MediaBackdrop,
  MediaCastPortrait,
  MediaCover,
  MediaHeroTitle,
  MediaRatingBadge,
  MediaSynopsis,
} from '@/components/media/MediaDetailsUI';
import { formatMediaDate, mediaCastList, mediaDuration, mediaRating } from '@/components/media/mediaUtils';

interface MoviesViewProps {
  channels: Channel[];
  groups: string[];
  favorites: Set<string>;
  onSelectChannel: (channel: Channel) => void;
  onToggleFavorite: (id: string, channel?: Channel) => void;
}

const LATEST = 'recent';
const PAGE_SIZE = 40;

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
  const detailRequestRef = useRef(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      setLocalMode(true);
      setCategories(groups.map((name) => ({ id: name, name })));
      const initial = await getChannels('movies', PAGE_SIZE, 0);
      if (!active) return;
      setMovies(initial as MovieShow[]);
      setLocalOffset(initial.length);
      setLocalHasMore(false);
      setLoading(false);

      try {
        const catalog = await loadMovieCatalog();
        if (!active || !catalog?.movies.length) return;
        setLocalMode(false);
        setActiveCategory(LATEST);
        setCategories(catalog.categories);
        setMovies(catalog.movies);
      } catch { /* mantém o catálogo local */ }
    })();
    return () => { active = false; };
  }, [groups]);

  useEffect(() => {
    if (!localMode) return;
    let active = true;
    void (async () => {
      setLoading(true);
      const group = activeCategory === LATEST ? undefined : activeCategory;
      const result = await getChannels('movies', PAGE_SIZE, 0, group);
      if (!active) return;
      setMovies(result as MovieShow[]);
      setLocalOffset(result.length);
      setLocalHasMore(activeCategory !== LATEST && result.length === PAGE_SIZE);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [activeCategory, localMode]);

  useEffect(() => {
    if (selected && favorites.has(selected.id)) storage.saveFavoriteItem(selected);
  }, [favorites, selected]);

  const categoryMovies = useMemo(() => {
    const base = activeCategory === LATEST
      ? [...movies].sort((a, b) => Number(b.added || 0) - Number(a.added || 0)).slice(0, PAGE_SIZE)
      : localMode ? movies : movies.filter((movie) => movie.categoryId === activeCategory);
    const value = query.trim().toLocaleLowerCase('pt-BR');
    return value ? base.filter((movie) => movie.name.toLocaleLowerCase('pt-BR').includes(value)) : base;
  }, [activeCategory, localMode, movies, query]);

  const visibleMovies = categoryMovies.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeCategory, query]);

  useEffect(() => {
    if (selected || (visibleCount >= categoryMovies.length && !(localMode && localHasMore && activeCategory !== LATEST))) return;
    const loadMore = () => {
      if (window.innerHeight + window.scrollY < document.documentElement.scrollHeight - 900) return;
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
    };
    window.addEventListener('scroll', loadMore, { passive: true });
    loadMore();
    return () => window.removeEventListener('scroll', loadMore);
  }, [activeCategory, categoryMovies.length, loadingMore, localHasMore, localMode, localOffset, selected, visibleCount]);

  const selectMovie = useCallback(async (movie: MovieShow) => {
    const requestId = ++detailRequestRef.current;
    setSelected(movie);
    setSelectedInfo(null);
    setTrailerOpen(false);
    setDetailLoading(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const info = await loadContentInfo(movie);
      if (requestId === detailRequestRef.current) setSelectedInfo(info);
    } catch { /* mantém o Hero com os dados do catálogo */
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  const closeDetails = () => {
    detailRequestRef.current += 1;
    setDetailLoading(false);
    setTrailerOpen(false);
    setSelected(null);
  };

  if (!selected) return <div data-movie-catalog className="-mx-5 -mt-6 min-h-screen bg-[#091018] sm:-mx-8 lg:-mx-10 lg:-mt-8">
    <div className="grid min-h-screen lg:grid-cols-[17rem_1fr]">
      <aside className="border-b border-white/[0.035] bg-[#0b141b] p-4 lg:sticky lg:top-0 lg:h-screen lg:self-start lg:border-b-0 lg:border-r lg:p-5">
        <div className="relative mb-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar" className="w-full rounded-xl bg-white/[0.055] py-3 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30" /></div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none lg:max-h-[calc(100vh-7rem)] lg:flex-col lg:overflow-y-auto">
          <button onClick={() => setActiveCategory(LATEST)} className={`shrink-0 rounded-xl px-4 py-3 text-left text-sm transition ${activeCategory === LATEST ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.035] text-white/55 hover:bg-white/[0.07]'}`}>Últimos adicionados</button>
          {categories.map((category) => <button key={category.id} onClick={() => setActiveCategory(category.id)} className={`shrink-0 rounded-xl px-4 py-3 text-left text-sm transition ${activeCategory === category.id ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.035] text-white/55 hover:bg-white/[0.07]'}`}>{category.name}</button>)}
        </div>
      </aside>
      <main className="min-w-0 p-5 sm:p-7 lg:p-8">
        <div className="mb-6 flex items-end justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-emerald-400">Filmes</p><h1 className="mt-1 text-2xl font-semibold">{activeCategory === LATEST ? 'Últimos adicionados' : categories.find((item) => item.id === activeCategory)?.name}</h1></div><span className="text-xs text-white/30">{categoryMovies.length} títulos</span></div>
        {loading
          ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-[2/3] animate-pulse rounded-2xl bg-white/[0.045]" />)}</div>
          : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{visibleMovies.map((movie) => <button key={movie.id} onClick={() => void selectMovie(movie)} className="group text-left"><div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-white/[0.04]"><MediaCover logo={movie.logo} name={movie.name} /><MediaRatingBadge value={movie.rating} /></div><p className="mt-2 truncate text-sm font-medium text-white/75">{movie.name}</p></button>)}</div>}
        {(visibleMovies.length < categoryMovies.length || loadingMore) && <div className="flex items-center justify-center gap-2 py-10 text-sm text-white/35"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" />Carregando mais filmes</div>}
        {!loading && !categoryMovies.length && <div className="py-20 text-center text-sm text-white/35">Nenhum filme encontrado nesta categoria.</div>}
      </main>
    </div>
  </div>;

  const heroBackdrops = [selectedInfo?.backdrop || '', selected.backdrop || '', selectedInfo?.cover || '', selected.logo || ''];
  const titleLogo = selectedInfo?.titleLogo;
  const plot = selectedInfo?.plot || selected.plot;
  const genre = selectedInfo?.genre || selected.genre;
  const release = selectedInfo?.releaseDate || selected.releaseDate;
  const duration = mediaDuration(selectedInfo?.duration);
  const rating = mediaRating(selectedInfo?.rating || selected.rating);
  const director = selectedInfo?.director;
  const contentRating = selectedInfo?.contentRating;
  const language = selectedInfo?.language?.toUpperCase();
  const trailerSource = selectedInfo?.trailerKey;
  const castMembers = mediaCastList(selectedInfo?.castMembers, selectedInfo?.cast);
  const similarMovies = movies.filter((movie) => movie.id !== selected.id && movie.categoryId === selected.categoryId).slice(0, 10);

  return <div className="-mx-5 sm:-mx-8 lg:-mx-10 lg:-mt-8">
    <section className="relative min-h-[72vh] overflow-hidden bg-[#0a1117]">
      <MediaBackdrop sources={heroBackdrops} />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#091018_0%,rgba(9,16,24,.82)_48%,rgba(9,16,24,.14)_100%),linear-gradient(0deg,#091018_0%,transparent_65%)]" />
      <button onClick={closeDetails} className="absolute left-5 top-6 z-20 flex items-center gap-2 rounded-xl bg-black/35 px-3 py-2 text-xs text-white/70 backdrop-blur-lg sm:left-8 lg:left-12"><ArrowLeft className="h-4 w-4" />Voltar para capas</button>
      <div className="relative z-10 flex min-h-[72vh] max-w-2xl flex-col justify-end px-5 pb-14 pt-24 sm:px-8 lg:px-12">
        <span className="mb-3 text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-400">{categories.find((item) => item.id === selected.categoryId)?.name || 'Filme'}</span>
        <MediaHeroTitle logo={titleLogo} name={selectedInfo?.name || selected.name} />
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/55">
          {contentRating && <span className="rounded border border-white/45 px-1.5 py-0.5 font-semibold text-white/75">{contentRating}</span>}
          {release && <span>{formatMediaDate(release)}</span>}
          {language && <span>({language})</span>}
          {duration && <span>{duration}</span>}
          {rating && Number(rating) > 0 && <span className="flex items-center gap-1 text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />{rating}</span>}
        </div>
        {genre && <p className="mt-3 text-sm text-white/65">{genre}</p>}
        {director && <p className="mt-3 text-xs text-white/45"><span className="font-medium text-white/65">Direção:</span> {director}</p>}
        {plot && <MediaSynopsis text={plot} />}
        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={() => onSelectChannel(selected)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950"><Play className="h-4 w-4 fill-current" />Reproduzir</button>
          {trailerSource && <button type="button" onClick={() => setTrailerOpen(true)} className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm text-white backdrop-blur"><Play className="h-4 w-4" />Trailer</button>}
          <button onClick={() => onToggleFavorite(selected.id, selected)} className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm backdrop-blur"><Heart className={`h-4 w-4 ${favorites.has(selected.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} />Favoritos</button>
        </div>
      </div>
    </section>

    <section className="px-5 pb-16 pt-6 sm:px-8 lg:px-12">
      {detailLoading
        ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div>
        : <>
          {similarMovies.length > 0 && <div className="mt-4">
            <MediaArrowRow title="Filmes semelhantes">
              {similarMovies.map((movie) => <button data-arrow-item key={movie.id} onClick={() => void selectMovie(movie)} className="group w-40 shrink-0 snap-start text-left"><div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-white/[0.04]"><MediaCover logo={movie.logo} name={movie.name} /><MediaRatingBadge value={movie.rating} /></div><p className="mt-2 truncate text-sm text-white/65">{movie.name}</p></button>)}
            </MediaArrowRow>
          </div>}
          {castMembers.length > 0 && <div className="mt-10">
            <MediaArrowRow title="Elenco">
              {castMembers.map((member, index) => <div data-arrow-item key={`${member.name}:${index}`} className="w-36 shrink-0 snap-start text-center sm:w-40">
                <MediaCastPortrait member={member} />
                <p className="mt-2 truncate text-sm font-medium text-white/75">{member.name}</p>
                {member.character && <p className="mt-0.5 truncate text-xs text-white/35">{member.character}</p>}
              </div>)}
            </MediaArrowRow>
          </div>}
        </>}
    </section>
    {trailerOpen && trailerSource && <TrailerPlayer source={trailerSource} title={selected.name} onClose={() => setTrailerOpen(false)} />}
  </div>;
}
