import { useEffect, useRef, useState } from 'react';
import { Search, Tv2 } from 'lucide-react';
import type { Channel } from '@/types';
import { ChannelCard } from '@/components/shared/ChannelCard';
import { searchChannels } from '@/lib/playlistStore';

interface SearchViewProps {
  favorites: Set<string>;
  onSelectChannel: (ch: Channel) => void;
  onToggleFavorite: (id: string) => void;
  initialQuery?: string;
  totalCount: number;
}

export function SearchView({ favorites, onSelectChannel, onToggleFavorite, initialQuery = '', totalCount }: SearchViewProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Channel[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchChannels(q, 120)
        .then((items) => { if (!cancelled) setResults(items); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className="mt-6">
      <div className="mb-8 max-w-xl">
        <p className="mb-2 text-sm font-medium text-lime-300">Pesquisa</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Encontre algo para assistir</h1>
        <div className="relative mt-6"><Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/30" /><input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Digite o nome de um canal, filme ou série..." className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 pl-12 pr-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-lime-300/40 focus:bg-white/10" /></div>
        {hasQuery && <p className="mt-3 text-xs text-white/40">{searching ? 'Pesquisando…' : `${results.length} resultado${results.length !== 1 ? 's' : ''} (máximo 120)`}</p>}
      </div>
      {!hasQuery && <div className="flex flex-col items-center justify-center py-16 text-center"><Search className="mb-4 h-12 w-12 text-white/15" /><p className="text-sm text-white/40">Digite algo para buscar em toda a playlist</p><p className="mt-2 text-xs text-white/30">{totalCount.toLocaleString('pt-BR')} itens indexados</p></div>}
      {hasQuery && !searching && results.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-center"><Tv2 className="mb-4 h-12 w-12 text-white/15" /><p className="text-sm font-medium text-white/50">Nenhum resultado encontrado</p></div>}
      {results.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{results.map((ch) => <ChannelCard key={ch.id} channel={ch} isFavorite={favorites.has(ch.id)} onSelect={onSelectChannel} onToggleFavorite={onToggleFavorite} />)}</div>}
    </div>
  );
}
