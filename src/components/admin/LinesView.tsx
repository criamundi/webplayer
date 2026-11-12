import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Calendar, Check, Copy, Globe, Loader2, Pencil, Plus, Power, Search, Trash2, X, Zap, CheckCircle2, XCircle, Play, Pause, ListChecks } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildM3ULink, copyToClipboard } from '@/lib/m3u-link';

interface Line {
  id: string;
  username: string;
  password: string;
  provider_id: string | null;
  dns_id: string | null;
  expires_at: string | null;
  upstream_expires_at: string | null;
  upstream_status: string | null;
  last_synced_at: string | null;
  registration_source: 'manual' | 'automatic';
  local_enabled: boolean;
  status: string;
  notes: string | null;
  renewal_url: string | null;
  stream_type: 'm3u' | 'hls';
  last_tested_at: string | null;
  test_status: 'ok' | 'error' | null;
  test_error: string | null;
  created_at: string;
  iptv_providers: { name: string; server_url: string | null } | null;
  iptv_dns: { name: string; host: string } | null;
}

interface Provider { id: string; name: string; server_url: string | null; }
interface DnsEntry { id: string; name: string; host: string; provider_id: string | null; }
interface TvDevice { id: string; line_id: string; name: string; device_key: string; platform: string; model: string | null; model_code: string | null; app_version: string | null; status: string; last_seen_at: string | null; }

export function LinesView() {
  const [lines, setLines] = useState<Line[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [dnsList, setDnsList] = useState<DnsEntry[]>([]);
  const [tvDevices, setTvDevices] = useState<TvDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<Line | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showMigrate, setShowMigrate] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateDnsId, setMigrateDnsId] = useState('');
  const [migrateMsg, setMigrateMsg] = useState('');
  const [currentProviderId, setCurrentProviderId] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [showTestAll, setShowTestAll] = useState(false);

  const load = async () => {
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();

    let ownProviderId: string | null = null;
    let superAdmin = false;

    if (auth.user) {
      const [{ data: profile }, { data: superAccess }] = await Promise.all([
        supabase.from('profiles').select('provider_id, role').eq('id', auth.user.id).maybeSingle(),
        supabase.rpc('is_super_admin'),
      ]);

      ownProviderId = profile?.provider_id ?? null;
      superAdmin = Boolean(superAccess) || profile?.role === 'super_admin' || profile?.role === 'admin';
    }

    setCurrentProviderId(ownProviderId);
    setIsSuperAdmin(superAdmin);

    const lineSelect = 'id, username, password, provider_id, dns_id, expires_at, upstream_expires_at, upstream_status, last_synced_at, registration_source, local_enabled, status, notes, renewal_url, stream_type, last_tested_at, test_status, test_error, created_at, iptv_providers(name, server_url), iptv_dns(name, host)';

    const [{ data: lineData, error: lineError }, { data: provData, error: providerError }, { data: dnsData, error: dnsError }, { data: tvDeviceData, error: tvDeviceError }] = await Promise.all([
      supabase.from('iptv_lines').select(lineSelect).order('created_at', { ascending: false }),
      supabase.from('iptv_providers').select('id, name, server_url').order('name'),
      supabase.from('iptv_dns').select('id, name, host, provider_id').order('name'),
      supabase.from('iptv_devices').select('id, line_id, name, device_key, platform, model, model_code, app_version, status, last_seen_at').order('last_seen_at', { ascending: false }),
    ]);

    if (lineError) console.error('Erro ao carregar dispositivos:', lineError);
    if (providerError) console.error('Erro ao carregar provedores:', providerError);
    if (dnsError) console.error('Erro ao carregar DNS:', dnsError);
    if (tvDeviceError) console.warn('Registro de TVs ainda não disponível:', tvDeviceError.message);

    setLines((lineData || []) as unknown as Line[]);
    setProviders(provData || []);
    setDnsList((dnsData || []) as DnsEntry[]);
    setTvDevices((tvDeviceData || []) as TvDevice[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = lines.filter((l) => {
    if (statusFilter === 'error' && l.test_status !== 'error') return false;
    if (statusFilter === 'tested-ok' && l.test_status !== 'ok') return false;
    if (statusFilter !== 'all' && statusFilter !== 'error' && statusFilter !== 'tested-ok' && l.status !== statusFilter) return false;
    if (query && !l.username.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const getM3UHost = (line: Line): string => {
    if (line.iptv_dns?.host) return line.iptv_dns.host;
    if (line.iptv_providers?.server_url) return line.iptv_providers.server_url;
    return '';
  };

  const getM3ULink = (line: Line): string => {
    const host = getM3UHost(line);
    if (!host) return '';
    return buildM3ULink({ host, username: line.username, password: line.password, streamType: line.stream_type || 'm3u' });
  };

  const handleToggleStatus = async (line: Line) => {
    await supabase.from('iptv_lines').update({ local_enabled: !line.local_enabled }).eq('id', line.id);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este dispositivo permanentemente?')) return;
    await supabase.from('iptv_lines').delete().eq('id', id);
    load();
  };

  const handleMigrateOne = async (line: Line, newDnsId: string) => {
    await supabase.from('iptv_lines').update({ dns_id: newDnsId || null }).eq('id', line.id);
    load();
  };

  const handleStreamTypeToggle = async (line: Line) => {
    const newType = line.stream_type === 'hls' ? 'm3u' : 'hls';
    await supabase.from('iptv_lines').update({ stream_type: newType }).eq('id', line.id);
    load();
  };

  const handleTestLine = async (line: Line) => {
    setTestingId(line.id);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connect-line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          provider: line.iptv_providers?.name || '',
          username: line.username,
          password: line.password,
          streamType: line.stream_type || 'm3u',
          action: 'test-line',
        }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; channelCount?: number; message?: string };
      if (result.ok) {
        alert(result.message || 'Lista testada com sucesso.');
      } else {
        alert(result.error || 'Erro ao testar a lista.');
      }
    } catch {
      alert('Não foi possível testar a lista agora.');
    } finally {
      setTestingId(null);
      load();
    }
  };

  const handleMigrateAll = async () => {
    if (!migrateDnsId) { setMigrateMsg('Selecione um DNS de destino.'); return; }
    setMigrating(true);
    setMigrateMsg('');
    const ids = filtered.map((l) => l.id);
    let done = 0;
    const BATCH = 50;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const { error } = await supabase.from('iptv_lines').update({ dns_id: migrateDnsId }).in('id', batch);
      if (error) { setMigrateMsg('Erro ao migrar alguns dispositivos.'); break; }
      done += batch.length;
    }
    setMigrating(false);
    if (done > 0) {
      setMigrateMsg(`${done} dispositivo(s) migrado(s) para ${dnsList.find((d) => d.id === migrateDnsId)?.name || 'DNS'}.`);
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dispositivos</h1>
          <p className="mt-2 text-sm text-white/45">Gerencie os dispositivos e credenciais de acesso dos seus clientes.</p>
        </div>
        <div className="flex items-center gap-2">
          {dnsList.length > 0 && (
            <button onClick={() => setShowMigrate(true)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10">
              <ArrowRightLeft className="h-4 w-4" /> Migrar DNS em massa
            </button>
          )}
          <button onClick={() => setShowTestAll(true)} className="flex items-center gap-2 rounded-xl border border-lime-300/20 bg-lime-300/10 px-4 py-2.5 text-sm font-semibold text-lime-300 transition hover:bg-lime-300/20">
            <ListChecks className="h-4 w-4" /> Testar todas as listas
          </button>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-lime-200">
            <Plus className="h-4 w-4" /> Novo dispositivo
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por dispositivo…" className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white outline-none focus:border-lime-300/50" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none focus:border-lime-300/50">
          <option value="all" className="bg-slate-900">Todos</option>
          <option value="active" className="bg-slate-900">Ativos</option>
          <option value="disabled" className="bg-slate-900">Desativados</option>
          <option value="banned" className="bg-slate-900">Bloqueados</option>
          <option value="error" className="bg-slate-900">Com erro na lista</option>
          <option value="tested-ok" className="bg-slate-900">Testadas OK</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-white/40"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <p className="text-sm text-white/40">Nenhum dispositivo encontrado. Clique em "Novo dispositivo" para criar.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((line) => {
            const expiresAt = line.upstream_expires_at || line.expires_at;
            const expired = expiresAt ? new Date(expiresAt) <= new Date() : false;
            const isActive = line.local_enabled && line.status === 'active' && !expired;
            const m3uLink = getM3ULink(line);
            const hasError = line.test_status === 'error';
            const testedOk = line.test_status === 'ok';
            return (
              <div key={line.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-white/20'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white/90">{line.username}</p>
                    <p className="truncate text-xs text-white/40">
                      {line.iptv_providers?.name || 'Sem provedor'} · {line.registration_source === 'automatic' ? 'Cadastro automático' : 'Cadastro manual'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold ${isActive ? 'text-emerald-300' : expired ? 'text-amber-300' : 'text-red-300'}`}>
                      {!line.local_enabled ? 'Desativada no app' : expired ? 'Expirada no provedor' : line.status === 'banned' ? 'Bloqueada' : (line.upstream_status || 'Ativa')}
                    </p>
                    {expiresAt && <p className="flex items-center gap-1 text-[10px] text-white/30"><Calendar className="h-3 w-3" /> {new Date(expiresAt).toLocaleDateString('pt-BR')}</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleTestLine(line)} disabled={testingId === line.id} title="Testar lista" className={`rounded-lg p-2 transition ${hasError ? 'text-red-300 hover:bg-red-500/10' : testedOk ? 'text-emerald-300 hover:bg-emerald-400/10' : 'text-white/50 hover:bg-white/10 hover:text-white'}`}>
                      {testingId === line.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    </button>
                    <button onClick={() => handleToggleStatus(line)} title={isActive ? 'Desativar' : 'Ativar'} className={`rounded-lg p-2 transition ${isActive ? 'text-amber-300 hover:bg-amber-400/10' : 'text-emerald-300 hover:bg-emerald-400/10'}`}>
                      <Power className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setEditing(line); setShowForm(true); }} title="Editar" className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(line.id)} title="Excluir" className="rounded-lg p-2 text-white/40 transition hover:bg-red-500/10 hover:text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {hasError && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-300/15 bg-red-300/[0.06] px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-300" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-red-200">Erro na lista</p>
                      <p className="truncate text-[10px] text-red-200/70">{line.test_error || 'Erro desconhecido'}</p>
                    </div>
                    {line.last_tested_at && <span className="shrink-0 text-[9px] text-red-200/40">{new Date(line.last_tested_at).toLocaleString('pt-BR')}</span>}
                  </div>
                )}
                {testedOk && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-300/10 bg-emerald-300/[0.04] px-3 py-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
                    <p className="text-[11px] text-emerald-200/80">Lista testada e funcionando</p>
                    {line.last_tested_at && <span className="ml-auto shrink-0 text-[9px] text-emerald-200/40">{new Date(line.last_tested_at).toLocaleString('pt-BR')}</span>}
                  </div>
                )}

                {m3uLink && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-white/30" />
                    <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/50">{m3uLink}</p>
                    <button onClick={() => handleStreamTypeToggle(line)} title={`Tipo: ${line.stream_type === 'hls' ? 'HLS' : 'M3U'}`} className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide transition hover:bg-white/10">
                      {line.stream_type === 'hls' ? 'HLS' : 'M3U'}
                    </button>
                    <button onClick={() => copyToClipboard(m3uLink)} title="Copiar link" className="shrink-0 rounded-md p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {tvDevices.some((device) => device.line_id === line.id) && (
                  <div className="mt-3 rounded-xl border border-emerald-300/10 bg-emerald-300/[.035] px-3 py-2.5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/65">TVs com o app instalado</span>
                      <span className="text-[10px] text-white/35">{tvDevices.filter((device) => device.line_id === line.id).length}</span>
                    </div>
                    <div className="space-y-1.5">
                      {tvDevices.filter((device) => device.line_id === line.id).map((device) => (
                        <div key={device.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-black/20 px-2.5 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-semibold text-white/80">{device.name}</p>
                            <p className="truncate font-mono text-[10px] text-white/38">DUID: {device.device_key}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-medium uppercase text-white/45">{device.platform}{device.app_version ? ` · v${device.app_version}` : ''}</p>
                            <p className="text-[9px] text-white/30">{device.last_seen_at ? `Visto ${new Date(device.last_seen_at).toLocaleString('pt-BR')}` : 'Sem atividade'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {dnsList.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-white/30">DNS:</span>
                    <select
                      value={line.dns_id ?? ''}
                      onChange={(e) => handleMigrateOne(line, e.target.value)}
                      className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/70 outline-none focus:border-lime-300/50"
                    >
                      <option value="" className="bg-slate-900">Detectar automaticamente</option>
                      {dnsList.map((d) => <option key={d.id} value={d.id} className="bg-slate-900">{d.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <LineForm
          line={editing}
          providers={providers}
          dnsList={dnsList}
          currentProviderId={currentProviderId}
          superAdmin={isSuperAdmin}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      {showTestAll && (
        <TestAllModal
          lines={filtered}
          onClose={() => setShowTestAll(false)}
          onCompleted={load}
        />
      )}

      {showMigrate && (
        <MigrateModal
          dnsList={dnsList}
          count={filtered.length}
          migrating={migrating}
          msg={migrateMsg}
          selectedDns={migrateDnsId}
          onSelect={setMigrateDnsId}
          onClose={() => { setShowMigrate(false); setMigrateMsg(''); }}
          onMigrate={handleMigrateAll}
        />
      )}
    </div>
  );
}

function LineForm({ line, providers, dnsList, currentProviderId, superAdmin, onClose, onSaved }: {
  line: Line | null;
  providers: Provider[];
  dnsList: DnsEntry[];
  currentProviderId: string | null;
  superAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(line?.username ?? '');
  const [password, setPassword] = useState(line?.password ?? '');
  const [providerId, setProviderId] = useState(line?.provider_id ?? currentProviderId ?? (providers.length === 1 ? providers[0].id : ''));
  const [dnsId, setDnsId] = useState(line?.dns_id ?? '');
  const [streamType, setStreamType] = useState<'m3u' | 'hls'>(line?.stream_type ?? 'm3u');
  const [notes, setNotes] = useState(line?.notes ?? '');
  const [renewalUrl, setRenewalUrl] = useState(line?.renewal_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const availableDns = useMemo(
    () => dnsList.filter((dns) => !providerId || dns.provider_id === providerId),
    [dnsList, providerId],
  );

  const previewLink = useMemo(() => {
    const provider = providers.find((p) => p.id === providerId);
    const dns = availableDns.find((d) => d.id === dnsId);
    const host = dns?.host || provider?.server_url || '';
    if (!host || !username || !password) return '';
    return buildM3ULink({ host, username, password, streamType });
  }, [providers, availableDns, providerId, dnsId, username, password, streamType]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (username.trim().length < 2 || password.length < 1) {
      setError('Informe usuário e senha válidos.');
      return;
    }

    if (!providerId) {
      setError('Selecione o provedor deste dispositivo.');
      return;
    }
    setSaving(true);
    const payload = {
      username: username.trim(),
      password,
      provider_id: providerId || null,
      dns_id: dnsId || null,
      stream_type: streamType,
      local_enabled: true,
      notes: notes.trim() || null,
      renewal_url: renewalUrl.trim() || null,
    };
    let result = line
      ? await supabase.from('iptv_lines').update(payload).eq('id', line.id)
      : await supabase.from('iptv_lines').insert(payload);

    if (
      result.error &&
      /renewal_url|stream_type|last_tested_at|test_status|test_error/i.test(result.error.message || '')
    ) {
      const legacyPayload: Partial<typeof payload> = { ...payload };
      delete legacyPayload.renewal_url;
      delete legacyPayload.stream_type;
      result = line
        ? await supabase.from('iptv_lines').update(legacyPayload).eq('id', line.id)
        : await supabase.from('iptv_lines').insert(legacyPayload);
    }

    setSaving(false);

    if (result.error) {
      console.error('Erro ao salvar dispositivo:', result.error);
      setError(result.error.message || 'Não foi possível salvar o dispositivo.');
      return;
    }

    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#101b25] p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{line ? 'Editar dispositivo' : 'Novo dispositivo'}</h3>
          <button onClick={onClose} className="rounded-xl p-2 text-white/40 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">Usuário</span>
              <input required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50" placeholder="cliente01" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">Senha</span>
              <input required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50" placeholder="••••••" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">Provedor</span>
              {superAdmin ? (
                <select
                  value={providerId}
                  onChange={(e) => {
                    setProviderId(e.target.value);
                    setDnsId('');
                  }}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50"
                >
                  <option value="" className="bg-slate-900">Selecione</option>
                  {providers.map((p) => <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>)}
                </select>
              ) : (
                <div className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white/80">
                  {providers.find((p) => p.id === providerId)?.name || 'Provedor vinculado'}
                </div>
              )}
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">DNS (servidor da lista)</span>
              <select value={dnsId} onChange={(e) => setDnsId(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50">
                <option value="" className="bg-slate-900">Detectar automaticamente</option>
                {availableDns.map((d) => <option key={d.id} value={d.id} className="bg-slate-900">{d.name} — {d.host}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">Tipo de lista</span>
              <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
                <button type="button" onClick={() => setStreamType('m3u')} className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${streamType === 'm3u' ? 'bg-lime-300 text-slate-950' : 'text-white/60 hover:bg-white/10'}`}>M3U</button>
                <button type="button" onClick={() => setStreamType('hls')} className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition ${streamType === 'hls' ? 'bg-lime-300 text-slate-950' : 'text-white/60 hover:bg-white/10'}`}>HLS</button>
              </div>
            </label>
          </div>
          <p className="rounded-xl border border-lime-300/15 bg-lime-300/[0.06] p-3 text-xs leading-5 text-white/50">Status e vencimento serão consultados automaticamente no provedor quando o cliente entrar. Não é necessário definir validade ou conexões aqui.</p>
          {previewLink && (
            <div className="rounded-xl border border-white/5 bg-black/20 p-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-white/40">Link da lista (prévia)</p>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-lime-300/80">{previewLink}</p>
                <button type="button" onClick={() => copyToClipboard(previewLink)} className="shrink-0 rounded-md p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"><Copy className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-white/60">Link de renovação</span>
            <input
              type="url"
              value={renewalUrl}
              onChange={(e) => setRenewalUrl(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50"
              placeholder="https://dezpila.net.br/#/checkout/..."
            />
            <small className="mt-2 block text-[11px] leading-5 text-white/35">
              Link individual de pagamento/renovação desta lista.
            </small>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-medium text-white/60">Notas (opcional)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50" placeholder="Informações internas sobre o cliente…" />
          </label>
          {error && <p className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-xs text-red-200">{error}</p>}
          <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-300 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {line ? 'Salvar alterações' : 'Criar dispositivo'}
          </button>
        </form>
      </div>
    </div>
  );
}

function MigrateModal({ dnsList, count, migrating, msg, selectedDns, onSelect, onClose, onMigrate }: {
  dnsList: DnsEntry[];
  count: number;
  migrating: boolean;
  msg: string;
  selectedDns: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onMigrate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#101b25] p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Migrar DNS em massa</h3>
          <button onClick={onClose} className="rounded-xl p-2 text-white/40 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-white/50">
            Todos os <span className="font-bold text-white/80">{count}</span> dispositivo(s) da listagem atual terão o DNS alterado de uma só vez. O link de cada um passará a apontar para o novo servidor.
          </p>
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-white/60">DNS de destino</span>
            <select value={selectedDns} onChange={(e) => onSelect(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50">
              <option value="" className="bg-slate-900">Selecione um DNS…</option>
              {dnsList.map((d) => <option key={d.id} value={d.id} className="bg-slate-900">{d.name} — {d.host}</option>)}
            </select>
          </label>
          {msg && <p className="rounded-xl border border-lime-300/20 bg-lime-300/10 p-3 text-xs text-lime-200">{msg}</p>}
          <button disabled={migrating || !selectedDns} onClick={onMigrate} className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-300 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:opacity-50">
            {migrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />} Migrar {count} dispositivo(s)
          </button>
        </div>
      </div>
    </div>
  );
}

interface TestAllResult {
  lineId: string;
  username: string;
  providerName: string;
  ok: boolean;
  message: string;
}

function TestAllModal({ lines, onClose, onCompleted }: {
  lines: Line[];
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<TestAllResult[]>([]);
  const [finished, setFinished] = useState(false);
  const pausedRef = useRef(false);
  const cancelledRef = useRef(false);

  const total = lines.length;
  const okCount = results.filter((r) => r.ok).length;
  const errorCount = results.filter((r) => !r.ok).length;

  const runTests = async () => {
    setRunning(true);
    setPaused(false);
    setFinished(false);
    cancelledRef.current = false;
    pausedRef.current = false;

    for (let i = currentIndex; i < total; i++) {
      if (cancelledRef.current) break;

      while (pausedRef.current && !cancelledRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      if (cancelledRef.current) break;

      const line = lines[i];
      setCurrentIndex(i);

      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connect-line`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
          body: JSON.stringify({
            provider: line.iptv_providers?.name || '',
            username: line.username,
            password: line.password,
            streamType: line.stream_type || 'm3u',
            action: 'test-line',
          }),
        });
        const result = await response.json() as { ok?: boolean; error?: string; message?: string };
        const res: TestAllResult = {
          lineId: line.id,
          username: line.username,
          providerName: line.iptv_providers?.name || 'Sem provedor',
          ok: Boolean(result.ok),
          message: result.ok ? (result.message || 'OK') : (result.error || 'Erro'),
        };
        setResults((prev) => [...prev, res]);
      } catch {
        setResults((prev) => [...prev, {
          lineId: line.id,
          username: line.username,
          providerName: line.iptv_providers?.name || 'Sem provedor',
          ok: false,
          message: 'Falha de conexão',
        }]);
      }
    }

    setRunning(false);
    if (!cancelledRef.current) setFinished(true);
  };

  const handlePause = () => {
    pausedRef.current = true;
    setPaused(true);
  };

  const handleResume = () => {
    pausedRef.current = false;
    setPaused(false);
  };

  const handleCancel = () => {
    cancelledRef.current = true;
    pausedRef.current = false;
    setPaused(false);
    setRunning(false);
  };

  const handleClose = () => {
    cancelledRef.current = true;
    onCompleted();
    onClose();
  };

  const progress = total > 0 ? Math.round(((currentIndex) / total) * 100) : 0;
  const remaining = total - currentIndex;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border border-white/10 bg-[#101b25] p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Testar todas as listas</h3>
            <p className="mt-1 text-xs text-white/40">{total} dispositivo(s) serão testados sequencialmente</p>
          </div>
          <button onClick={handleClose} className="rounded-xl p-2 text-white/40 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {!running && !finished && results.length === 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Total de listas</span>
                <span className="font-bold text-white/90">{total}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-white/40">Cada lista será testada individualmente, uma por vez. Você pode pausar para continuar mais tarde ou cancelar a qualquer momento.</p>
            </div>
            <button onClick={runTests} disabled={total === 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-300 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:opacity-50">
              <Play className="h-4 w-4 fill-current" /> Iniciar testes
            </button>
          </div>
        )}

        {(running || finished || results.length > 0) && (
          <>
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/50">{finished ? 'Concluído' : paused ? 'Pausado' : running ? 'Testando...' : 'Pronto'}</span>
                <span className="font-semibold text-white/70">{currentIndex}/{total}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-lime-300 transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> {okCount} OK</span>
                <span className="flex items-center gap-1 text-red-300"><XCircle className="h-3.5 w-3.5" /> {errorCount} erro(s)</span>
                {running && remaining > 0 && <span className="text-white/40">{remaining} restante(s)</span>}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: '300px' }}>
              {results.map((r, idx) => (
                <div key={idx} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${r.ok ? 'border-emerald-300/10 bg-emerald-300/[0.04]' : 'border-red-300/15 bg-red-300/[0.06]'}`}>
                  {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-red-300" />}
                  <span className="min-w-0 flex-1 truncate font-medium text-white/80">{r.username}</span>
                  <span className="shrink-0 text-white/35">{r.providerName}</span>
                  <span className={`shrink-0 max-w-[180px] truncate ${r.ok ? 'text-emerald-200/70' : 'text-red-200/70'}`}>{r.message}</span>
                </div>
              ))}
              {running && !paused && currentIndex < total && (
                <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />
                  <span className="text-white/40">Testando {lines[currentIndex]?.username}...</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-2">
              {running && !paused && (
                <button onClick={handlePause} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10">
                  <Pause className="h-4 w-4" /> Pausar
                </button>
              )}
              {running && paused && (
                <button onClick={handleResume} className="flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-lime-200">
                  <Play className="h-4 w-4 fill-current" /> Continuar
                </button>
              )}
              {running && (
                <button onClick={handleCancel} className="flex items-center gap-2 rounded-xl border border-red-300/20 bg-red-300/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-300/20">
                  <X className="h-4 w-4" /> Cancelar
                </button>
              )}
              {(finished || (cancelledRef.current && !running)) && (
                <button onClick={handleClose} className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-300 py-3 text-sm font-bold text-slate-950 transition hover:bg-lime-200">
                  <Check className="h-4 w-4" /> Concluir e atualizar
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
