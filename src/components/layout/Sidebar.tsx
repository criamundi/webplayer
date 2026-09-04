import { Clapperboard, Film, Heart, Home, Radio, Settings, Tv } from 'lucide-react';

export type View = 'home' | 'live' | 'movies' | 'series' | 'player' | 'favorites' | 'continue' | 'search' | 'settings';
const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Início', icon: Home }, { id: 'live', label: 'Canais ao Vivo', icon: Radio },
  { id: 'movies', label: 'Filmes', icon: Film }, { id: 'series', label: 'Séries', icon: Clapperboard },
  { id: 'favorites', label: 'Favoritos', icon: Heart },
];
const secondaryItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: 'settings', label: 'Configurações', icon: Settings },
];
interface SidebarProps { view: View; setView: (v: View) => void; open: boolean; onClose: () => void; branding?: { app_name: string; logo_url: string | null; primary_color: string }; }

export function Sidebar({ view, setView, open, onClose, branding }: SidebarProps) {
  const navigate = (v: View) => { setView(v); onClose(); };
  const itemClass = (active: boolean) => `sidebar-item ${active ? 'sidebar-item-active' : ''}`;
  return <>
    {open && <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={onClose} />}
    <aside className={`sidebar-shell ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      <div className="mb-10 flex h-12 items-center overflow-hidden px-4">
        {branding?.logo_url ? <span className="sidebar-brand-logo flex h-14 w-44 shrink-0 items-center justify-start overflow-hidden bg-transparent transition-all duration-300"><img src={branding.logo_url} alt={branding.app_name} className="block max-h-14 max-w-44 object-contain object-left" style={{ background: 'transparent' }} /></span> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-400/15"><Tv className="h-5 w-5" /></span>}
        {!branding?.logo_url && <span className="sidebar-label ml-3 max-w-36 truncate whitespace-nowrap text-sm font-bold tracking-wider">{(branding?.app_name || 'Top TV Digital').toUpperCase()}</span>}
      </div>
      <nav className="flex flex-1 flex-col gap-1.5 px-3">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={itemClass(view === id)} title={label}><Icon className="h-5 w-5 shrink-0" /><span className="sidebar-label">{label}</span></button>)}
        <div className="my-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        {secondaryItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={itemClass(view === id)} title={label}><Icon className="h-5 w-5 shrink-0" /><span className="sidebar-label">{label}</span></button>)}
      </nav>
    </aside>
  </>;
}
