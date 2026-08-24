import { useEffect, useRef, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Clock3, Film, Heart, LoaderCircle, Play, Radio, Sparkles, Star, Tv } from 'lucide-react';
import type { Channel } from '@/types';
import { loadAccountStatus, loadContentInfo, loadHomeCatalog, type AccountStatus, type CatalogItem, type ContentInfo } from '@/lib/provider';
import type { View } from '@/components/layout/Sidebar';
import { storage } from '@/lib/storage';

interface HomeViewProps {
  favorites: Set<string>;
  onSelectChannel: (ch: Channel) => void;
  onToggleFavorite: (id: string, channel?: Channel) => void;
  onNavigate: (view: View) => void;
}
interface PosterShelfProps { title: string; items: CatalogItem[]; onViewAll: () => void; onSelect: (channel: CatalogItem) => void; }

function PosterImage({ channel }: { channel: CatalogItem }) {
  const [loading, setLoading] = useState(Boolean(channel.logo));
  const [failed, setFailed] = useState(false);
  return <>
    {loading && <span className="absolute inset-0 z-10 flex items-center justify-center bg-[#111a20]"><LoaderCircle className="h-6 w-6 animate-spin text-emerald-400/70" /></span>}
    {channel.logo && !failed ? <img src={channel.logo} alt={channel.name} loading="lazy" onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center"><Tv className="h-10 w-10 text-white/15" /></div>}
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
        <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-400/70">Novidades</p><h2 className="text-lg font-semibold tracking-tight text-white sm:text-xl">{title}</h2></div>
        <div className="flex items-center gap-2">
          <button onClick={() => scroll(-1)} className="shelf-arrow" aria-label="Voltar"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => scroll(1)} className="shelf-arrow" aria-label="Avançar"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={onViewAll} className="ml-2 text-xs font-medium text-emerald-400 transition hover:text-emerald-300">Ver todos</button>
        </div>
      </div>
      <div className="relative">
        <div ref={trackRef} className="poster-track scrollbar-none">
          {items.map((channel) => (
            <button key={channel.id} onClick={() => onSelect(channel)} className="poster-card group">
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[#111a20] ring-1 ring-white/10 transition duration-500 group-hover:-translate-y-1 group-hover:ring-emerald-400/40">
                <PosterImage channel={channel} />
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

function validRating(value?: string) {
  if (!value || !/^\d+(?:[.,]\d+)?$/.test(value.trim())) return false;
  return Number(value.replace(',', '.')) > 0;
}

export function HomeView({ favorites, onSelectChannel, onToggleFavorite, onNavigate }: HomeViewProps) {
  const favoritesRef = useRef(favorites);
  const [heroItem, setHeroItem] = useState<CatalogItem | null>(null);
  const [heroInfo, setHeroInfo] = useState<ContentInfo | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [movies, setMovies] = useState<CatalogItem[]>([]);
  const [series, setSeries] = useState<CatalogItem[]>([]);
  const [heroImageLoading, setHeroImageLoading] = useState(true);

  useEffect(() => { favoritesRef.current = favorites; }, [favorites]);

  useEffect(() => {
    let active = true;
    void loadAccountStatus().then((status) => { if (active) setAccountStatus(status); });
    void loadHomeCatalog().then((catalog) => {
      if (!active) return;
      const movieItems = catalog?.movies ?? [];
      const seriesItems = catalog?.series ?? [];
      [...movieItems, ...seriesItems].forEach((item) => { if (favoritesRef.current.has(item.id)) storage.saveFavoriteItem(item); });
      const featured = movieItems[0] ?? null;
      setHeroItem(featured);
      if (!featured) setHeroImageLoading(false);
      setMovies(featured ? movieItems.filter((item) => item.id !== featured.id).slice(0, 10) : movieItems.slice(0, 10));
      setSeries(seriesItems.slice(0, 10));
      if (featured) void loadContentInfo(featured).then((info) => {
        if (!active) return;
        setHeroInfo(info);
        if (!info?.backdrop && !featured.backdrop && !info?.cover && !featured.logo) setHeroImageLoading(false);
      });
    }).catch((error) => console.warn('Não foi possível carregar a vitrine da Home:', error));
    return () => { active = false; };
  }, []);

  const heroBackground = heroInfo?.backdrop || heroItem?.backdrop;
  const heroPosterFallback = heroInfo?.cover || heroItem?.logo;
  const releaseYear = heroInfo?.releaseDate?.match(/\b(19|20)\d{2}\b/)?.[0];
  const rawHeroRating = heroInfo?.rating || heroItem?.rating;
  const heroRating = validRating(rawHeroRating) ? rawHeroRating : undefined;
  const duration = heroInfo?.duration && !/^(?:0+:)+0+$/.test(heroInfo.duration.trim()) && !/^0+\s*(?:min|mins|minutos?)$/i.test(heroInfo.duration.trim()) ? heroInfo.duration : undefined;
  const metadata = [heroRating, releaseYear, duration, heroInfo?.genre].filter(Boolean);
  const renewalUrl = accountStatus?.renewalUrl || import.meta.env.VITE_RENEWAL_URL as string | undefined;
  const trailerUrl = heroInfo?.trailerKey ? (/^https?:\/\//i.test(heroInfo.trailerKey) ? heroInfo.trailerKey : `https://www.youtube.com/watch?v=${encodeURIComponent(heroInfo.trailerKey)}`) : undefined;

  return (
    <div className="home-page -mx-5 -mt-[68px] sm:-mx-8 lg:-mx-10 lg:-mt-20">
      <section className="home-hero">
        {heroImageLoading && <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#091018]"><div className="flex flex-col items-center gap-3 text-xs text-white/35"><LoaderCircle className="h-8 w-8 animate-spin text-emerald-400/70" />Carregando destaque</div></div>}
        {heroBackground ? <img src={heroBackground} alt="" onLoad={() => setHeroImageLoading(false)} onError={() => setHeroImageLoading(false)} className="home-hero-image" /> : heroPosterFallback ? <img src={heroPosterFallback} alt="" onLoad={() => setHeroImageLoading(false)} onError={() => setHeroImageLoading(false)} className="home-hero-image home-hero-poster-fallback" /> : null}
        <div className="home-hero-shade" />
        {accountStatus?.daysRemaining != null && <div className="subscription-card absolute right-5 top-24 z-20 sm:right-8 lg:right-12 lg:top-24"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/12 text-emerald-300"><CalendarClock className="h-4 w-4" /></span><span><span className="block text-[10px] uppercase tracking-[0.16em] text-white/35">Sua assinatura</span><strong className="block text-sm font-semibold text-white">{accountStatus.daysRemaining === 1 ? '1 dia restante' : `${accountStatus.daysRemaining} dias restantes`}</strong></span>{accountStatus.daysRemaining <= 7 && <button disabled={!renewalUrl} onClick={() => renewalUrl && window.open(renewalUrl, '_blank', 'noopener,noreferrer')} className="ml-2 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45" title={!renewalUrl ? 'Link de renovação será configurado em breve' : undefined}>Renovar</button>}</div>}
        <div className="relative z-10 flex min-h-[100svh] max-w-2xl flex-col justify-end px-5 pb-40 pt-32 sm:px-8 lg:px-12 lg:pb-48">
          <span className="mb-4 flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300 backdrop-blur-md"><Sparkles className="h-3.5 w-3.5" /> Destaque</span>
          {heroInfo?.titleLogo ? <><img src={heroInfo.titleLogo} alt={heroInfo.name || heroItem?.name || ''} className="mb-2 max-h-40 w-auto max-w-[min(80vw,420px)] object-contain object-left" /><h1 className="sr-only">{heroInfo.name || heroItem?.name}</h1></> : <h1 className="max-w-2xl text-4xl font-semibold leading-[0.95] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">{heroInfo?.name || heroItem?.name || 'Seu entretenimento em um só lugar'}</h1>}
          {metadata.length > 0 && <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-medium text-white/70">{heroRating && <span className="flex items-center gap-1 text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />{heroRating}</span>}{releaseYear && <span>{releaseYear}</span>}{duration && <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{duration}</span>}{heroInfo?.genre && <span>{heroInfo.genre}</span>}</div>}
          <p className="mt-4 line-clamp-3 max-w-2xl text-sm leading-6 text-white/62">{heroInfo?.plot || 'Filmes, séries e canais ao vivo reunidos em uma experiência simples, rápida e cinematográfica.'}</p>
          {(heroInfo?.director || heroInfo?.cast) && <p className="mt-3 line-clamp-1 text-xs text-white/38"><span className="text-white/65">{heroInfo.director ? 'Direção:' : 'Elenco:'}</span> {heroInfo.director || heroInfo.cast}</p>}
          {heroItem && <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => onSelectChannel(heroItem)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"><Play className="h-4 w-4 fill-current" /> Reproduzir</button>{trailerUrl && <button onClick={() => window.open(trailerUrl, '_blank', 'noopener,noreferrer')} className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/10 px-5 py-3 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/15"><Play className="h-4 w-4 fill-current" /> Trailer</button>}<button onClick={() => onToggleFavorite(heroItem.id, heroItem)} className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/10 px-5 py-3 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/15"><Heart className={`h-4 w-4 ${favorites.has(heroItem.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} /> {favorites.has(heroItem.id) ? 'Favoritado' : 'Favoritos'}</button></div>}
        </div>
      </section>
      <div className="relative z-20 -mt-28 px-5 sm:px-8 lg:-mt-32 lg:px-12">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[{ id: 'live' as View, label: 'Canais ao Vivo', icon: Radio }, { id: 'movies' as View, label: 'Filmes', icon: Film }, { id: 'series' as View, label: 'Séries', icon: Tv }].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => onNavigate(id)} className="home-shortcut group"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400 transition group-hover:bg-emerald-400 group-hover:text-slate-950"><Icon className="h-5 w-5" /></span><span className="font-medium text-white/85">{label}</span><ChevronRight className="ml-auto h-4 w-4 text-white/20 transition group-hover:translate-x-1 group-hover:text-emerald-400" /></button>
          ))}
        </div>
        <div className="space-y-12 pb-16 pt-10">
          <PosterShelf title="Filmes recentemente adicionados" items={movies} onViewAll={() => onNavigate('movies')} onSelect={(item) => onSelectChannel(item)} />
          <PosterShelf title="Séries recentemente adicionadas" items={series} onViewAll={() => onNavigate('series')} onSelect={() => onNavigate('series')} />
        </div>
      </div>
    </div>
  );
}
