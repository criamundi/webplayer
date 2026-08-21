import { Clapperboard, Film, Heart, Radio } from 'lucide-react';
import type { Channel } from '@/types';
import { ChannelCard } from '@/components/shared/ChannelCard';
import { SectionHeading } from '@/components/shared/SectionHeading';
import type { View } from '@/components/layout/Sidebar';

interface HomeViewProps {
  channels: Channel[];
  recents: Channel[];
  favorites: Set<string>;
  onSelectChannel: (ch: Channel) => void;
  onToggleFavorite: (id: string) => void;
  onNavigate: (view: View) => void;
}

export function HomeView({ channels, recents, favorites, onSelectChannel, onToggleFavorite, onNavigate }: HomeViewProps) {
  return (
    <div className="mt-8 space-y-12">
      <div>
        <p className="text-sm font-medium text-lime-300">Nexus Play</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">O que você quer assistir?</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-white/45">A playlist é indexada em segundo plano. A interface mantém apenas uma janela pequena em memória para continuar rápida.</p>
        <div className="mt-8 grid max-w-4xl grid-cols-2 gap-4 sm:grid-cols-4">
          {([
            { id: 'live' as View, label: 'TV ao Vivo', icon: Radio },
            { id: 'movies' as View, label: 'Filmes', icon: Film },
            { id: 'series' as View, label: 'Séries', icon: Clapperboard },
            { id: 'favorites' as View, label: 'Favoritos', icon: Heart },
          ]).map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => onNavigate(id)} className="group flex min-h-28 flex-col items-center justify-center gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-center transition hover:-translate-y-1 hover:border-lime-300/40 hover:bg-lime-300/10"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-lime-300 transition group-hover:bg-lime-300 group-hover:text-slate-950"><Icon className="h-6 w-6" /></span><span className="text-sm font-semibold text-white/85">{label}</span></button>
          ))}
        </div>
      </div>
      {recents.length > 0 && <section><SectionHeading title="Assistidos recentemente" /><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{recents.slice(0, 6).map((ch) => <ChannelCard key={ch.id} channel={ch} isFavorite={favorites.has(ch.id)} onSelect={onSelectChannel} onToggleFavorite={onToggleFavorite} />)}</div></section>}
      {channels.length > 0 && <section><SectionHeading title="TV ao vivo" onViewAll={() => onNavigate('live')} /><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{channels.slice(0, 6).map((ch) => <ChannelCard key={ch.id} channel={ch} isFavorite={favorites.has(ch.id)} onSelect={onSelectChannel} onToggleFavorite={onToggleFavorite} />)}</div></section>}
    </div>
  );
}
