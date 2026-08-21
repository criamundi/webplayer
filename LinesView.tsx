import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Calendar, Check, Copy, Globe, Loader2, Monitor, Pencil, Plus, Power, Search, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildM3ULink, copyToClipboard } from '@/lib/m3u-link';

interface Line {
  id: string;
  username: string;
  password: string;
  provider_id: string | null;
  dns_id: string | null;
  max_connections: number;
  expires_at: string;
  status: string;
  notes: string | null;
  created_at: string;
  iptv_providers: { name: string; server_url: string | null } | null;
  iptv_dns: { name: string; host: string } | null;
}

interface Provider { id: string; name: string; server_url: string | null; }
interface DnsEntry { id: string; name: string; host: string; }

export function LinesView() {
  const [lines, setLines] = useState<Line[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [dnsList, setDnsList] = useState<DnsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<Line | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showMigrate, setShowMigrate] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrateDnsId, setMigrateDnsId] = useState('');
  const [migrateMsg, setMigrateMsg] = useState('');

  const load = async () => {
    setLoading(true);
    const [{ data: lineData }, { data: provData }, { data: dnsData }] = await Promise.all([
      supabase.from('iptv_lines').select('id, username, password, provider_id, dns_id, max_connections, expires_at, status, notes, created_at, iptv_providers(name, server_url), iptv_dns(name, host)').order('created_at', { ascending: false }),
      supabase.from('iptv_providers').select('id, name, server_url').order('name'),
      supabase.from('iptv_dns').select('id, name, host').order('name'),
    ]);
    setLines((lineData || []) as unknown as Line[]);
    setProviders(provData || []);
    setDnsList(dnsData || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = lines.filter((l) => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
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
    return buildM3ULink({ host, username: line.username, password: line.password });
  };

  const handleToggleStatus = async (line: Line) => {
    const newStatus = line.status === 'active' ? 'disabled' : 'active';
    await supabase.from('iptv_lines').update({ status: newStatus }).eq('id', line.id);
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
            const expired = new Date(line.expires_at) <= new Date();
            const isActive = line.status === 'active' && !expired;
            const m3uLink = getM3ULink(line);
            return (
              <div key={line.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-white/20'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white/90">{line.username}</p>
                    <p className="truncate text-xs text-white/40">
                      {line.iptv_providers?.name || 'Sem provedor'} · {line.max_connections} conexão(ões)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-semibold ${isActive ? 'text-emerald-300' : expired ? 'text-amber-300' : 'text-red-300'}`}>
                      {line.status === 'disabled' ? 'Desativada' : expired ? 'Expirada' : line.status === 'banned' ? 'Bloqueada' : 'Ativa'}
                    </p>
                    <p className="flex items-center gap-1 text-[10px] text-white/30"><Calendar className="h-3 w-3" /> {new Date(line.expires_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
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
                {m3uLink && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-white/30" />
                    <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/50">{m3uLink}</p>
                    <button onClick={() => copyToClipboard(m3uLink)} title="Copiar link" className="shrink-0 rounded-md p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
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
                      <option value="" className="bg-slate-900">Padrão (provedor)</option>
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
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
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

function LineForm({ line, providers, dnsList, onClose, onSaved }: {
  line: Line | null;
  providers: Provider[];
  dnsList: DnsEntry[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState(line?.username ?? '');
  const [password, setPassword] = useState(line?.password ?? '');
  const [providerId, setProviderId] = useState(line?.provider_id ?? '');
  const [dnsId, setDnsId] = useState(line?.dns_id ?? '');
  const [maxConnections, setMaxConnections] = useState(line?.max_connections ?? 1);
  const [days, setDays] = useState(line ? Math.max(1, Math.ceil((new Date(line.expires_at).getTime() - Date.now()) / 86400000)) : 30);
  const [notes, setNotes] = useState(line?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const previewLink = useMemo(() => {
    const provider = providers.find((p) => p.id === providerId);
    const dns = dnsList.find((d) => d.id === dnsId);
    const host = dns?.host || provider?.server_url || '';
    if (!host || !username || !password) return '';
    return buildM3ULink({ host, username, password });
  }, [providers, dnsList, providerId, dnsId, username, password]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (username.trim().length < 2 || password.length < 1) {
      setError('Informe usuário e senha válidos.');
      return;
    }
    setSaving(true);
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    const payload = {
      username: username.trim(),
      password,
      provider_id: providerId || null,
      dns_id: dnsId || null,
      max_connections: maxConnections,
      expires_at: expiresAt,
      notes: notes.trim() || null,
    };
    const result = line
      ? await supabase.from('iptv_lines').update(payload).eq('id', line.id)
      : await supabase.from('iptv_lines').insert(payload);
    setSaving(false);
    if (result.error) { setError('Não foi possível salvar o dispositivo.'); return; }
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
              <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50">
                <option value="" className="bg-slate-900">Nenhum</option>
                {providers.map((p) => <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">DNS (servidor da lista)</span>
              <select value={dnsId} onChange={(e) => setDnsId(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50">
                <option value="" className="bg-slate-900">Padrão (URL do provedor)</option>
                {dnsList.map((d) => <option key={d.id} value={d.id} className="bg-slate-900">{d.name} — {d.host}</option>)}
              </select>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">Conexões da linha (referência)</span>
              <input type="number" min={1} max={10} value={maxConnections} onChange={(e) => setMaxConnections(Number(e.target.value))} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50" />
              <span className="mt-1.5 block text-[10px] leading-4 text-white/35">Este valor organiza o Web Player; o limite real deve ser configurado no painel do provedor.</span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">Validade (dias)</span>
              <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50" />
            </label>
          </div>
          {previewLink && (
            <div className="rounded-xl border border-white/5 bg-black/20 p-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-white/40">Link M3U (prévia)</p>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-lime-300/80">{previewLink}</p>
                <button type="button" onClick={() => copyToClipboard(previewLink)} className="shrink-0 rounded-md p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"><Copy className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}
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
            Todos os <span className="font-bold text-white/80">{count}</span> dispositivo(s) da listagem atual terão o DNS alterado de uma só vez. O link M3U de cada um passará a apontar para o novo servidor.
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
