import { Clapperboard, Film, Heart, Home, Radio, Search, Settings, Tv } from 'lucide-react';

export type View = 'home' | 'live' | 'movies' | 'series' | 'favorites' | 'search' | 'settings';
const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Início', icon: Home }, { id: 'live', label: 'Canais ao Vivo', icon: Radio },
  { id: 'movies', label: 'Filmes', icon: Film }, { id: 'series', label: 'Séries', icon: Clapperboard },
  { id: 'favorites', label: 'Favoritos', icon: Heart },
];
const secondaryItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'search', label: 'Buscar', icon: Search }, { id: 'settings', label: 'Configurações', icon: Settings },
];
interface SidebarProps { view: View; setView: (v: View) => void; open: boolean; onClose: () => void; branding?: { app_name: string; logo_url: string | null; primary_color: string }; }

export function Sidebar({ view, setView, open, onClose, branding }: SidebarProps) {
  const navigate = (v: View) => { setView(v); onClose(); };
  const itemClass = (active: boolean) => `sidebar-item ${active ? 'sidebar-item-active' : ''}`;
  return <>
    {open && <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={onClose} />}
    <aside className={`sidebar-shell ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="mb-10 flex h-12 items-center overflow-hidden px-4">
        {branding?.logo_url ? <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden bg-transparent"><img src={branding.logo_url} alt="" className="block max-h-10 max-w-10 object-contain" style={{ background: 'transparent' }} /></span> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-400/15"><Tv className="h-5 w-5" /></span>}
        <span className="sidebar-label ml-3 max-w-36 truncate whitespace-nowrap text-sm font-bold tracking-wider">{(branding?.app_name || 'Nexus Play').toUpperCase()}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1.5 px-3">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={itemClass(view === id)} title={label}><Icon className="h-5 w-5 shrink-0" /><span className="sidebar-label">{label}</span></button>)}
        <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        {secondaryItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={itemClass(view === id)} title={label}><Icon className="h-5 w-5 shrink-0" /><span className="sidebar-label">{label}</span></button>)}
      </nav>
    </aside>
  </>;
}
