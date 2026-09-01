import { FormEvent, useEffect, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Server, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Provider {
  id: string;
  name: string;
  active: boolean;
  auto_registration: boolean;
  renewal_url: string | null;
}

export function ProvidersView() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data }, { data: auth }] = await Promise.all([
      supabase.from('iptv_providers').select('id, name, active, auto_registration, renewal_url').order('created_at', { ascending: false }),
      supabase.auth.getUser(),
    ]);
    if (auth.user) {
      const [{ data: profile }, { data: superAccess }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', auth.user.id).maybeSingle(),
        supabase.rpc('is_super_admin'),
      ]);
      setRole(superAccess ? 'super_admin' : profile?.role || 'provider_admin');
    }
    setProviders(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  const isSuper = role === 'super_admin' || role === 'admin';

  const handleToggle = async (provider: Provider) => {
    await supabase.from('iptv_providers').update({ active: !provider.active }).eq('id', provider.id);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este provedor e todos os dados vinculados a ele?')) return;

    const { error } = await supabase.rpc('delete_provider_cascade', {
      target_provider_id: id,
    });

    if (error) {
      alert(`Não foi possível excluir o provedor: ${error.message}`);
      return;
    }

    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{isSuper ? 'Provedores' : 'Meu provedor'}</h1>
          <p className="mt-2 text-sm text-white/45">{isSuper ? 'Cadastre o nome de cada provedor e atribua seu administrador.' : 'Configure a conexão, renovação e cadastro automático do seu provedor.'}</p>
        </div>
        {isSuper && <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-lime-200">
          <Plus className="h-4 w-4" /> Novo provedor
        </button>}
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
                <p className="truncate text-xs text-white/40">DNS identificado automaticamente conforme a lista</p>
                <p className={`mt-1 text-[10px] font-semibold ${provider.auto_registration ? 'text-lime-300' : 'text-white/30'}`}>Cadastro automático {provider.auto_registration ? 'ativado' : 'desativado'}</p>
              </div>
              {isSuper && <button onClick={() => handleToggle(provider)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${provider.active ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/50'}`}>
                {provider.active ? 'Ativo' : 'Inativo'}
              </button>}
              <button onClick={() => { setEditing(provider); setShowForm(true); }} className="rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"><Pencil className="h-4 w-4" /></button>
              {isSuper && <button onClick={() => handleDelete(provider.id)} className="rounded-lg p-2 text-white/40 transition hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ProviderForm provider={editing} superAdmin={isSuper} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      )}
    </div>
  );
}

function ProviderForm({ provider, superAdmin, onClose, onSaved }: {
  provider: Provider | null;
  superAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(provider?.name ?? '');
  const [autoRegistration, setAutoRegistration] = useState(provider?.auto_registration ?? false);
  const [renewalUrl, setRenewalUrl] = useState(provider?.renewal_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) {
      setError('Informe um nome válido para o provedor.');
      return;
    }
    if (superAdmin) {
      const { data: duplicate } = await supabase.from('iptv_providers').select('id').ilike('name', name.trim()).limit(1).maybeSingle();
      if (duplicate && duplicate.id !== provider?.id) { setError('Já existe um provedor com esse nome.'); return; }
    }
    setSaving(true);
    const result = superAdmin
      ? (provider ? await supabase.from('iptv_providers').update({ name: name.trim() }).eq('id', provider.id) : await supabase.from('iptv_providers').insert({ name: name.trim() }).select('id').single())
      : await supabase.rpc('update_own_provider_settings_v2', {
          next_renewal_url: renewalUrl.trim(),
          next_auto_registration: autoRegistration,
        });
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
            <input required disabled={!superAdmin} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none disabled:opacity-60 focus:border-lime-300/50" placeholder="Ex.: Provedor Premium" />
          </label>
          {!superAdmin && <>
          <label className="block"><span className="mb-2 block text-xs font-medium text-white/60">Página de renovação</span><input value={renewalUrl} onChange={(e) => setRenewalUrl(e.target.value)} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none" placeholder="https://provedor.com/renovar" /></label>
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4"><span><span className="block text-sm font-semibold">Cadastro automático</span><span className="mt-1 block text-xs leading-5 text-white/40">Se a conta estiver ativa no provedor, o primeiro acesso cria o dispositivo automaticamente.</span></span><input type="checkbox" checked={autoRegistration} onChange={(e) => setAutoRegistration(e.target.checked)} className="h-5 w-5 accent-lime-300" /></label>
          </>}
          {error && <p className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-xs text-red-200">{error}</p>}
          <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-300 py-3.5 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
          </button>
        </form>
      </div>
    </div>
  );
}
