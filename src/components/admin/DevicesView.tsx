import { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, Laptop, Loader2, Monitor, RefreshCw, Search, Smartphone, Trash2, Tv } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Device {
  id: string;
  provider_id: string;
  line_id: string;
  device_id: string;
  device_name: string | null;
  device_type: 'tv' | 'mobile' | 'browser';
  active: boolean;
  first_seen_at: string;
  last_seen_at: string;
  iptv_lines: { username: string } | null;
  iptv_providers: { name: string } | null;
}

function DeviceIcon({ type }: { type: Device['device_type'] }) {
  if (type === 'tv') return <Tv className="h-5 w-5" />;
  if (type === 'mobile') return <Smartphone className="h-5 w-5" />;
  return <Laptop className="h-5 w-5" />;
}

function relativeTime(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'agora';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days === 1 ? '' : 's'}`;
}

export function DevicesView() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('client_devices')
      .select('id, provider_id, line_id, device_id, device_name, device_type, active, first_seen_at, last_seen_at, iptv_lines(username), iptv_providers(name)')
      .order('last_seen_at', { ascending: false });

    if (error) setMessage('Não foi possível carregar os dispositivos.');
    setDevices((data || []) as unknown as Device[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt-BR');
    if (!needle) return devices;
    return devices.filter((device) =>
      [device.device_name, device.device_id, device.iptv_lines?.username, device.iptv_providers?.name]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(needle)),
    );
  }, [devices, query]);

  const setActive = async (device: Device, active: boolean) => {
    setBusyId(device.id);
    setMessage('');
    const { error } = await supabase.from('client_devices').update({ active }).eq('id', device.id);
    setBusyId('');
    if (error) { setMessage('Não foi possível alterar o dispositivo.'); return; }
    setMessage(active ? 'Dispositivo liberado.' : 'Dispositivo bloqueado.');
    await load();
  };

  const remove = async (device: Device) => {
    if (!confirm(`Remover ${device.device_name || 'este dispositivo'}? Ele poderá ser registrado novamente no próximo acesso se houver vaga.`)) return;
    setBusyId(device.id);
    setMessage('');
    const { error } = await supabase.from('client_devices').delete().eq('id', device.id);
    setBusyId('');
    if (error) { setMessage('Não foi possível remover o dispositivo.'); return; }
    setMessage('Dispositivo removido.');
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dispositivos</h1>
          <p className="mt-2 text-sm text-white/45">TVs, celulares e navegadores que realmente acessaram o player.</p>
        </div>
        <button onClick={() => void load()} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por cliente, dispositivo ou provedor…" className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-lime-300/50" />
      </div>

      {message && <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/65">{message}</p>}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <Monitor className="mx-auto mb-4 h-10 w-10 text-white/20" />
          <p className="text-sm text-white/40">Nenhum dispositivo registrado ainda.</p>
          <p className="mt-2 text-xs text-white/25">Eles aparecerão aqui automaticamente no próximo acesso dos clientes.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((device) => (
            <div key={device.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${device.active ? 'border-white/10 bg-white/[0.03]' : 'border-red-300/10 bg-red-300/[0.03] opacity-75'}`}>
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${device.active ? 'bg-lime-300/10 text-lime-300' : 'bg-white/5 text-white/30'}`}>
                <DeviceIcon type={device.device_type} />
              </span>

              <div className="min-w-[220px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-white/90">{device.device_name || 'Dispositivo sem nome'}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${device.active ? 'bg-emerald-300/10 text-emerald-300' : 'bg-red-300/10 text-red-300'}`}>
                    {device.active ? 'Autorizado' : 'Bloqueado'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/45">
                  Cliente: <span className="text-white/70">{device.iptv_lines?.username || '—'}</span>
                  {device.iptv_providers?.name ? ` · ${device.iptv_providers.name}` : ''}
                </p>
                <p className="mt-1 text-[11px] text-white/30">Último acesso {relativeTime(device.last_seen_at)} · ID {device.device_id.slice(0, 12)}…</p>
              </div>

              <div className="flex items-center gap-1">
                {busyId === device.id ? <Loader2 className="m-2 h-4 w-4 animate-spin text-white/40" /> : <>
                  <button
                    title={device.active ? 'Bloquear dispositivo' : 'Liberar dispositivo'}
                    onClick={() => void setActive(device, !device.active)}
                    className={`rounded-lg p-2 transition ${device.active ? 'text-amber-300 hover:bg-amber-300/10' : 'text-emerald-300 hover:bg-emerald-300/10'}`}
                  >
                    {device.active ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  </button>
                  <button title="Remover dispositivo" onClick={() => void remove(device)} className="rounded-lg p-2 text-red-300 transition hover:bg-red-300/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
