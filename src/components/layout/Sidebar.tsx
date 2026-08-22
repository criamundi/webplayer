import { Clapperboard, Film, Heart, Home, LogOut, Radio, Search, Settings, Tv } from 'lucide-react';

export type View = 'home' | 'live' | 'movies' | 'series' | 'favorites' | 'search' | 'settings';
const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Início', icon: Home }, { id: 'live', label: 'Canais ao Vivo', icon: Radio },
  { id: 'movies', label: 'Filmes', icon: Film }, { id: 'series', label: 'Séries', icon: Clapperboard },
  { id: 'favorites', label: 'Favoritos', icon: Heart },
];
const secondaryItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'search', label: 'Buscar', icon: Search }, { id: 'settings', label: 'Configurações', icon: Settings },
];
interface SidebarProps { view: View; setView: (v: View) => void; open: boolean; onClose: () => void; onSignOut: () => void; }

export function Sidebar({ view, setView, open, onClose, onSignOut }: SidebarProps) {
  const navigate = (v: View) => { setView(v); onClose(); };
  const itemClass = (active: boolean) => `sidebar-item ${active ? 'sidebar-item-active' : ''}`;
  return <>
    {open && <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={onClose} />}
    <aside className={`sidebar-shell group/sidebar ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="mb-10 flex h-12 items-center overflow-hidden px-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-400/15"><Tv className="h-5 w-5" /></span>
        <span className="sidebar-label ml-3 whitespace-nowrap text-sm font-bold tracking-wider">NEXUS PLAY</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1.5 px-3">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={itemClass(view === id)} title={label}><Icon className="h-5 w-5 shrink-0" /><span className="sidebar-label">{label}</span></button>)}
        <div className="my-3 h-px bg-white/10" />
        {secondaryItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={itemClass(view === id)} title={label}><Icon className="h-5 w-5 shrink-0" /><span className="sidebar-label">{label}</span></button>)}
      </nav>
      <button onClick={onSignOut} className="sidebar-item mx-3 mb-5 w-[calc(100%-1.5rem)]" title="Sair"><LogOut className="h-5 w-5 shrink-0" /><span className="sidebar-label">Sair</span></button>
    </aside>
  </>;
}
