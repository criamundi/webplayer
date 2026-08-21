import { useEffect, useState } from 'react';
import { Activity, Globe, LayoutGrid, LogOut, Monitor, Palette, Radio, Server, X } from 'lucide-react';
import { DashboardView } from '@/components/admin/DashboardView';
import { LinesView } from '@/components/admin/LinesView';
import { ProvidersView } from '@/components/admin/ProvidersView';
import { DnsView } from '@/components/admin/DnsView';
import { BrandingView } from '@/components/admin/BrandingView';

type AdminTab = 'dashboard' | 'devices' | 'providers' | 'dns' | 'branding';

const tabs: Array<{ id: AdminTab; label: string; icon: typeof LayoutGrid }> = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutGrid },
  { id: 'devices', label: 'Dispositivos', icon: Monitor },
  { id: 'providers', label: 'Provedores', icon: Server },
  { id: 'dns', label: 'DNS', icon: Globe },
  { id: 'branding', label: 'Branding', icon: Palette },
];

interface AdminShellProps {
  onExit: () => void;
  onSignOut: () => void;
}

export function AdminShell({ onExit, onSignOut }: AdminShellProps) {
  const [tab, setTab] = useState<AdminTab>('devices');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [tab]);

  return (
    <div className="min-h-screen bg-[#091018] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_35%_0%,rgba(46,72,86,.32),transparent_38%),radial-gradient(circle_at_90%_80%,rgba(61,104,85,.16),transparent_30%)]" />

      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="mx-auto flex min-h-screen max-w-[1540px]">
        <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/10 bg-[#0d1720]/95 px-5 py-6 backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lime-300 text-slate-950 shadow-lg shadow-lime-300/20"><Radio className="h-6 w-6" /></div>
            <div>
              <span className="block text-sm font-bold tracking-wide">PAINEL ADMIN</span>
              <span className="block text-[10px] text-white/35">Nexus Play · Beta 0.1</span>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1.5">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${tab === id ? 'bg-lime-300 text-slate-950 shadow-lg shadow-lime-300/10' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}>
                <Icon className="h-5 w-5" /><span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-auto space-y-1.5 border-t border-white/10 pt-4">
            <button onClick={onExit} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-white/50 transition hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" /><span className="text-sm font-medium">Voltar ao app</span>
            </button>
            <button onClick={onSignOut} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-white/50 transition hover:bg-white/10 hover:text-white">
              <LogOut className="h-5 w-5" /><span className="text-sm font-medium">Sair</span>
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-5 pb-12 sm:px-8 lg:px-10 lg:py-8">
          <header className="flex items-center justify-between py-5 lg:hidden">
            <button onClick={() => setSidebarOpen(true)} className="rounded-xl bg-white/5 p-2.5 text-white/70"><LayoutGrid className="h-5 w-5" /></button>
            <span className="text-sm font-bold tracking-wide">PAINEL ADMIN</span>
          </header>

          {tab === 'dashboard' && <DashboardView />}
          {tab === 'devices' && <LinesView />}
          {tab === 'providers' && <ProvidersView />}
          {tab === 'dns' && <DnsView />}
          {tab === 'branding' && <BrandingView />}
        </main>
      </div>
    </div>
  );
}
