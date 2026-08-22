import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Film, Heart, Play, Radio, Sparkles, Star, Tv } from 'lucide-react';
import type { Channel } from '@/types';
import { getChannels } from '@/lib/playlistStore';
import { loadContentInfo, type ContentInfo } from '@/lib/provider';
import type { View } from '@/components/layout/Sidebar';

interface HomeViewProps {
  favorites: Set<string>;
  onSelectChannel: (ch: Channel) => void;
  onToggleFavorite: (id: string) => void;
  onNavigate: (view: View) => void;
}
interface PosterShelfProps { title: string; items: Channel[]; onViewAll: () => void; onSelect: (channel: Channel) => void; }

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
                {channel.logo ? <img src={channel.logo} alt={channel.name} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center"><Tv className="h-10 w-10 text-white/15" /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/0 to-black/10" />
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

function seriesTitle(name: string) {
  return name.replace(/\s+(?:S\d{1,3}E\d{1,4}|\d{1,3}x\d{1,4})(?:\s.*)?$/i, '').trim();
}

function uniqueRecentSeries(items: Channel[]) {
  const seen = new Set<string>();
  const result: Channel[] = [];
  for (const item of items) {
    const title = seriesTitle(item.name);
    const key = title.toLocaleLowerCase('pt-BR');
    if (!title || seen.has(key)) continue;
    seen.add(key);
    result.push({ ...item, name: title });
    if (result.length === 10) break;
  }
  return result;
}

export function HomeView({ favorites, onSelectChannel, onToggleFavorite, onNavigate }: HomeViewProps) {
  const [heroItem, setHeroItem] = useState<Channel | null>(null);
  const [heroInfo, setHeroInfo] = useState<ContentInfo | null>(null);
  const [movies, setMovies] = useState<Channel[]>([]);
  const [series, setSeries] = useState<Channel[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([getChannels('movies', 11, 0), getChannels('series', 150, 0)]).then(([movieItems, seriesItems]) => {
      if (!active) return;
      const featured = movieItems[0] ?? null;
      setHeroItem(featured);
      setMovies(featured ? movieItems.filter((item) => item.id !== featured.id).slice(0, 10) : movieItems.slice(0, 10));
      setSeries(uniqueRecentSeries(seriesItems));
      if (featured) void loadContentInfo(featured).then((info) => { if (active) setHeroInfo(info); });
    }).catch((error) => console.warn('Não foi possível carregar a vitrine da Home:', error));
    return () => { active = false; };
  }, []);

  const heroBackground = heroInfo?.backdrop || heroInfo?.cover || heroItem?.logo;
  const releaseYear = heroInfo?.releaseDate?.match(/\b(19|20)\d{2}\b/)?.[0];
  const metadata = [heroInfo?.rating, releaseYear, heroInfo?.duration, heroInfo?.genre].filter(Boolean);

  return (
    <div className="home-page -mx-5 -mt-[68px] sm:-mx-8 lg:-mx-10 lg:-mt-20">
      <section className="home-hero">
        {heroBackground && <img src={heroBackground} alt="" className="home-hero-image" />}
        <div className="home-hero-shade" />
        <div className="relative z-10 flex min-h-[100svh] max-w-2xl flex-col justify-end px-5 pb-40 pt-32 sm:px-8 lg:px-12 lg:pb-48">
          <span className="mb-4 flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300 backdrop-blur-md"><Sparkles className="h-3.5 w-3.5" /> Destaque</span>
          <h1 className="max-w-2xl text-4xl font-semibold leading-[0.95] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">{heroInfo?.name || heroItem?.name || 'Seu entretenimento em um só lugar'}</h1>
          {metadata.length > 0 && <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-medium text-white/70">{heroInfo?.rating && <span className="flex items-center gap-1 text-amber-300"><Star className="h-3.5 w-3.5 fill-current" />{heroInfo.rating}</span>}{releaseYear && <span>{releaseYear}</span>}{heroInfo?.duration && <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{heroInfo.duration}</span>}{heroInfo?.genre && <span>{heroInfo.genre}</span>}</div>}
          <p className="mt-4 line-clamp-3 max-w-2xl text-sm leading-6 text-white/62">{heroInfo?.plot || 'Filmes, séries e canais ao vivo reunidos em uma experiência simples, rápida e cinematográfica.'}</p>
          {heroInfo?.cast && <p className="mt-3 line-clamp-1 text-xs text-white/38"><span className="text-white/65">Elenco:</span> {heroInfo.cast}</p>}
          {heroItem && <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => onSelectChannel(heroItem)} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"><Play className="h-4 w-4 fill-current" /> Reproduzir</button><button onClick={() => onToggleFavorite(heroItem.id)} className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/10 px-5 py-3 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/15"><Heart className={`h-4 w-4 ${favorites.has(heroItem.id) ? 'fill-emerald-400 text-emerald-400' : ''}`} /> {favorites.has(heroItem.id) ? 'Favoritado' : 'Favoritos'}</button></div>}
        </div>
      </section>
      <div className="relative z-20 -mt-28 px-5 sm:px-8 lg:-mt-32 lg:px-12">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[{ id: 'live' as View, label: 'Canais ao Vivo', icon: Radio }, { id: 'movies' as View, label: 'Filmes', icon: Film }, { id: 'series' as View, label: 'Séries', icon: Tv }].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => onNavigate(id)} className="home-shortcut group"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400 transition group-hover:bg-emerald-400 group-hover:text-slate-950"><Icon className="h-5 w-5" /></span><span className="font-medium text-white/85">{label}</span><ChevronRight className="ml-auto h-4 w-4 text-white/20 transition group-hover:translate-x-1 group-hover:text-emerald-400" /></button>
          ))}
        </div>
        <div className="space-y-12 pb-16 pt-10">
          <PosterShelf title="Filmes recentemente adicionados" items={movies} onViewAll={() => onNavigate('movies')} onSelect={onSelectChannel} />
          <PosterShelf title="Séries recentemente adicionadas" items={series} onViewAll={() => onNavigate('series')} onSelect={onSelectChannel} />
        </div>
      </div>
    </div>
  );
}
