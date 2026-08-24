import { Clapperboard, Film, History, Radio } from 'lucide-react';
import type { Channel } from '@/types';
import { ChannelCard } from '@/components/shared/ChannelCard';

interface ContinueWatchingViewProps {
  recents: Channel[];
  favorites: Set<string>;
  onSelectChannel: (channel: Channel) => void;
  onToggleFavorite: (id: string) => void;
}

function kind(channel: Channel): 'movies' | 'series' | 'live' {
  const value = `${channel.group || ''} ${channel.url}`.toLocaleLowerCase('pt-BR');
  if (/\/series\/|s[eé]ries?|temporada|epis[oó]dio/.test(value)) return 'series';
  if (/\/movie\/|filmes?|vod|cinema/.test(value)) return 'movies';
  return 'live';
}

const sections = [
  { id: 'movies' as const, title: 'Filmes assistidos', icon: Film },
  { id: 'series' as const, title: 'Séries assistidas', icon: Clapperboard },
  { id: 'live' as const, title: 'Canais assistidos', icon: Radio },
];

export function ContinueWatchingView({ recents, favorites, onSelectChannel, onToggleFavorite }: ContinueWatchingViewProps) {
  return <div className="mt-6 pb-16">
    <div className="mb-8 flex items-center gap-3"><span className="rounded-xl bg-emerald-400/12 p-2.5 text-emerald-300"><History className="h-5 w-5" /></span><div><h1 className="text-2xl font-semibold tracking-tight">Continuar assistindo</h1><p className="text-xs text-white/40">Seus últimos filmes, séries e canais</p></div></div>
    {recents.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-white/8 bg-white/[0.025] text-center"><History className="mb-4 h-11 w-11 text-white/12" /><p className="text-sm font-medium text-white/55">Nada assistido ainda</p><p className="mt-1 text-xs text-white/30">O conteúdo reproduzido aparecerá aqui automaticamente.</p></div> : <div className="space-y-10">{sections.map(({ id, title, icon: Icon }) => { const items = recents.filter((item) => kind(item) === id); if (!items.length) return null; return <section key={id}><div className="mb-4 flex items-center gap-2"><Icon className="h-4 w-4 text-emerald-400" /><h2 className="text-lg font-semibold">{title}</h2></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{items.map((item) => <ChannelCard key={item.id} channel={item} isFavorite={favorites.has(item.id)} onSelect={onSelectChannel} onToggleFavorite={onToggleFavorite} />)}</div></section>; })}</div>}
  </div>;
}
