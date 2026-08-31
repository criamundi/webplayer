import { useEffect, useState } from 'react';
import { Bell, CalendarDays, Menu, Search, Tv, UserRound } from 'lucide-react';

interface TopBarProps {
  query: string;
  setQuery: (q: string) => void;
  onMenuOpen: () => void;
  onSignOut: () => void;
  home?: boolean;
}

export function TopBar({ query, setQuery, onMenuOpen, onSignOut, home = false }: TopBarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const sync = () => setNow(new Date());
    sync();
    const timer = window.setInterval(sync, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const formattedDate = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <header className={`relative z-30 flex items-center justify-between gap-5 py-5 lg:py-0 ${home ? 'pointer-events-none' : ''}`}>
      <div className="flex items-center gap-3 lg:hidden">
        <button onClick={onMenuOpen} className="rounded-xl bg-white/5 p-2.5 text-white/70">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-lime-300 text-slate-950">
            <Tv className="h-4 w-4" />
          </div>
          <span className="text-sm font-bold tracking-wide">NEXUS PLAY</span>
        </div>
      </div>

      <div className={`relative hidden max-w-sm flex-1 lg:block ${home ? 'invisible' : ''}`}>
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="O que você quer assistir?"
          className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-lime-300/40 focus:bg-white/10"
        />
      </div>

      <div className={`flex items-center gap-3 ${home ? 'pointer-events-auto' : ''}`}>
        <div className="hidden items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 sm:flex">
          <CalendarDays className="h-4 w-4 text-lime-300" />
          <div>
            <p className="text-xs font-medium text-white/80">{formattedDate}</p>
            <p className="text-[10px] text-white/35">{formattedTime}</p>
          </div>
        </div>
        <button className="relative rounded-2xl border border-white/10 bg-white/5 p-3 text-white/60 transition hover:bg-white/10 hover:text-white">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-lime-300" />
        </button>
        <button
          onClick={onSignOut}
          className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-2 pr-3 transition hover:bg-white/10"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-orange-300 to-rose-400 text-slate-900">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-xs font-semibold text-white/90">Conectado</span>
            <span className="block text-[10px] text-white/35">Toque para sair</span>
          </span>
        </button>
      </div>
    </header>
  );
}
