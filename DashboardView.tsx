import { useEffect, useState } from 'react';
import { Activity, Globe, Monitor, Server, UserX, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Stats {
  totalDevices: number;
  activeDevices: number;
  blockedDevices: number;
  pendingDevices: number;
  totalProviders: number;
  activeProviders: number;
  totalDns: number;
}

interface RecentDevice {
  id: string;
  name: string;
  device_key: string;
  status: string;
  last_seen_at: string | null;
}

export function DashboardView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentDevice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [devices, providers, dns, recentDevices] = await Promise.all([
        supabase.from('iptv_devices').select('id, status'),
        supabase.from('iptv_providers').select('id, active'),
        supabase.from('iptv_dns').select('id'),
        supabase.from('iptv_devices').select('id, name, device_key, status, last_seen_at').order('created_at', { ascending: false }).limit(8),
      ]);

      const allDevices = devices.data || [];

      setStats({
        totalDevices: allDevices.length,
        activeDevices: allDevices.filter((d) => d.status === 'active').length,
        blockedDevices: allDevices.filter((d) => d.status === 'blocked').length,
        pendingDevices: allDevices.filter((d) => d.status === 'pending').length,
        totalProviders: providers.data?.length || 0,
        activeProviders: providers.data?.filter((p) => p.active).length || 0,
        totalDns: dns.data?.length || 0,
      });

      setRecent((recentDevices.data || []) as RecentDevice[]);

      setLoading(false);
    })();
  }, []);

  if (loading || !stats) {
    return <div className="flex items-center justify-center py-20 text-white/40">Carregando…</div>;
  }

  const cards = [
    { label: 'Dispositivos ativos', value: stats.activeDevices, icon: Zap, color: 'text-emerald-300', bg: 'bg-emerald-400/10' },
    { label: 'Total de dispositivos', value: stats.totalDevices, icon: Monitor, color: 'text-lime-300', bg: 'bg-lime-300/10' },
    { label: 'Bloqueados', value: stats.blockedDevices, icon: UserX, color: 'text-red-300', bg: 'bg-red-400/10' },
    { label: 'Pendentes', value: stats.pendingDevices, icon: Monitor, color: 'text-amber-300', bg: 'bg-amber-400/10' },
    { label: 'Provedores ativos', value: stats.activeProviders, icon: Server, color: 'text-sky-300', bg: 'bg-sky-400/10' },
    { label: 'DNS', value: stats.totalDns, icon: Globe, color: 'text-cyan-300', bg: 'bg-cyan-400/10' },
    { label: 'Provedores totais', value: stats.totalProviders, icon: Server, color: 'text-white/70', bg: 'bg-white/5' },
  ];

  const statusColors: Record<string, string> = {
    active: 'text-emerald-300',
    blocked: 'text-red-300',
    pending: 'text-amber-300',
    expired: 'text-slate-400',
  };
  const statusLabels: Record<string, string> = {
    active: 'Ativo',
    blocked: 'Bloqueado',
    pending: 'Pendente',
    expired: 'Expirado',
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-1 text-sm font-medium text-lime-300">Painel</p>
        <h1 className="text-3xl font-semibold tracking-tight">Visão geral</h1>
        <p className="mt-2 text-sm text-white/45">Acompanhe dispositivos, provedores e conexões em tempo real.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${card.bg} ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold tracking-tight">{card.value}</p>
            <p className="mt-1 text-xs text-white/40">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
        <h2 className="mb-5 text-lg font-semibold">Dispositivos recentes</h2>
        {recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-white/40">Nenhum dispositivo cadastrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((device) => (
              <div key={device.id} className="flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-xs font-bold text-white/60">
                  {device.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white/90">{device.name}</p>
                  <p className="truncate text-xs text-white/40">{device.device_key}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-semibold ${statusColors[device.status] || 'text-white/40'}`}>{statusLabels[device.status] || device.status}</p>
                  <p className="text-[10px] text-white/30">{device.last_seen_at ? new Date(device.last_seen_at).toLocaleDateString('pt-BR') : 'Nunca'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
