import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Heart, Loader2, Play, Search, Star, Tv, UserRound } from 'lucide-react';
import type { Channel } from '@/types';
import { loadSeriesCatalog, loadSeriesDetails, loadSeriesSeasonImages, type SeriesCastMember, type SeriesCategory, type SeriesEpisode, type SeriesShow } from '@/lib/provider';
import { storage } from '@/lib/storage';
import { TrailerPlayer } from '@/components/TrailerPlayer';

interface SeriesViewProps {
  channels: Channel[];
  groups: string[];
  favorites: Set<string>;
  onSelectChannel: (ch: Channel) => void;
  onToggleFavorite: (id: string, channel?: Channel) => void;
  resumeSeriesId?: string | null;
  onResumeHandled?: () => void;
}

const LATEST = 'recent';
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const formatDate = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};

function imageValue(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = imageValue(item);
      if (image) return image;
    }
    return '';
  }
  if (typeof value !== 'string') return '';
  const source = value.trim();
  if (!source) return '';
  if (source.startsWith('[') || source.startsWith('{')) {
    try { return imageValue(JSON.parse(source)); } catch { return ''; }
  }
  return source;
}

function HeroBackdrop({ sources }: { sources: string[] }) {
  const available = [...new Set(sources.filter(Boolean))];
  const signature = available.join('|');
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(0); }, [signature]);
  const source = available[index];
  if (!source) return null;
  return <img key={source} src={source} alt="" onError={() => setIndex((current) => current + 1)} className="absolute inset-0 h-full w-full object-cover" />;
}

function castList(value: unknown, fallback: unknown): SeriesCastMember[] {
  if (Array.isArray(value)) {
    return value.map((item) => item && typeof item === 'object' ? {
      name: text((item as Record<string, unknown>).name),
      character: text((item as Record<string, unknown>).character),
      image: text((item as Record<string, unknown>).image),
    } : { name: text(item) }).filter((item) => item.name);
  }
  const names = text(fallback).split(',').map((name) => name.trim()).filter(Boolean);
  return names.map((name) => ({ name }));
}

function SeriesCover({ logo, fallbackLogo, name, preserveAspect = false }: { logo?: string; fallbackLogo?: string; name: string; preserveAspect?: boolean }) {
  const initialSource = logo || fallbackLogo;
  const [loading, setLoading] = useState(Boolean(initialSource));
  const [failed, setFailed] = useState(false);
  const [source, setSource] = useState(initialSource);

  useEffect(() => {
    const nextSource = logo || fallbackLogo;
    setLoading(Boolean(nextSource));
    setFailed(false);
    setSource(nextSource);
  }, [fallbackLogo, logo]);

  const handleError = () => {
    if (fallbackLogo && source !== fallbackLogo) {
      setLoading(true);
      setSource(fallbackLogo);
      return;
    }
    setLoading(false);
    setFailed(true);
  };

  return <>
    {loading && <span className="absolute inset-0 z-10 flex items-center justify-center bg-[#111a20]"><Loader2 className="h-6 w-6 animate-spin text-emerald-400/70" /></span>}
    {source && !failed
      ? <>{preserveAspect && <img src={source} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-xl" />}<img src={source} alt={name} loading="lazy" decoding="async" onLoad={() => setLoading(false)} onError={handleError} className={preserveAspect ? 'relative z-[1] h-full w-full object-contain' : 'h-full w-full object-cover transition duration-500 group-hover:scale-105'} /></>
      : <span className="flex h-full items-center justify-center"><Tv className="h-9 w-9 text-white/15" /></span>}
  </>;
}

function HeroTitle({ logo, name }: { logo?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [logo]);
  if (!logo || failed) return <h1 className="text-4xl font-semibold leading-none tracking-tight lg:text-6xl">{name}</h1>;
  return <img src={logo} alt={name} onError={() => setFailed(true)} className="max-h-28 max-w-[min(78vw,24rem)] object-contain object-left" />;
}

function CastPortrait({ member }: { member: SeriesCastMember }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [member.image]);
  return <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-white/[0.05]">
    {member.image && !failed
      ? <img src={member.image} alt={member.name} loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover object-top" />
      : <span className="flex h-full items-center justify-center"><UserRound className="h-10 w-10 text-white/15" /></span>}
  </div>;
}

function ArrowRow({ title, children }: { title: string; children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: -1 | 1) => {
    const track = trackRef.current;
    const firstItem = track?.querySelector<HTMLElement>('[data-arrow-item]');
    if (!track || !firstItem) return;
    const gap = Number.parseFloat(getComputedStyle(track).gap) || 16;
    track.scrollBy({ left: direction * (firstItem.offsetWidth + gap), behavior: 'smooth' });
  };

  return <div>
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => scroll(-1)} className="shelf-arrow" aria-label={`Voltar em ${title}`}><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => scroll(1)} className="shelf-arrow" aria-label={`Avançar em ${title}`}><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
    <div ref={trackRef} className="flex snap-x snap-mandatory gap-4 overflow-hidden scroll-smooth pb-4">{children}</div>
  </div>;
}

export function SeriesView({ favorites, onSelectChannel, onToggleFavorite, resumeSeriesId, onResumeHandled }: SeriesViewProps) {
  const [categories, setCategories] = useState<SeriesCategory[]>([]);
  const [shows, setShows] = useState<SeriesShow[]>([]);
  const [activeCategory, setActiveCategory] = useState(LATEST);
  const [selected, setSelected] = useState<SeriesShow | null>(null);
  const [episodes, setEpisodes] = useState<SeriesEpisode[]>([]);
  const [season, setSeason] = useState(1);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [seriesInfo, setSeriesInfo] = useState<Record<string, unknown>>({});
  const [seasonThumbs, setSeasonThumbs] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(() => storage.getWatchProgress());
  const [visibleCount, setVisibleCount] = useState(40);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const detailRequestRef = useRef(0);

  useEffect(() => {
    let active = true;
    void loadSeriesCatalog()
      .then((catalog) => {
        if (!active || !catalog) return;
        setCategories(catalog.categories);
        setShows(catalog.shows);
      })
      .catch(() => { if (active) setShows([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (selected && favorites.has(selected.id)) storage.saveFavoriteItem(selected);
  }, [favorites, selected]);

  const categoryShows = useMemo(() => {
    const base = activeCategory === LATEST
      ? [...shows].sort((a, b) => Number(b.added || 0) - Number(a.added || 0)).slice(0, 40)
      : shows.filter((show) => show.categoryId === activeCategory);
    const value = query.trim().toLocaleLowerCase('pt-BR');
    return value ? base.filter((show) => show.name.toLocaleLowerCase('pt-BR').includes(value)) : base;
  }, [activeCategory, query, shows]);

  const visibleShows = categoryShows.slice(0, visibleCount);

  useEffect(() => { setVisibleCount(40); }, [activeCategory, query]);

  useEffect(() => {
    if (selected || visibleCount >= categoryShows.length) return;
    const loadMore = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 900) {
        setVisibleCount((current) => Math.min(current + 40, categoryShows.length));
      }
    };
    window.addEventListener('scroll', loadMore, { passive: true });
    loadMore();
    return () => window.removeEventListener('scroll', loadMore);
  }, [categoryShows.length, selected, visibleCount]);

  const selectShow = useCallback(async (show: SeriesShow) => {
    const requestId = ++detailRequestRef.current;
    setSelected(show);
    setEpisodes([]);
    setSeriesInfo({});
    setSeasonThumbs({});
    setDetailLoading(true);
    setProgress(storage.getWatchProgress());
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const details = await loadSeriesDetails(show.seriesId, show.name, show.releaseDate);
      if (details && requestId === detailRequestRef.current) {
        setEpisodes(details.episodes);
        setSeriesInfo(details.info);
        setSeason(details.episodes[0]?.season || 1);
      }
    } catch { /* mantém o Hero com os dados já existentes no catálogo */
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!resumeSeriesId || loading || !shows.length) return;
    const resume = shows.find((show) => show.id === resumeSeriesId || show.seriesId === resumeSeriesId);
    onResumeHandled?.();
    if (resume) void selectShow(resume);
  }, [loading, onResumeHandled, resumeSeriesId, selectShow, shows]);

  const seasons = useMemo(() => [...new Set(episodes.map((item) => item.season))].sort((a, b) => a - b), [episodes]);
  const seasonEpisodes = useMemo(() => episodes.filter((item) => item.season === season).sort((a, b) => a.episode - b.episode), [episodes, season]);
  const continueEpisode = episodes.find((item) => progress[item.id] && progress[item.id].current < progress[item.id].duration - 30) || episodes[0];
  const similarSeries = selected ? shows.filter((show) => show.id !== selected.id && show.categoryId === selected.categoryId).slice(0, 10) : [];
  const tmdbId = text(seriesInfo.tmdbId);
  const castMembers = useMemo(() => castList(seriesInfo.castMembers, seriesInfo.cast || seriesInfo.actors), [seriesInfo]);

  useEffect(() => {
    if (!selected || !tmdbId) return;
    let active = true;
    void loadSeriesSeasonImages(tmdbId, season).then((images) => {
      if (!active) return;
      setSeasonThumbs((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(images).map(([episode, image]) => [`${season}:${episode}`, image])),
      }));
    }).catch(() => { /* mantém as imagens fornecidas pelo provedor */ });
    return () => { active = false; };
  }, [season, selected, tmdbId]);

  const closeDetails = () => {
    detailRequestRef.current += 1;
    setDetailLoading(false);
    setSelected(null);
  };

  if (!selected) return <div data-series-catalog className="-mx-5 -mt-6 min-h-screen bg-[#091018] sm:-mx-8 lg:-mx-10 lg:-mt-8">
    <div className="grid min-h-screen lg:grid-cols-[17rem_1fr]">
      <aside className="border-b border-white/[0.035] bg-[#0b141b] p-4 lg:sticky lg:top-0 lg:h-screen lg:self-start lg:border-b-0 lg:border-r lg:p-5">
        <div className="relative mb-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Procurar" className="w-full rounded-xl bg-white/[0.055] py-3 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30" /></div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none lg:max-h-[calc(100vh-7rem)] lg:flex-col lg:overflow-y-auto">
          <button onClick={() => setActiveCategory(LATEST)} className={`shrink-0 rounded-xl px-4 py-3 text-left text-sm transition ${activeCategory === LATEST ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.035] text-white/55 hover:bg-white/[0.07]'}`}>Últimos adicionados</button>
          {categories.map((category) => <button key={category.id} onClick={() => setActiveCategory(category.id)} className={`shrink-0 rounded-xl px-4 py-3 text-left text-sm transition ${activeCategory === category.id ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.035] text-white/55 hover:bg-white/[0.07]'}`}>{category.name}</button>)}
        </div>
      </aside>
      <main className="min-w-0 p-5 sm:p-7 lg:p-8">
        <div className="mb-6 flex items-end justify-between"><div><p className="text-[10px] uppercase tracking-[.18em] text-emerald-400">Séries</p><h1 className="mt-1 text-2xl font-semibold">{activeCategory === LATEST ? 'Últimos adicionados' : categories.find((item) => item.id === activeCategory)?.name}</h1></div><span className="text-xs text-white/30">{categoryShows.length} títulos</span></div>
        {loading
          ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="aspect-[2/3] animate-pulse rounded-2xl bg-white/[0.045]" />)}</div>
          : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{visibleShows.map((show) => <button key={show.id} onClick={() => void selectShow(show)} className="group text-left"><div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-white/[0.04]"><SeriesCover logo={show.logo} name={show.name} />{Number(show.rating) > 0 && <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/75 px-2 py-1 text-[10px] font-semibold text-amber-300 backdrop-blur"><Star className="h-3 w-3 fill-current" />{show.rating}</span>}</div><p className="mt-2 truncate text-sm font-medium text-white/75">{show.name}</p></button>)}</div>}
        {visibleShows.length < categoryShows.length && <div className="flex items-center justify-center gap-2 py-10 text-sm text-white/35"><Loader2 className="h-5 w-5 animate-spin text-emerald-400" />Carregando mais séries</div>}
      </main>
    </div>
  </div>;

  const detailBackdrop = imageValue(seriesInfo.backdrop_path) || imageValue(seriesInfo.backdrop);
  const heroBackdrops = [selected.backdrop || '', detailBackdrop, selected.logo || ''];
  const plot = text(seriesInfo.plot || seriesInfo.description) || selected.plot;
  const genre = text(seriesInfo.genre) || selected.genre;
  const release = text(seriesInfo.releaseDate || seriesInfo.release_date) || selected.releaseDate;
  const titleLogo = text(seriesInfo.titleLogo || seriesInfo.title_logo || seriesInfo.logo_path);
  const creator = text(seriesInfo.creator || seriesInfo.director);
  const contentRating = text(seriesInfo.contentRating || seriesInfo.rating_age || seriesInfo.mpaa_rating);
  const language = text(seriesInfo.language).toUpperCase();
  const detailRating = text(seriesInfo.tmdbRating || seriesInfo.rating || selected.rating);
  const trailerKey = text(seriesInfo.trailerKey || seriesInfo.youtube_trailer);
  const playEpisode = (episode: SeriesEpisode) => onSelectChannel({ ...episode, parentSeriesId: selected.id });

  return <div className="-mx-5 sm:-mx-8 lg:-mx-10 lg:-mt-8">
    <section className="relative min-h-[72vh] overflow-hidden bg-[#0a1117]">
      <HeroBackdrop sources={heroBackdrops} />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#091018_0%,rgba(9,16,24,.82)_48%,rgba(9,16,24,.14)_100%),linear-gradient(0deg,#091018_0%,transparent_65%)]" />
      <button onClick={closeDetails} className="absolute left-5 top-6 z-20 flex items-center gap-2 rounded-xl bg-black/35 px-3 py-2 text-xs text-white/70 backdrop-blur-lg sm:left-8 lg:left-12"><ArrowLeft className="h-4 w-4" />Voltar para capas</button>
      <div className="relative z-10 flex min-h-[72vh] max-w-2xl flex-col justify-end px-5 pb-14 pt-24 sm:px-8 lg:px-12">
        <span className="mb-3 text-[10px] font-semibold uppercase tracking-[.2em] text-emerald-400">{categories.find((item) => item.id === selected.categoryId)?.name || 'Série'}</span>
        <HeroTitle logo={titleLogo} name={selected.name} />
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/55">
          {contentRating && <span className="rounded border border-white/45 px-1.5 py-0.5 font-semibold text-white/75">{contentRating}</span>}
          {release && <span>{formatDate(release)}</span>}
          {language && <span>({language})</span>}
          {detailRating && Number(detailRating) > 0 && <span className="flex items-center gap-1 text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />{detailRating}</span>}
        </div>
        {genre && <p className="mt-3 text-sm text-white/65">{genre}</p>}
        {creator && <p className="mt-3 text-xs text-white/45"><span className="font-medium text-white/65">Criação e direção:</span> {creator}</p>}
        {plot && <p className="mt-4 line-clamp-3 text-sm leading-6 text-white/55">{plot}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          {continueEpisode && <button onClick={() => playEpisode(continueEpisode)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950"><Play className="h-4 w-4 fill-current" />{progress[continueEpisode.id] ? 'Continuar' : 'Reproduzir'}</button>}
          {trailerKey && <button type="button" onClick={() => setTrailerOpen(true)} className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm text-white backdrop-blur"><Play className="h-4 w-4" />Trailer</button>}
          <button onClick={() => onToggleFavorite(selected.id)} className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm backdrop-blur"><Heart className={`h-4 w-4 ${favorites.has(selected.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} />Favoritos</button>
        </div>
        {continueEpisode && progress[continueEpisode.id] && <p className="mt-3 flex items-center gap-1 text-xs text-white/38"><Clock3 className="h-3.5 w-3.5" />Temporada {continueEpisode.season} • Episódio {continueEpisode.episode}</p>}
      </div>
    </section>

    <section className="px-5 pb-16 pt-6 sm:px-8 lg:px-12">
      {detailLoading
        ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-400" /></div>
        : <>
          <div className="mb-8">
            <ArrowRow title="Temporadas">
              {seasons.map((value) => <button data-arrow-item key={value} onClick={() => setSeason(value)} className={`min-w-44 shrink-0 snap-start rounded-xl px-5 py-4 text-sm font-medium ${season === value ? 'bg-emerald-400 text-slate-950' : 'bg-white/[0.06] text-white/55'}`}>Temporada {value}</button>)}
            </ArrowRow>
          </div>
          <ArrowRow title="Episódios">
            {seasonEpisodes.map((item) => {
              const watched = progress[item.id];
              const percent = watched ? Math.min(100, Math.round((watched.current / watched.duration) * 100)) : 0;
              return <button data-arrow-item key={`${season}:${item.id}`} onClick={() => playEpisode(item)} className="group w-[min(78vw,22rem)] shrink-0 snap-start text-left">
                <div className="relative aspect-video overflow-hidden rounded-2xl bg-white/[0.04]">
                  <SeriesCover logo={seasonThumbs[`${season}:${item.episode}`] || item.logo} fallbackLogo={selected.logo} name={item.name} preserveAspect />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
                  {percent > 0 && <span className="absolute inset-x-0 bottom-0 h-1.5 bg-white/15"><span className="block h-full bg-emerald-400" style={{ width: `${percent}%` }} /></span>}
                  <span className="absolute bottom-4 left-4 text-sm font-semibold">Episódio {item.episode}</span>
                </div>
                <p className="mt-2 truncate text-xs text-white/45">{item.name}{percent > 0 ? ` • ${percent}% assistido` : ''}</p>
              </button>;
            })}
          </ArrowRow>
          {similarSeries.length > 0 && <div className="mt-10">
            <ArrowRow title="Séries semelhantes">
              {similarSeries.map((show) => <button data-arrow-item key={show.id} onClick={() => void selectShow(show)} className="group w-40 shrink-0 snap-start text-left"><div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-white/[0.04]"><SeriesCover logo={show.logo} name={show.name} />{Number(show.rating) > 0 && <span className="absolute right-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[10px] text-amber-300">★ {show.rating}</span>}</div><p className="mt-2 truncate text-sm text-white/65">{show.name}</p></button>)}
            </ArrowRow>
          </div>}
          {castMembers.length > 0 && <div className="mt-10">
            <ArrowRow title="Elenco">
              {castMembers.map((member, index) => <div data-arrow-item key={`${member.name}:${index}`} className="w-36 shrink-0 snap-start text-center sm:w-40">
                <CastPortrait member={member} />
                <p className="mt-2 truncate text-sm font-medium text-white/75">{member.name}</p>
                {member.character && <p className="mt-0.5 truncate text-xs text-white/35">{member.character}</p>}
              </div>)}
            </ArrowRow>
          </div>}
        </>}
    </section>
    {trailerOpen && <TrailerPlayer source={trailerKey} title={selected.name} onClose={() => setTrailerOpen(false)} />}
  </div>;
}
