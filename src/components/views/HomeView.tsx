import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Film, Heart, LoaderCircle, PanelRightOpen, Play, Radio, RefreshCw, Star, Tv, X } from 'lucide-react';
import type { Channel } from '@/types';
import { loadAccountStatus, loadContentInfo, loadHomeCatalog, loadSeriesContentInfo, readCachedHomeCatalog, type AccountStatus, type CatalogItem, type ContentInfo } from '@/lib/provider';
import type { View } from '@/components/layout/Sidebar';
import { storage } from '@/lib/storage';
import { TrailerPlayer } from '@/components/TrailerPlayer';
import { FootballWidget } from '@/components/home/FootballWidget';
import { loadSportsWidgetSettings } from '@/lib/sportsSettings';
import { MediaHeroTitle, MediaSynopsis } from '@/components/media/MediaDetailsUI';
import { mediaDuration, mediaImageValue, mediaText } from '@/components/media/mediaUtils';
import { getPlayableStreamUrl } from '@/lib/streamProxy';

interface HomeViewProps {
  favorites: Set<string>;
  onSelectChannel: (ch: Channel) => void;
  onToggleFavorite: (id: string, channel?: Channel) => void;
  onNavigate: (view: View) => void;
  onSelectSeries: (seriesId: string) => void;
  branding: { primaryColor: string; secondaryColor: string };
}
interface PosterShelfProps { title: string; items: CatalogItem[]; onViewAll: () => void; onSelect: (channel: CatalogItem) => void; }

function PosterImage({ channel, priority = false }: { channel: CatalogItem; priority?: boolean }) {
  const [loading, setLoading] = useState(Boolean(channel.logo));
  const [failed, setFailed] = useState(false);
  return <>
    {loading && <span className="absolute inset-0 z-10 flex items-center justify-center bg-[#111a20]"><LoaderCircle className="h-6 w-6 animate-spin text-emerald-400/70" /></span>}
    {channel.logo && !failed ? <img src={channel.logo} alt={channel.name} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} decoding="async" onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center"><Tv className="h-10 w-10 text-white/15" /></div>}
  </>;
}

function PosterShelf({ title, items, onViewAll, onSelect }: PosterShelfProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: -1 | 1) => {
    const track = trackRef.current;
    const firstCard = track?.querySelector<HTMLElement>('.poster-card');
    if (!track || !firstCard) return;
    const gap = Number.parseFloat(getComputedStyle(track).gap) || 16;
    track.scrollBy({ left: direction * (firstCard.offsetWidth + gap), behavior: 'smooth' });
  };

  return (
    <section className="home-shelf">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[.05em] text-emerald-400/70">Novidades</p><h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">{title}</h2></div>
        <div className="flex items-center gap-2">
          <button onClick={() => scroll(-1)} className="shelf-arrow" aria-label="Voltar"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => scroll(1)} className="shelf-arrow" aria-label="Avançar"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={onViewAll} className="ml-2 text-xs font-medium text-emerald-400 transition hover:text-emerald-300">Ver todos</button>
        </div>
      </div>
      <div className="relative">
        <div ref={trackRef} className="poster-track scrollbar-none">
          {items.map((channel, index) => (
            <button key={channel.id} onClick={() => onSelect(channel)} className="poster-card group">
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[#111a20] ring-1 ring-white/10 transition duration-500 group-hover:-translate-y-1 group-hover:ring-emerald-400/40">
                <PosterImage channel={channel} priority={index < 5} />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/0 to-black/10" />
                {validRating(channel.rating) && <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-amber-300 backdrop-blur-md"><Star className="h-3 w-3 fill-current" /> {channel.rating}</span>}
                <span className="absolute inset-0 bg-emerald-300/0 transition duration-500 group-hover:bg-emerald-300/[0.04]" />
                <div className="absolute inset-x-0 bottom-0 p-3 text-left"><p className="truncate text-sm font-semibold text-white">{channel.name}</p>{channel.group && <p className="mt-0.5 truncate text-[10px] text-white/45">{channel.group}</p>}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 -bottom-5 h-24 bg-gradient-to-b from-transparent via-[#091018]/70 to-[#091018] blur-[2px]" />
      </div>
    </section>
  );
}

function cleanHeroTitle(value?: string) {
  return (value || '')
    .replace(/\s*(?:\((?:E|L)\)\s*)+$/gi, '')
    .trim();
}

function validRating(value?: string) {
  if (!value || !/^\d+(?:[.,]\d+)?$/.test(value.trim())) return false;
  return Number(value.replace(',', '.')) > 0;
}

function shuffleFeaturedItems(items: CatalogItem[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function mixedRecentItems(movies: CatalogItem[], series: CatalogItem[]) {
  const shuffledMovies = shuffleFeaturedItems(movies.slice(0, 10));
  const shuffledSeries = shuffleFeaturedItems(series.slice(0, 10));
  const mixed: CatalogItem[] = [];
  const length = Math.max(shuffledMovies.length, shuffledSeries.length);
  const seriesFirst = Math.random() >= 0.5;
  for (let index = 0; index < length; index += 1) {
    const first = seriesFirst ? shuffledSeries[index] : shuffledMovies[index];
    const second = seriesFirst ? shuffledMovies[index] : shuffledSeries[index];
    if (first) mixed.push(first);
    if (second) mixed.push(second);
  }
  return mixed;
}

function homeImageValue(value: unknown) {
  const source = mediaImageValue(value);
  if (!source) return '';
  const highResolutionSource = source.startsWith('/')
    ? `https://image.tmdb.org/t/p/original${source}`
    : source
      .replace(/^http:\/\/image\.tmdb\.org/i, 'https://image.tmdb.org')
      .replace(/\/t\/p\/(?:w\d+|original)\//, '/t/p/original/');
  return /^http:\/\//i.test(highResolutionSource) ? getPlayableStreamUrl(highResolutionSource) : highResolutionSource;
}

function preloadHeroImage(source: string) {
  if (!source) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve();
    };
    const timeout = window.setTimeout(finish, 12_000);
    image.decoding = 'async';
    image.onload = () => {
      if (typeof image.decode === 'function') void image.decode().catch(() => undefined).finally(finish);
      else finish();
    };
    image.onerror = finish;
    image.src = source;
  });
}

function mergeHeroInfo(base: ContentInfo, detail: ContentInfo | null) {
  if (!detail) return base;
  const merged = { ...base };
  for (const [key, value] of Object.entries(detail)) {
    if (value == null || (typeof value === 'string' && !value.trim())) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

function seriesHeroInfo(item: CatalogItem, info: Record<string, unknown>): ContentInfo {
  return {
    name: mediaText(info.name || info.title) || item.name,
    plot: mediaText(info.plot || info.description) || item.plot,
    cast: mediaText(info.cast || info.actors),
    director: mediaText(info.creator || info.director),
    genre: mediaText(info.genre) || item.genre,
    releaseDate: mediaText(info.releaseDate || info.release_date),
    duration: mediaText(info.duration || info.episode_run_time),
    rating: mediaText(info.tmdbRating || info.rating || info.rating_5based) || item.rating,
    backdrop: homeImageValue(info.backdrop_path || info.backdrop) || item.backdrop,
    cover: homeImageValue(info.cover || info.movie_image) || item.logo,
    titleLogo: homeImageValue(info.titleLogo || info.title_logo || info.logo_path),
    trailerKey: mediaText(info.trailerKey || info.youtube_trailer),
    contentRating: mediaText(info.contentRating || info.rating_age || info.mpaa_rating),
    language: mediaText(info.language),
  };
}

function HomeHeroArtwork({ item, info, onReady }: { item: CatalogItem | null; info: ContentInfo | null; onReady: () => void }) {
  const candidates: Array<{ source: string; poster: boolean }> = [];
  const add = (value: unknown, poster: boolean) => {
    const source = homeImageValue(value);
    if (!source || candidates.some((candidate) => candidate.source === source)) return;
    candidates.push({ source, poster });
  };
  add(info?.backdrop, false);
  add(item?.backdrop, false);
  add(info?.cover, true);
  add(item?.logo, true);

  const [index, setIndex] = useState(0);
  const [readySource, setReadySource] = useState('');
  const signature = candidates.map((candidate) => candidate.source).join('|');
  useEffect(() => { setIndex(0); }, [signature]);
  const candidate = candidates[index];
  useEffect(() => { if (!candidate) onReady(); }, [candidate, onReady]);
  if (!candidate) return null;

  return <img
    src={candidate.source}
    alt=""
    onLoad={() => {
      setReadySource(candidate.source);
      onReady();
    }}
    onError={() => {
      setReadySource('');
      if (candidates[index + 1]) setIndex((current) => current + 1);
      else onReady();
    }}
    className={`home-hero-image ${readySource === candidate.source ? 'home-hero-image-ready' : 'home-hero-image-loading'} ${candidate.poster ? 'home-hero-poster-fallback' : ''}`}
  />;
}

export function HomeView({ favorites, onSelectChannel, onToggleFavorite, onNavigate, onSelectSeries, branding }: HomeViewProps) {
  const favoritesRef = useRef(favorites);
  const [heroInfo, setHeroInfo] = useState<ContentInfo | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [catalogMovies, setCatalogMovies] = useState<CatalogItem[]>([]);
  const [catalogSeries, setCatalogSeries] = useState<CatalogItem[]>([]);
  const [heroPool, setHeroPool] = useState<CatalogItem[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroImageLoading, setHeroImageLoading] = useState(true);
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  const [sportsWidgetEnabled, setSportsWidgetEnabled] = useState(true);
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [renewalChecking, setRenewalChecking] = useState(false);
  const [renewalCompleted, setRenewalCompleted] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const renewalBaselineRef = useRef<{ expiresAt: number; days: number } | null>(null);
  const catalogRequestRef = useRef(false);
  const heroInfoCacheRef = useRef(new Map<string, ContentInfo>());
  const heroInfoPendingRef = useRef(new Map<string, Promise<ContentInfo>>());
  const heroInfoRequestRef = useRef(0);
  const heroIndexRef = useRef(0);

  const heroItem = heroPool[heroIndex] ?? null;

  useEffect(() => { favoritesRef.current = favorites; }, [favorites]);
  useEffect(() => { heroIndexRef.current = heroIndex; }, [heroIndex]);
  useEffect(() => {
    const syncClock = () => setNow(new Date());
    const timer = window.setInterval(syncClock, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void loadSportsWidgetSettings().then((settings) => {
      if (!active) return;
      setSportsWidgetEnabled(settings.enabled);
      if (!settings.enabled) setInfoPanelOpen(false);
    });
    return () => { active = false; };
  }, []);

  const loadCompleteHeroInfo = useCallback((item: CatalogItem) => {
    const cached = heroInfoCacheRef.current.get(item.id);
    if (cached) return Promise.resolve(cached);

    const pending = heroInfoPendingRef.current.get(item.id);
    if (pending) return pending;

    const basicInfo: ContentInfo = {
      name: item.name,
      plot: item.plot,
      genre: item.genre,
      rating: item.rating,
      backdrop: homeImageValue(item.backdrop),
      cover: homeImageValue(item.logo),
    };
    const detailsRequest = item.contentType === 'series'
      ? loadSeriesContentInfo(item.streamId || item.id.replace(/^series:/, ''), item.name)
        .then((info) => info ? seriesHeroInfo(item, info) : null)
      : loadContentInfo(item);

    const request = detailsRequest
      .then((info) => {
        const completeInfo = mergeHeroInfo(basicInfo, info);
        completeInfo.backdrop = homeImageValue(completeInfo.backdrop);
        completeInfo.cover = homeImageValue(completeInfo.cover);
        completeInfo.titleLogo = homeImageValue(completeInfo.titleLogo);

        // Só fixa o resultado no cache quando a consulta detalhada respondeu.
        // Assim uma falha temporária não deixa o Hero sem logo durante toda a sessão.
        if (info) heroInfoCacheRef.current.set(item.id, completeInfo);
        return completeInfo;
      })
      .catch(() => basicInfo)
      .finally(() => heroInfoPendingRef.current.delete(item.id));

    heroInfoPendingRef.current.set(item.id, request);
    return request;
  }, []);

  const openRenewal = () => {
    if (!renewalUrl) return;
    renewalBaselineRef.current = { expiresAt: accountStatus?.expiresAt ? new Date(accountStatus.expiresAt).getTime() : 0, days: accountStatus?.daysRemaining ?? 0 };
    setRenewalCompleted(false);
    setRenewalOpen(true);
  };

  const verifyRenewal = useCallback(async () => {
    setRenewalChecking(true);
    try {
      const next = await loadAccountStatus();
      if (!next) return;
      setAccountStatus(next);
      const baseline = renewalBaselineRef.current;
      const nextExpiry = next.expiresAt ? new Date(next.expiresAt).getTime() : 0;
      if (baseline && (nextExpiry > baseline.expiresAt || (next.daysRemaining ?? 0) > baseline.days)) setRenewalCompleted(true);
    } finally {
      setRenewalChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!renewalOpen || renewalCompleted) return;
    const timer = window.setInterval(() => { void verifyRenewal(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [renewalCompleted, renewalOpen, verifyRenewal]);

  useEffect(() => {
    let active = true;
    const applyCatalog = (catalog: { movies: CatalogItem[]; series: CatalogItem[] }) => {
      if (!active) return;
      const movieItems = catalog.movies ?? [];
      const seriesItems = catalog.series ?? [];
      [...movieItems, ...seriesItems].forEach((item) => { if (favoritesRef.current.has(item.id)) storage.saveFavoriteItem(item); });
      const featuredItems = mixedRecentItems(movieItems, seriesItems);
      setCatalogMovies(movieItems);
      setCatalogSeries(seriesItems);
      setHeroPool(featuredItems);
      setHeroIndex(0);
      heroIndexRef.current = 0;
      if (!featuredItems.length) setHeroImageLoading(false);
    };
    const refreshCatalog = async (force = false) => {
      if (catalogRequestRef.current) return;
      catalogRequestRef.current = true;
      try {
        const catalog = await loadHomeCatalog(force);
        if (catalog) applyCatalog(catalog);
      } catch (error) {
        console.warn('Não foi possível carregar a vitrine da Home:', error);
      } finally {
        catalogRequestRef.current = false;
      }
    };
    void loadAccountStatus().then((status) => { if (active) setAccountStatus(status); });
    void readCachedHomeCatalog().then((cached) => {
      if (!active) return;
      if (cached) applyCatalog(cached.value);
      if (!cached || Date.now() - cached.savedAt >= 20 * 60_000) void refreshCatalog(false);
    });
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshCatalog(true); }, 30 * 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!heroItem) {
      setHeroInfo(null);
      return;
    }

    const requestId = ++heroInfoRequestRef.current;
    const cachedInfo = heroInfoCacheRef.current.get(heroItem.id);
    if (cachedInfo) {
      setHeroInfo(cachedInfo);
      return;
    }

    setHeroImageLoading(true);
    void loadCompleteHeroInfo(heroItem).then((info) => {
      if (requestId !== heroInfoRequestRef.current) return;
      setHeroInfo(info);
    });
  }, [heroItem, loadCompleteHeroInfo]);

  useEffect(() => {
    if (heroPool.length < 2 || trailerOpen) return;
    let active = true;
    let transitioning = false;
    const prepare = async (index: number) => {
      const item = heroPool[index];
      if (!item) return null;
      const info = await loadCompleteHeroInfo(item);
      const backdrop = homeImageValue(info.backdrop || item.backdrop || info.cover || item.logo);
      const titleLogo = homeImageValue(info.titleLogo);
      await Promise.all([preloadHeroImage(backdrop), preloadHeroImage(titleLogo)]);
      return { index, info };
    };

    let prepared = prepare((heroIndexRef.current + 1) % heroPool.length);
    const timer = window.setInterval(() => {
      if (!active || transitioning || document.visibilityState !== 'visible') return;
      transitioning = true;
      void prepared.then((next) => {
        if (!active || !next) return;
        heroInfoRequestRef.current += 1;
        setHeroInfo(next.info);
        setHeroImageLoading(true);
        heroIndexRef.current = next.index;
        setHeroIndex(next.index);
        prepared = prepare((next.index + 1) % heroPool.length);
      }).finally(() => { transitioning = false; });
    }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [heroPool, trailerOpen, loadCompleteHeroInfo]);

  const releaseYear = heroInfo?.releaseDate?.match(/\b(19|20)\d{2}\b/)?.[0];
  const rawHeroRating = heroInfo?.rating || heroItem?.rating;
  const heroRating = validRating(rawHeroRating) ? rawHeroRating : undefined;
  const duration = heroItem?.contentType === 'series' ? '' : mediaDuration(heroInfo?.duration);
  const heroLanguage = heroInfo?.language?.trim().toUpperCase();
  const metadata = [heroInfo?.contentRating, heroRating, releaseYear, heroLanguage, duration, heroInfo?.genre].filter(Boolean);
  const rawRenewalUrl = accountStatus?.renewalUrl || import.meta.env.VITE_RENEWAL_URL as string | undefined;
  const renewalUrl = (() => { try { const url = new URL(rawRenewalUrl || ''); return /^https?:$/.test(url.protocol) ? url.toString() : undefined; } catch { return undefined; } })();
  const trailerSource = heroInfo?.trailerKey;
  const movies = catalogMovies.slice(0, 10);
  const series = catalogSeries.slice(0, 10);

  return (
    <div className="home-page -mx-5 sm:-mx-8 lg:-mx-10 lg:-mt-8">
      <section className="home-hero">
        <div className={`hero-visual ${infoPanelOpen ? 'hero-visual-panel-open' : ''}`}>
        {heroImageLoading && !heroInfo && <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#091018]"><div className="flex flex-col items-center gap-3 text-xs text-white/35"><LoaderCircle className="h-8 w-8 animate-spin text-emerald-400/70" />Carregando destaque</div></div>}
        <HomeHeroArtwork item={heroItem} info={heroInfo} onReady={() => setHeroImageLoading(false)} />
        <div className="home-hero-shade" />
        <div className="absolute left-5 top-6 z-20 flex items-center gap-3.5 rounded-xl bg-[#091018]/68 px-4 py-3 text-white backdrop-blur-xl sm:left-8 lg:left-12">
          <Clock3 className="h-5 w-5" style={{ color: branding.primaryColor }} />
          <div className="leading-none">
            <strong className="block text-lg font-bold tabular-nums">{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
            <span className="mt-1.5 block text-[11px] font-medium uppercase tracking-[.05em] text-white/55">{now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '')}</span>
          </div>
        </div>
        {sportsWidgetEnabled && !infoPanelOpen && <button
          type="button"
          onClick={() => setInfoPanelOpen(true)}
          className="absolute right-5 top-6 z-20 flex min-h-12 items-center gap-3 rounded-xl bg-[#091018]/90 px-4 py-3 text-xs font-semibold uppercase tracking-[.05em] text-white/75 shadow-lg shadow-black/20 transition hover:bg-[#101a21] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#091018] sm:right-8 lg:right-12"
          aria-label="Abrir Jogos do Dia"
          title="Abrir Jogos do Dia"
        ><PanelRightOpen className="h-4 w-4" /> Jogos do Dia</button>}
        <div className="relative z-10 flex min-h-[100svh] max-w-3xl flex-col justify-end px-5 pb-40 pt-32 sm:px-8 lg:px-12 lg:pb-48">
          <MediaHeroTitle logo={heroInfo?.titleLogo} name={cleanHeroTitle(heroInfo?.name || heroItem?.name) || 'Seu entretenimento em um só lugar'} />
          {metadata.length > 0 && <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-medium text-white/70">{heroInfo?.contentRating && <span className="rounded border border-white/45 px-1.5 py-0.5 font-semibold text-white/75">{heroInfo.contentRating}</span>}{heroRating && <span className="flex items-center gap-1 text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />{heroRating}</span>}{releaseYear && <span>{releaseYear}</span>}{heroLanguage && <span>({heroLanguage})</span>}{duration && <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{duration}</span>}{heroInfo?.genre && <span>{heroInfo.genre}</span>}</div>}
          <MediaSynopsis text={heroInfo?.plot || 'Filmes, séries e canais ao vivo reunidos em uma experiência simples, rápida e cinematográfica.'} />
          {(heroInfo?.director || heroInfo?.cast) && <p className="mt-3 line-clamp-1 text-xs text-white/38"><span className="text-white/65">{heroInfo.director ? (heroItem?.contentType === 'series' ? 'Criação e direção:' : 'Direção:') : 'Elenco:'}</span> {heroInfo.director || heroInfo.cast}</p>}
          {heroItem && <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => heroItem.contentType === 'series' ? onSelectSeries(heroItem.id) : onSelectChannel(heroItem)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"><Play className="h-4 w-4 fill-current" /> Reproduzir</button>{trailerSource && <button type="button" onClick={() => setTrailerOpen(true)} className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/10 px-5 py-3 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/15"><Play className="h-4 w-4 fill-current" /> Trailer</button>}<button onClick={() => onToggleFavorite(heroItem.id, heroItem)} className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/10 px-5 py-3 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/15"><Heart className={`h-4 w-4 ${favorites.has(heroItem.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} /> {favorites.has(heroItem.id) ? 'Favoritado' : 'Favoritos'}</button></div>}
        </div>
        </div>
        {sportsWidgetEnabled && <aside className={`hero-info-panel ${infoPanelOpen ? 'hero-info-panel-open' : ''}`} aria-hidden={!infoPanelOpen}>
          <FootballWidget
            primaryColor={branding.primaryColor}
            onClose={() => setInfoPanelOpen(false)}
            onSelectChannel={onSelectChannel}
          />
          {accountStatus?.daysRemaining != null && accountStatus.daysRemaining <= 10 && <div className="border-t border-white/8 p-5"><div className="subscription-card"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/12 text-emerald-300"><CalendarClock className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[10px] uppercase tracking-[.05em] text-white/35">Sua assinatura</span><strong className="block text-sm font-semibold text-white">{accountStatus.daysRemaining === 0 ? 'Sua assinatura vence hoje' : accountStatus.daysRemaining === 1 ? 'Sua assinatura vence em 1 dia' : `Sua assinatura vence em ${accountStatus.daysRemaining} dias`}</strong></span><button disabled={!renewalUrl} onClick={openRenewal} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45" title={!renewalUrl ? 'Link de pagamento não cadastrado' : undefined}>Renovar</button></div></div>}
        </aside>}
      </section>
      {renewalOpen && renewalUrl && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-5 backdrop-blur-md" onClick={() => setRenewalOpen(false)}><div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#101a21] p-6 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-5 flex items-center justify-between text-left"><div><p className="text-[10px] font-semibold uppercase tracking-[.05em] text-emerald-400">Renovação</p><h2 className="mt-1 text-xl font-semibold text-white">Renove pelo celular</h2></div><button onClick={() => setRenewalOpen(false)} className="rounded-xl p-2 text-white/35 transition hover:bg-white/8 hover:text-white"><X className="h-5 w-5" /></button></div>{renewalCompleted ? <div className="py-8"><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" /><h3 className="mt-4 text-lg font-semibold text-white">Renovação concluída</h3><p className="mt-2 text-sm text-white/45">A nova validade foi confirmada pelo provedor.</p><button onClick={() => setRenewalOpen(false)} className="mt-6 w-full rounded-xl bg-emerald-400 py-3 text-sm font-semibold text-slate-950">Concluir</button></div> : <><div className="mx-auto w-fit rounded-2xl bg-white p-4"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=190x190&format=png&data=${encodeURIComponent(renewalUrl)}`} width="190" height="190" alt="QR Code para renovação" className="block h-[190px] w-[190px]" /></div><p className="mt-4 text-xs leading-5 text-white/45">Aponte a câmera do celular para o QR Code e conclua o pagamento na página do provedor.</p><a href={renewalUrl} target="_blank" rel="noreferrer" className="mt-4 block w-full rounded-xl bg-emerald-400 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">Abrir página de pagamento</a><button onClick={() => void verifyRenewal()} disabled={renewalChecking} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-xs font-medium text-white/65 transition hover:bg-white/5 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${renewalChecking ? 'animate-spin' : ''}`} />{renewalChecking ? 'Verificando...' : 'Já paguei, verificar renovação'}</button></>}</div></div>}
      <div className="relative z-20 -mt-28 px-5 sm:px-8 lg:-mt-32 lg:px-12">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { id: 'live' as View, label: 'Canais ao Vivo', description: 'Assista à programação agora', icon: Radio },
            { id: 'movies' as View, label: 'Filmes', description: 'Explore todos os filmes', icon: Film },
            { id: 'series' as View, label: 'Séries', description: 'Encontre sua próxima série', icon: Tv },
          ].map(({ id, label, description, icon: Icon }) => (
            <button key={id} type="button" onClick={() => onNavigate(id)} className="home-shortcut group" aria-label={`${label}: ${description}`}>
              <span className="home-shortcut-icon"><Icon className="h-6 w-6" /></span>
              <span className="relative z-10 min-w-0 flex-1">
                <strong className="home-shortcut-title">{label}</strong>
                <span className="home-shortcut-description">{description}</span>
              </span>
              <span className="home-shortcut-arrow"><ChevronRight className="h-5 w-5" /></span>
            </button>
          ))}
        </div>
        <div className="space-y-12 pb-16 pt-10">
          <PosterShelf title="Filmes recentemente adicionados" items={movies} onViewAll={() => onNavigate('movies')} onSelect={(item) => onSelectChannel(item)} />
          <PosterShelf title="Séries recentemente adicionadas" items={series} onViewAll={() => onNavigate('series')} onSelect={(item) => onSelectSeries(item.id)} />
        </div>
      </div>
      {trailerOpen && trailerSource && <TrailerPlayer source={trailerSource} title={heroInfo?.name || heroItem?.name || 'Trailer'} onClose={() => setTrailerOpen(false)} />}
    </div>
  );
}
