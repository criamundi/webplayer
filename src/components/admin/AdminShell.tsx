import { useEffect, useState } from 'react';
import { Globe, LayoutGrid, LogOut, Monitor, Palette, Radio, Server, ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DashboardView } from '@/components/admin/DashboardView';
import { LinesView } from '@/components/admin/LinesView';
import { ProvidersView } from '@/components/admin/ProvidersView';
import { DnsView } from '@/components/admin/DnsView';
import { BrandingView } from '@/components/admin/BrandingView';
import { ProviderAdminsView } from '@/components/admin/ProviderAdminsView';

type AdminTab = 'dashboard' | 'devices' | 'providers' | 'admins' | 'dns' | 'branding';

const tabs: Array<{ id: AdminTab; label: string; icon: typeof LayoutGrid }> = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutGrid },
  { id: 'devices', label: 'Dispositivos', icon: Monitor },
  { id: 'providers', label: 'Provedores', icon: Server },
  { id: 'admins', label: 'Administradores', icon: ShieldCheck },
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
  const [role, setRole] = useState<string | null>(null);
  const [panelBranding, setPanelBranding] = useState({ app_name: 'Top TV Digital', logo_url: null as string | null, primary_color: '#bef264' });

  useEffect(() => { setSidebarOpen(false); }, [tab]);
  useEffect(() => {
    let mounted = true;
    const loadIdentity = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const [{ data: profile }, { data: superAccess }] = await Promise.all([
        supabase.from('profiles').select('role, provider_id').eq('id', auth.user.id).maybeSingle(),
        supabase.rpc('is_super_admin'),
      ]);
      if (!profile || !mounted) return;
      const isSuper = Boolean(superAccess) || profile.role === 'super_admin' || profile.role === 'admin';
      setRole(isSuper ? 'super_admin' : profile.role);
      const query = isSuper
        ? supabase.from('app_branding').select('app_name, logo_url, primary_color').maybeSingle()
        : supabase.from('provider_branding').select('app_name, logo_url, primary_color').eq('provider_id', profile.provider_id).maybeSingle();
      const { data: identity } = await query;
      if (identity && mounted) setPanelBranding(identity);
    };
    void loadIdentity();
    const refresh = () => void loadIdentity();
    window.addEventListener('branding-updated', refresh);
    return () => { mounted = false; window.removeEventListener('branding-updated', refresh); };
  }, []);
  const isSuper = role === 'super_admin' || role === 'admin';
  const visibleTabs = tabs
    .filter((item) => isSuper || item.id !== 'admins')
    .map((item) => item.id === 'providers' && !isSuper ? { ...item, label: 'Meu provedor' } : item);

  return (
    <div className="min-h-screen bg-[#091018] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_35%_0%,rgba(46,72,86,.32),transparent_38%),radial-gradient(circle_at_90%_80%,rgba(61,104,85,.16),transparent_30%)]" />

      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="flex min-h-screen w-full">
        <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/10 bg-[#0d1720]/95 px-5 py-6 backdrop-blur-xl transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="mb-10 flex items-center gap-3">
            {panelBranding.logo_url ? <div className="flex h-11 w-11 items-center justify-center overflow-hidden bg-transparent"><img src={panelBranding.logo_url} alt="" className="block max-h-11 max-w-11 object-contain" style={{ background: 'transparent' }} /></div> : <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-slate-950 shadow-lg" style={{ backgroundColor: panelBranding.primary_color }}><Radio className="h-6 w-6" /></div>}
            <div>
              <span className="block text-sm font-bold tracking-wide">PAINEL ADMIN</span>
              <span className="block text-[10px] text-white/35">{panelBranding.app_name}</span>
            </div>
          </div>

          <nav className="flex flex-1 flex-col gap-1.5">
            {visibleTabs.map(({ id, label, icon: Icon }) => (
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
          {tab === 'admins' && <ProviderAdminsView />}
          {tab === 'dns' && <DnsView />}
          {tab === 'branding' && <BrandingView />}
        </main>
      </div>
    </div>
  );
}
