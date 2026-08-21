import { FormEvent, useEffect, useState } from 'react';
import { Check, Globe, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface DnsEntry {
  id: string;
  name: string;
  host: string;
  active: boolean;
  created_at: string;
}

export function DnsView() {
  const [entries, setEntries] = useState<DnsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DnsEntry | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('iptv_dns').select('id, name, host, active, created_at').order('created_at', { ascending: false });
    setEntries(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (entry: DnsEntry) => {
    await supabase.from('iptv_dns').update({ active: !entry.active }).eq('id', entry.id);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este DNS?')) return;
    await supabase.from('iptv_dns').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">DNS</h1>
          <p className="mt-2 text-sm text-white/45">Gerencie domínios para balanceamento e conexão do app.</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-lime-200">
          <Plus className="h-4 w-4" /> Novo DNS
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-white/40"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <Globe className="mx-auto mb-4 h-10 w-10 text-white/20" />
          <p className="text-sm text-white/40">Nenhum DNS cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${entry.active ? 'bg-emerald-400' : 'bg-white/20'}`} />
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                <Globe className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white/90">{entry.name}</p>
                <p className="truncate text-xs text-white/40">{entry.host}</p>
              </div>
              <button onClick={() => handleToggle(entry)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${entry.active ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/50'}`}>
                {entry.active ? 'Ativo' : 'Inativo'}
              </button>
              <button onClick={() => { setEditing(entry); setShowForm(true); }} className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => handleDelete(entry.id)} className="rounded-lg p-2 text-white/40 transition hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <DnsForm entry={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      )}
    </div>
  );
}

function DnsForm({ entry, onClose, onSaved }: {
  entry: DnsEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(entry?.name ?? '');
  const [host, setHost] = useState(entry?.host ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) { setError('Nome muito curto.'); return; }
    if (!/^https?:\/\/.+/i.test(host.trim()) && !/^[a-z0-9.-]+\.[a-z]{2,}/i.test(host.trim())) {
      setError('Host inválido. Use um domínio ou URL válida.');
      return;
    }
    setSaving(true);
    const payload = { name: name.trim(), host: host.trim() };
    const result = entry
      ? await supabase.from('iptv_dns').update(payload).eq('id', entry.id)
      : await supabase.from('iptv_dns').insert(payload);
    setSaving(false);
    if (result.error) { setError('Erro ao salvar.'); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#101b25] p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{entry ? 'Editar DNS' : 'Novo DNS'}</h3>
          <button onClick={onClose} className="rounded-xl p-2 text-white/40 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-white/60">Nome</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50" placeholder="Servidor Principal" />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-white/60">Host</span>
            <input required value={host} onChange={(e) => setHost(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50" placeholder="meuservidor.com:8080" />
          </label>
          {error && <p className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-xs text-red-200">{error}</p>}
          <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-300 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
          </button>
        </form>
      </div>
    </div>
  );
}
