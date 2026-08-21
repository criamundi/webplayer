import { Clapperboard, Film, Heart, Home, LogOut, Menu, Radio, Search, Settings, Tv } from 'lucide-react';

export type View = 'home' | 'live' | 'movies' | 'series' | 'favorites' | 'search' | 'settings';

const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Início', icon: Home },
  { id: 'live', label: 'TV ao Vivo', icon: Radio },
  { id: 'movies', label: 'Filmes', icon: Film },
  { id: 'series', label: 'Séries', icon: Clapperboard },
  { id: 'favorites', label: 'Favoritos', icon: Heart },
];

const secondaryItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'search', label: 'Buscar', icon: Search },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

interface SidebarProps {
  view: View;
  setView: (v: View) => void;
  open: boolean;
  onClose: () => void;
  onSignOut: () => void;
}

export function Sidebar({ view, setView, open, onClose, onSignOut }: SidebarProps) {
  const navigate = (v: View) => {
    setView(v);
    onClose();
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/10 bg-[#0d1720]/95 px-5 py-6 backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-20 lg:translate-x-0 lg:items-center lg:bg-transparent lg:px-0 lg:py-8 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-10 flex items-center gap-3 lg:mb-14 lg:flex-col">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lime-300 text-slate-950 shadow-lg shadow-lime-300/20">
            <Tv className="h-6 w-6" />
          </div>
          <div className="lg:hidden">
            <span className="block text-sm font-bold tracking-wide">NEXUS PLAY</span>
            <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-[0.18em] text-lime-300/70">Beta 0.1</span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5 lg:items-center">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition lg:w-12 lg:justify-center lg:px-0 ${
                view === id
                  ? 'bg-lime-300 text-slate-950 shadow-lg shadow-lime-300/10'
                  : 'text-white/45 hover:bg-white/10 hover:text-white'
              }`}
              title={label}
            >
              <Icon className="h-5 w-5" />
              <span className="text-sm font-medium lg:hidden">{label}</span>
            </button>
          ))}

          <div className="my-3 h-px w-full bg-white/10 lg:w-8" />

          {secondaryItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition lg:w-12 lg:justify-center lg:px-0 ${
                view === id
                  ? 'bg-white/10 text-white'
                  : 'text-white/45 hover:bg-white/10 hover:text-white'
              }`}
              title={label}
            >
              <Icon className="h-5 w-5" />
              <span className="text-sm font-medium lg:hidden">{label}</span>
            </button>
          ))}
        </nav>

        <button
          onClick={onSignOut}
          className="mt-auto flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-white/45 transition hover:bg-white/10 hover:text-white lg:w-12 lg:justify-center lg:px-0"
          title="Sair"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-sm font-medium lg:hidden">Sair</span>
        </button>
      </aside>
    </>
  );
}
