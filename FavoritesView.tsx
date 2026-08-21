import { useEffect, useMemo, useState } from 'react';
import { Heart, Search } from 'lucide-react';
import type { Channel } from '@/types';
import { ChannelCard } from '@/components/shared/ChannelCard';

interface FavoritesViewProps {
  favorites: Set<string>;
  onSelectChannel: (ch: Channel) => void;
  onToggleFavorite: (id: string) => void;
  loadFavorites: () => Promise<Channel[]>;
}

export function FavoritesView({ favorites, onSelectChannel, onToggleFavorite, loadFavorites }: FavoritesViewProps) {
  const [query, setQuery] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadFavorites().then((items) => { if (!cancelled) setChannels(items); });
    return () => { cancelled = true; };
  }, [favorites, loadFavorites]);

  const favoriteChannels = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    return channels.filter((c) => !q || c.name.toLocaleLowerCase('pt-BR').includes(q));
  }, [channels, query]);

  return (
    <div className="mt-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-amber-400/15 p-2.5 text-amber-300"><Heart className="h-5 w-5 fill-amber-300" /></div><div><h1 className="text-2xl font-semibold tracking-tight">Favoritos</h1><p className="text-xs text-white/40">{favorites.size} itens marcados</p></div></div>
        {favorites.size > 0 && <div className="relative max-w-xs flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nos favoritos..." className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/25" /></div>}
      </div>
      {favorites.size === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center"><Heart className="mb-4 h-12 w-12 text-white/15" /><p className="text-sm font-medium text-white/50">Nenhum favorito ainda</p></div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{favoriteChannels.map((ch) => <ChannelCard key={ch.id} channel={ch} isFavorite onSelect={onSelectChannel} onToggleFavorite={onToggleFavorite} />)}</div>
      )}
    </div>
  );
}
