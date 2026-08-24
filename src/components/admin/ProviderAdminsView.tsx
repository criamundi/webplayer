import { FormEvent, useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Plus, Power, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Profile { id: string; email: string; display_name: string | null; provider_id: string | null; admin_active: boolean; iptv_providers: { name: string } | null; }
interface Provider { id: string; name: string; }

export function ProviderAdminsView() {
  const [admins, setAdmins] = useState<Profile[]>([]), [providers, setProviders] = useState<Provider[]>([]);
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [providerId, setProviderId] = useState('');
  const [showPassword, setShowPassword] = useState(false), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [busyId, setBusyId] = useState(''), [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: providerRows }] = await Promise.all([
      supabase.from('profiles').select('id, email, display_name, provider_id, admin_active, iptv_providers(name)').eq('role', 'provider_admin').order('created_at'),
      supabase.from('iptv_providers').select('id, name').order('name'),
    ]);
    setAdmins((profiles || []) as unknown as Profile[]); setProviders(providerRows || []); setProviderId((value) => value || providerRows?.[0]?.id || ''); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-provider-admins', { body });
    if (error) throw new Error((data as { error?: string } | null)?.error || 'Não foi possível concluir a operação.');
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
    return data;
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setMessage('');
    try { await invoke({ action: 'create', displayName: name, email: email.trim(), password, providerId }); setName(''); setEmail(''); setPassword(''); setMessage('Administrador criado e vinculado com sucesso.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível criar.'); }
    finally { setSaving(false); }
  };
  const action = async (id: string, body: Record<string, unknown>, success: string) => {
    setBusyId(id); setMessage('');
    try { await invoke({ ...body, id }); setMessage(success); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.'); }
    finally { setBusyId(''); }
  };
  const resetPassword = (admin: Profile) => { const next = prompt(`Nova senha para ${admin.email} (mínimo 8 caracteres):`); if (next) action(admin.id, { action: 'reset-password', password: next }, 'Senha alterada com sucesso.'); };
  const remove = (admin: Profile) => { if (confirm(`Excluir permanentemente o administrador ${admin.email}?`)) action(admin.id, { action: 'delete' }, 'Administrador excluído.'); };

  return <div className="space-y-6">
    <div><h1 className="text-3xl font-semibold">Administradores</h1><p className="mt-2 text-sm text-white/45">Crie e controle os acessos administrativos de cada provedor.</p></div>
    <form onSubmit={submit} className="rounded-3xl border border-white/10 bg-white/[.04] p-5 sm:p-6">
      <h2 className="mb-4 font-semibold">Novo administrador de provedor</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-lime-300/50" />
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-lime-300/50" />
        <span className="relative"><input required minLength={8} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha inicial (mín. 8)" className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-11 text-sm outline-none focus:border-lime-300/50" /><button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span>
        <select required value={providerId} onChange={(e) => setProviderId(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">{providers.map((p) => <option className="bg-slate-900" value={p.id} key={p.id}>{p.name}</option>)}</select>
      </div>
      <button disabled={saving || !providerId} className="mt-4 flex items-center gap-2 rounded-xl bg-lime-300 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar administrador</button>
    </form>
    {message && <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">{message}</p>}
    {loading ? <Loader2 className="mx-auto animate-spin text-white/40" /> : admins.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/40">Nenhum administrador de provedor criado.</p> : <div className="space-y-2.5">{admins.map((admin) => <AdminRow key={admin.id} admin={admin} providers={providers} busy={busyId === admin.id} onSave={(provider, displayName, nextEmail) => action(admin.id, { action: 'update', providerId: provider, displayName, email: nextEmail }, 'Administrador atualizado.')} onToggle={() => action(admin.id, { action: 'toggle' }, admin.admin_active ? 'Acesso desativado.' : 'Acesso ativado.')} onPassword={() => resetPassword(admin)} onDelete={() => remove(admin)} />)}</div>}
  </div>;
}

function AdminRow({ admin, providers, busy, onSave, onToggle, onPassword, onDelete }: { admin: Profile; providers: Provider[]; busy: boolean; onSave: (providerId: string, name: string, email: string) => void; onToggle: () => void; onPassword: () => void; onDelete: () => void; }) {
  const [provider, setProvider] = useState(admin.provider_id || ''), [name, setName] = useState(admin.display_name || ''), [email, setEmail] = useState(admin.email);
  return <div className={`rounded-2xl border p-4 ${admin.admin_active ? 'border-white/10 bg-white/[.03]' : 'border-red-300/10 bg-red-300/[.03] opacity-70'}`}><div className="flex flex-wrap items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${admin.admin_active ? 'bg-lime-300/15 text-lime-300' : 'bg-white/5 text-white/30'}`}><ShieldCheck className="h-5 w-5" /></span><div className="min-w-[130px]"><p className="text-xs font-semibold">{admin.admin_active ? 'Acesso ativo' : 'Acesso desativado'}</p><p className="text-[10px] text-white/35">Administrador do provedor</p></div><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="min-w-[210px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs" /><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs" /><select value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">{providers.map((p) => <option className="bg-slate-900" value={p.id} key={p.id}>{p.name}</option>)}</select><div className="flex gap-1">{busy ? <Loader2 className="m-2 h-4 w-4 animate-spin" /> : <><button title="Salvar e-mail, nome e provedor" onClick={() => onSave(provider, name, email)} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"><Save className="h-4 w-4" /></button><button title="Trocar senha" onClick={onPassword} className="rounded-lg p-2 text-sky-300 hover:bg-sky-300/10"><KeyRound className="h-4 w-4" /></button><button title={admin.admin_active ? 'Desativar acesso' : 'Ativar acesso'} onClick={onToggle} className={`rounded-lg p-2 ${admin.admin_active ? 'text-amber-300' : 'text-emerald-300'}`}><Power className="h-4 w-4" /></button><button title="Excluir" onClick={onDelete} className="rounded-lg p-2 text-red-300 hover:bg-red-300/10"><Trash2 className="h-4 w-4" /></button></>}</div></div></div>;
}
