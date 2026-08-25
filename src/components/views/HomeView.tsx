import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Film, Heart, History, LoaderCircle, PanelRightOpen, Play, Radio, RefreshCw, Sparkles, Star, Tv, X } from 'lucide-react';
import type { Channel } from '@/types';
import { loadAccountStatus, loadContentInfo, loadHomeCatalog, readCachedHomeCatalog, type AccountStatus, type CatalogItem, type ContentInfo } from '@/lib/provider';
import type { View } from '@/components/layout/Sidebar';
import { storage } from '@/lib/storage';
import { searchChannels } from '@/lib/playlistStore';
import { VideoPlayer } from '@/components/VideoPlayer';

interface HomeViewProps {
  favorites: Set<string>;
  onSelectChannel: (ch: Channel) => void;
  onToggleFavorite: (id: string, channel?: Channel) => void;
  onNavigate: (view: View) => void;
  recents: Channel[];
  canManageSportsChannel: boolean;
  homeFeatureType: 'latest_movie' | 'latest_series';
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

export function HomeView({ favorites, onSelectChannel, onToggleFavorite, onNavigate, recents, canManageSportsChannel, homeFeatureType }: HomeViewProps) {
  const favoritesRef = useRef(favorites);
  const [heroItem, setHeroItem] = useState<CatalogItem | null>(null);
  const [heroInfo, setHeroInfo] = useState<ContentInfo | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [movies, setMovies] = useState<CatalogItem[]>([]);
  const [series, setSeries] = useState<CatalogItem[]>([]);
  const [heroImageLoading, setHeroImageLoading] = useState(true);
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  const [sportsChannel, setSportsChannel] = useState<Channel | null>(null);
  const [choosingSportsChannel, setChoosingSportsChannel] = useState(false);
  const [sportsChannelQuery, setSportsChannelQuery] = useState('');
  const [sportsChannelResults, setSportsChannelResults] = useState<Channel[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [renewalOpen, setRenewalOpen] = useState(false);
  const [renewalChecking, setRenewalChecking] = useState(false);
  const [renewalCompleted, setRenewalCompleted] = useState(false);
  const renewalBaselineRef = useRef<{ expiresAt: number; days: number } | null>(null);
  const catalogRequestRef = useRef(false);

  useEffect(() => { favoritesRef.current = favorites; }, [favorites]);

  useEffect(() => {
    let active = true;
    const timers: number[] = [];
    const refreshSportsChannel = async () => {
      const saved = storage.getSportsChannel();
      const wantedName = saved?.name || 'Agenda esportiva';
      const items = (await searchChannels(wantedName, 60)).filter((item) => item.category === 'live' && Boolean(item.url?.trim()));
      if (!active) return;
      const normalized = wantedName.trim().toLocaleLowerCase('pt-BR');
      const channel = items.find((item) => item.name.trim().toLocaleLowerCase('pt-BR') === normalized)
        || items.find((item) => item.name.toLocaleLowerCase('pt-BR').includes('agenda esportiva'))
        || items[0];
      if (channel) {
        setSportsChannel(channel);
        storage.saveSportsChannel(channel);
        timers.forEach(window.clearTimeout);
      }
    };
    void refreshSportsChannel();
    timers.push(window.setTimeout(() => void refreshSportsChannel(), 2000));
    timers.push(window.setTimeout(() => void refreshSportsChannel(), 5000));
    return () => { active = false; timers.forEach(window.clearTimeout); };
  }, []);

  useEffect(() => {
    if (!choosingSportsChannel || sportsChannelQuery.trim().length < 2) { setSportsChannelResults([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      void searchChannels(sportsChannelQuery, 24).then((items) => {
        if (active) setSportsChannelResults(items.filter((item) => !/\/movie\/|\/series\//i.test(item.url)).slice(0, 8));
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [choosingSportsChannel, sportsChannelQuery]);

  const chooseSportsChannel = (channel: Channel) => {
    setSportsChannel(channel);
    storage.saveSportsChannel(channel);
    setChoosingSportsChannel(false);
    setSportsChannelQuery('');
    setSportsChannelResults([]);
  };

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
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const applyCatalog = async (catalog: { movies: CatalogItem[]; series: CatalogItem[] }) => {
      if (!active) return;
      const movieItems = catalog.movies ?? [];
      const seriesItems = catalog.series ?? [];
      [...movieItems, ...seriesItems].forEach((item) => { if (favoritesRef.current.has(item.id)) storage.saveFavoriteItem(item); });
      const featured = homeFeatureType === 'latest_series' ? seriesItems[0] ?? null : movieItems[0] ?? null;
      setHeroItem((current) => {
        if (current?.id !== featured?.id) setHeroImageLoading(Boolean(featured));
        return featured;
      });
      setMovies((homeFeatureType === 'latest_movie' && featured) ? movieItems.filter((item) => item.id !== featured.id).slice(0, 10) : movieItems.slice(0, 10));
      setSeries((homeFeatureType === 'latest_series' && featured) ? seriesItems.filter((item) => item.id !== featured.id).slice(0, 10) : seriesItems.slice(0, 10));
      if (!featured) { setHeroInfo(null); setHeroImageLoading(false); return; }
      if (featured.contentType === 'series') {
        setHeroInfo({ name: featured.name, plot: featured.plot, genre: featured.genre, rating: featured.rating, backdrop: featured.backdrop, cover: featured.logo });
      } else {
        const info = await loadContentInfo(featured);
        if (active) setHeroInfo(info);
      }
    };
    const refreshCatalog = async (force = false) => {
      if (catalogRequestRef.current) return;
      catalogRequestRef.current = true;
      try {
        const catalog = await loadHomeCatalog(force);
        if (catalog) await applyCatalog(catalog);
      } catch (error) {
        console.warn('Não foi possível carregar a vitrine da Home:', error);
      } finally {
        catalogRequestRef.current = false;
      }
    };
    void loadAccountStatus().then((status) => { if (active) setAccountStatus(status); });
    void readCachedHomeCatalog().then((cached) => {
      if (!active) return;
      if (cached) void applyCatalog(cached.value);
      if (!cached || Date.now() - cached.savedAt >= 20 * 60_000) void refreshCatalog(false);
    });
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refreshCatalog(true); }, 30 * 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [homeFeatureType]);

  const heroBackground = heroInfo?.backdrop || heroItem?.backdrop;
  const heroPosterFallback = heroInfo?.cover || heroItem?.logo;
  const releaseYear = heroInfo?.releaseDate?.match(/\b(19|20)\d{2}\b/)?.[0];
  const rawHeroRating = heroInfo?.rating || heroItem?.rating;
  const heroRating = validRating(rawHeroRating) ? rawHeroRating : undefined;
  const duration = heroInfo?.duration && !/^(?:0+:)+0+$/.test(heroInfo.duration.trim()) && !/^0+\s*(?:min|mins|minutos?)$/i.test(heroInfo.duration.trim()) ? heroInfo.duration : undefined;
  const metadata = [heroRating, releaseYear, duration, heroInfo?.genre].filter(Boolean);
  const rawRenewalUrl = accountStatus?.renewalUrl || import.meta.env.VITE_RENEWAL_URL as string | undefined;
  const renewalUrl = (() => { try { const url = new URL(rawRenewalUrl || ''); return /^https?:$/.test(url.protocol) ? url.toString() : undefined; } catch { return undefined; } })();
  const trailerUrl = heroInfo?.trailerKey ? (/^https?:\/\//i.test(heroInfo.trailerKey) ? heroInfo.trailerKey : `https://www.youtube.com/watch?v=${encodeURIComponent(heroInfo.trailerKey)}`) : undefined;
  const currentTime = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(now);
  const currentDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(now).replace('.', '');

  return (
    <div className="home-page -mx-5 sm:-mx-8 lg:-mx-10 lg:-mt-8">
      <section className="home-hero">
        <div className={`hero-visual ${infoPanelOpen ? 'hero-visual-panel-open' : ''}`}>
        {heroImageLoading && <div className="absolute inset-0 z-[1] flex items-center justify-center bg-[#091018]"><div className="flex flex-col items-center gap-3 text-xs text-white/35"><LoaderCircle className="h-8 w-8 animate-spin text-emerald-400/70" />Carregando destaque</div></div>}
        {heroBackground ? <img src={heroBackground} alt="" onLoad={() => setHeroImageLoading(false)} onError={() => setHeroImageLoading(false)} className="home-hero-image" /> : heroPosterFallback ? <img src={heroPosterFallback} alt="" onLoad={() => setHeroImageLoading(false)} onError={() => setHeroImageLoading(false)} className="home-hero-image home-hero-poster-fallback" /> : null}
        <div className="home-hero-shade" />
        {!infoPanelOpen && <button onClick={() => setInfoPanelOpen(true)} className="absolute right-5 top-6 z-20 flex items-center gap-2 rounded-xl border border-white/10 bg-[#091018]/75 px-3 py-2 text-xs font-medium text-white/70 backdrop-blur-xl transition hover:border-emerald-400/30 hover:text-white sm:right-8 lg:right-12" aria-label="Abrir informações"><PanelRightOpen className="h-4 w-4" /> Informações</button>}
        <div className="relative z-10 flex min-h-[100svh] max-w-3xl flex-col justify-end px-5 pb-40 pt-32 sm:px-8 lg:px-12 lg:pb-48">
          <span className="mb-4 flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300 backdrop-blur-md"><Sparkles className="h-3.5 w-3.5" /> {homeFeatureType === 'latest_series' ? 'Última série adicionada' : 'Último filme adicionado'}</span>
          {heroInfo?.titleLogo ? <><img src={heroInfo.titleLogo} alt={heroInfo.name || heroItem?.name || ''} className="mb-2 max-h-40 w-auto max-w-[min(80vw,420px)] object-contain object-left" /><h1 className="sr-only">{heroInfo.name || heroItem?.name}</h1></> : <h1 className="max-w-2xl text-4xl font-semibold leading-[0.95] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">{heroInfo?.name || heroItem?.name || 'Seu entretenimento em um só lugar'}</h1>}
          {metadata.length > 0 && <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-medium text-white/70">{heroRating && <span className="flex items-center gap-1 text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />{heroRating}</span>}{releaseYear && <span>{releaseYear}</span>}{duration && <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{duration}</span>}{heroInfo?.genre && <span>{heroInfo.genre}</span>}</div>}
          <p className="mt-4 line-clamp-3 max-w-2xl text-sm leading-6 text-white/62">{heroInfo?.plot || 'Filmes, séries e canais ao vivo reunidos em uma experiência simples, rápida e cinematográfica.'}</p>
          {(heroInfo?.director || heroInfo?.cast) && <p className="mt-3 line-clamp-1 text-xs text-white/38"><span className="text-white/65">{heroInfo.director ? 'Direção:' : 'Elenco:'}</span> {heroInfo.director || heroInfo.cast}</p>}
          {heroItem && <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => heroItem.contentType === 'series' ? onNavigate('series') : onSelectChannel(heroItem)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"><Play className="h-4 w-4 fill-current" /> Reproduzir</button>{trailerUrl && <button onClick={() => window.open(trailerUrl, '_blank', 'noopener,noreferrer')} className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/10 px-5 py-3 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/15"><Play className="h-4 w-4 fill-current" /> Trailer</button>}<button onClick={() => onToggleFavorite(heroItem.id, heroItem)} className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/10 px-5 py-3 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/15"><Heart className={`h-4 w-4 ${favorites.has(heroItem.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} /> {favorites.has(heroItem.id) ? 'Favoritado' : 'Favoritos'}</button></div>}
        </div>
        </div>
        <aside className={`hero-info-panel ${infoPanelOpen ? 'hero-info-panel-open' : ''}`} aria-hidden={!infoPanelOpen}>
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4"><div className="flex min-w-0 items-center gap-2"><Radio className="h-4 w-4 shrink-0 text-emerald-400" /><span className="truncate text-sm font-semibold text-white">{sportsChannel?.name || 'Agenda esportiva'}</span></div><div className="flex items-center gap-3"><div className="text-right"><strong className="block text-base font-semibold tabular-nums text-white">{currentTime}</strong><span className="block text-[9px] uppercase tracking-wider text-white/30">{currentDate}</span></div><button onClick={() => setInfoPanelOpen(false)} className="rounded-lg p-2 text-white/40 transition hover:bg-white/8 hover:text-white" aria-label="Fechar informações"><X className="h-4 w-4" /></button></div></div>
          <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-none">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/30">
              <div className="aspect-video">{infoPanelOpen ? <VideoPlayer channel={sportsChannel} startMuted /> : null}</div>
            </div>
            <div className="mt-3 rounded-2xl bg-white/[0.025] p-3">
              <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2">{sportsChannel?.logo ? <img src={sportsChannel.logo} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-black/20 object-contain p-1" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300"><Tv className="h-4 w-4" /></span>}<span className="min-w-0"><strong className="block truncate text-xs text-white">{sportsChannel?.name || 'Procurando Agenda esportiva...'}</strong><span className="block truncate text-[10px] text-white/35">{sportsChannel?.group || 'Canal ao vivo'}</span></span></div>{canManageSportsChannel && <button onClick={() => setChoosingSportsChannel((value) => !value)} className="shrink-0 rounded-lg border border-emerald-400/20 px-3 py-2 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-400/10">{choosingSportsChannel ? 'Cancelar' : 'Trocar canal'}</button>}</div>
              {canManageSportsChannel && choosingSportsChannel && <div className="mt-3 border-t border-white/8 pt-3"><input autoFocus value={sportsChannelQuery} onChange={(event) => setSportsChannelQuery(event.target.value)} placeholder="Digite o nome do canal..." className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs text-white outline-none placeholder:text-white/25 focus:border-emerald-400/40" />{sportsChannelResults.length > 0 && <div className="mt-2 max-h-48 space-y-1 overflow-y-auto scrollbar-none">{sportsChannelResults.map((channel) => <button key={channel.id} onClick={() => chooseSportsChannel(channel)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-white/7">{channel.logo ? <img src={channel.logo} alt="" className="h-7 w-7 rounded object-contain" /> : <Tv className="h-4 w-4 text-white/25" />}<span className="min-w-0 flex-1 truncate text-xs text-white/70">{channel.name}</span></button>)}</div>}{sportsChannelQuery.trim().length >= 2 && sportsChannelResults.length === 0 && <p className="pt-3 text-center text-[11px] text-white/30">Nenhum canal encontrado</p>}</div>}
            </div>
          </div>
          <div className="space-y-3 border-t border-white/8 p-5">
            {accountStatus?.daysRemaining != null && accountStatus.daysRemaining <= 10 && <div className="subscription-card"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/12 text-emerald-300"><CalendarClock className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-[10px] uppercase tracking-[0.16em] text-white/35">Sua assinatura</span><strong className="block text-sm font-semibold text-white">{accountStatus.daysRemaining === 0 ? 'Sua assinatura vence hoje' : accountStatus.daysRemaining === 1 ? 'Sua assinatura vence em 1 dia' : `Sua assinatura vence em ${accountStatus.daysRemaining} dias`}</strong></span><button disabled={!renewalUrl} onClick={openRenewal} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-45" title={!renewalUrl ? 'Link de pagamento não cadastrado' : undefined}>Renovar</button></div>}
            <button onClick={() => onNavigate('continue')} className="flex w-full items-center gap-3 rounded-xl bg-emerald-400 px-4 py-3 text-left text-slate-950 transition hover:bg-emerald-300"><History className="h-5 w-5" /><span className="min-w-0 flex-1"><strong className="block text-sm font-semibold">Continuar assistindo</strong><span className="block truncate text-[11px] text-slate-900/60">{recents.length ? `${recents.length} itens no seu histórico` : 'Seus últimos conteúdos'}</span></span><ChevronRight className="h-4 w-4" /></button>
          </div>
        </aside>
      </section>
      {renewalOpen && renewalUrl && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-5 backdrop-blur-md" onClick={() => setRenewalOpen(false)}><div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#101a21] p-6 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="mb-5 flex items-center justify-between text-left"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">Renovação</p><h2 className="mt-1 text-xl font-semibold text-white">Renove pelo celular</h2></div><button onClick={() => setRenewalOpen(false)} className="rounded-xl p-2 text-white/35 transition hover:bg-white/8 hover:text-white"><X className="h-5 w-5" /></button></div>{renewalCompleted ? <div className="py-8"><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" /><h3 className="mt-4 text-lg font-semibold text-white">Renovação concluída</h3><p className="mt-2 text-sm text-white/45">A nova validade foi confirmada pelo provedor.</p><button onClick={() => setRenewalOpen(false)} className="mt-6 w-full rounded-xl bg-emerald-400 py-3 text-sm font-semibold text-slate-950">Concluir</button></div> : <><div className="mx-auto w-fit rounded-2xl bg-white p-4"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=190x190&format=png&data=${encodeURIComponent(renewalUrl)}`} width="190" height="190" alt="QR Code para renovação" className="block h-[190px] w-[190px]" /></div><p className="mt-4 text-xs leading-5 text-white/45">Aponte a câmera do celular para o QR Code e conclua o pagamento na página do provedor.</p><a href={renewalUrl} target="_blank" rel="noreferrer" className="mt-4 block w-full rounded-xl bg-emerald-400 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">Abrir página de pagamento</a><button onClick={() => void verifyRenewal()} disabled={renewalChecking} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 py-3 text-xs font-medium text-white/65 transition hover:bg-white/5 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${renewalChecking ? 'animate-spin' : ''}`} />{renewalChecking ? 'Verificando...' : 'Já paguei, verificar renovação'}</button></>}</div></div>}
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
