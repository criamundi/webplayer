import { FormEvent, useEffect, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Server, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Provider {
  id: string;
  name: string;
  server_url: string | null;
  active: boolean;
}

export function ProvidersView() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('iptv_providers').select('id, name, server_url, active').order('created_at', { ascending: false });
    setProviders(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (provider: Provider) => {
    await supabase.from('iptv_providers').update({ active: !provider.active }).eq('id', provider.id);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este provedor?')) return;
    await supabase.from('iptv_providers').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Provedores</h1>
          <p className="mt-2 text-sm text-white/45">Cadastre os provedores que os clientes usam como credencial de acesso.</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-lime-200">
          <Plus className="h-4 w-4" /> Novo provedor
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-white/40"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : providers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center">
          <Server className="mx-auto mb-4 h-10 w-10 text-white/20" />
          <p className="text-sm text-white/40">Nenhum provedor cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {providers.map((provider) => (
            <div key={provider.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${provider.active ? 'bg-emerald-400' : 'bg-white/20'}`} />
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300">
                <Server className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white/90">{provider.name}</p>
                <p className="truncate text-xs text-white/40">{provider.server_url || 'Sem URL — usa DNS das linhas'}</p>
              </div>
              <button onClick={() => handleToggle(provider)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${provider.active ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/50'}`}>
                {provider.active ? 'Ativo' : 'Inativo'}
              </button>
              <button onClick={() => { setEditing(provider); setShowForm(true); }} className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"><Pencil className="h-4 w-4" /></button>
              <button onClick={() => handleDelete(provider.id)} className="rounded-lg p-2 text-white/40 transition hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ProviderForm provider={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      )}
    </div>
  );
}

function ProviderForm({ provider, onClose, onSaved }: {
  provider: Provider | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(provider?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) {
      setError('Informe um nome válido para o provedor.');
      return;
    }
    setSaving(true);
    const payload = { name: name.trim() };
    const result = provider
      ? await supabase.from('iptv_providers').update(payload).eq('id', provider.id)
      : await supabase.from('iptv_providers').insert(payload);
    setSaving(false);
    if (result.error) { setError('Erro ao salvar.'); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#101b25] p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{provider ? 'Editar provedor' : 'Novo provedor'}</h3>
          <button onClick={onClose} className="rounded-xl p-2 text-white/40 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-white/60">Nome do provedor</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50" placeholder="Ex.: Provedor Premium" />
          </label>
          <p className="rounded-xl border border-white/5 bg-black/20 p-3 text-xs leading-5 text-white/40">
            O provedor funciona como uma credencial. O cliente digita esse nome junto com usuário e senha. O servidor usado para carregar a lista vem do DNS configurado em cada linha.
          </p>
          {error && <p className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-xs text-red-200">{error}</p>}
          <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-300 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
          </button>
        </form>
      </div>
    </div>
  );
}
