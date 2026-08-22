import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Film, Play, Radio, Sparkles, Tv } from 'lucide-react';
import type { Channel } from '@/types';
import { getChannels } from '@/lib/playlistStore';
import type { View } from '@/components/layout/Sidebar';

interface HomeViewProps { onSelectChannel: (ch: Channel) => void; onNavigate: (view: View) => void; }
interface PosterShelfProps { title: string; items: Channel[]; onViewAll: () => void; onSelect: (channel: Channel) => void; }

function PosterShelf({ title, items, onViewAll, onSelect }: PosterShelfProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scroll = (direction: -1 | 1) => trackRef.current?.scrollBy({ left: direction * trackRef.current.clientWidth, behavior: 'smooth' });

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
                <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition group-hover:opacity-100"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400 text-slate-950 shadow-xl shadow-emerald-400/25"><Play className="ml-0.5 h-5 w-5 fill-current" /></span></span>
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

export function HomeView({ onSelectChannel, onNavigate }: HomeViewProps) {
  const [movies, setMovies] = useState<Channel[]>([]);
  const [series, setSeries] = useState<Channel[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([getChannels('movies', 10, 0), getChannels('series', 10, 0)]).then(([movieItems, seriesItems]) => {
      if (!active) return;
      setMovies(movieItems); setSeries(seriesItems);
    }).catch((error) => console.warn('Não foi possível carregar a vitrine da Home:', error));
    return () => { active = false; };
  }, []);

  const heroItem = movies.find((item) => item.logo) ?? series.find((item) => item.logo);

  return (
    <div className="home-page -mx-5 -mt-[68px] sm:-mx-8 lg:-mx-10 lg:-mt-20">
      <section className="home-hero">
        {heroItem?.logo && <img src={heroItem.logo} alt="" className="home-hero-image" />}
        <div className="home-hero-shade" />
        <div className="relative z-10 flex min-h-[410px] max-w-2xl flex-col justify-end px-5 pb-12 pt-32 sm:px-8 lg:min-h-[470px] lg:px-12 lg:pb-16">
          <span className="mb-4 flex w-fit items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300 backdrop-blur-md"><Sparkles className="h-3.5 w-3.5" /> Destaque</span>
          <h1 className="max-w-xl text-4xl font-semibold leading-[0.95] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">{heroItem?.name ?? 'Seu entretenimento em um só lugar'}</h1>
          <p className="mt-4 line-clamp-2 max-w-lg text-sm leading-6 text-white/55">Filmes, séries e canais ao vivo reunidos em uma experiência simples, rápida e cinematográfica.</p>
        </div>
      </section>
      <div className="relative z-20 -mt-3 px-5 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[{ id: 'live' as View, label: 'Canais ao Vivo', icon: Radio }, { id: 'movies' as View, label: 'Filmes', icon: Film }, { id: 'series' as View, label: 'Séries', icon: Tv }].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => onNavigate(id)} className="home-shortcut group"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400 transition group-hover:bg-emerald-400 group-hover:text-slate-950"><Icon className="h-5 w-5" /></span><span className="font-medium text-white/85">{label}</span><ChevronRight className="ml-auto h-4 w-4 text-white/20 transition group-hover:translate-x-1 group-hover:text-emerald-400" /></button>
          ))}
        </div>
        <div className="space-y-12 pb-16 pt-10">
          <PosterShelf title="Últimos filmes adicionados" items={movies} onViewAll={() => onNavigate('movies')} onSelect={onSelectChannel} />
          <PosterShelf title="Últimas séries adicionadas" items={series} onViewAll={() => onNavigate('series')} onSelect={onSelectChannel} />
        </div>
      </div>
    </div>
  );
}
