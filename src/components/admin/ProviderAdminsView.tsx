import { FormEvent, useEffect, useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, Loader2, Pencil, Plus, Power, ShieldCheck, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Profile { id: string; email: string; display_name: string | null; provider_id: string | null; admin_active: boolean; iptv_providers: { name: string } | null; }
interface Provider { id: string; name: string; }

export function ProviderAdminsView() {
  const [admins, setAdmins] = useState<Profile[]>([]), [providers, setProviders] = useState<Provider[]>([]), [editing, setEditing] = useState<Profile | null>(null);
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
  useEffect(() => { void load(); }, []);

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-provider-admins', { body });
    if (error) throw new Error((data as { error?: string } | null)?.error || 'Não foi possível concluir a operação.');
    if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  };
  const create = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try { await invoke({ action: 'create', displayName: name, email: email.trim(), password, providerId }); setName(''); setEmail(''); setPassword(''); setMessage('Administrador criado com sucesso.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível criar.'); }
    finally { setSaving(false); }
  };
  const action = async (id: string, body: Record<string, unknown>, success: string) => {
    setBusyId(id); setMessage('');
    try { await invoke({ ...body, id }); setMessage(success); await load(); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.'); return false; }
    finally { setBusyId(''); }
  };
  const resetPassword = async (admin: Profile) => { const next = prompt(`Nova senha para ${admin.email} (mínimo 8 caracteres):`); if (next) await action(admin.id, { action: 'reset-password', password: next }, 'Senha alterada com sucesso.'); };
  const remove = async (admin: Profile) => { if (confirm(`Excluir permanentemente o administrador ${admin.email}?`)) await action(admin.id, { action: 'delete' }, 'Administrador excluído.'); };

  return <div className="space-y-6">
    <div><h1 className="text-3xl font-semibold">Administradores</h1><p className="mt-2 text-sm text-white/45">Crie e controle os acessos administrativos de cada provedor.</p></div>
    <form onSubmit={create} className="rounded-3xl border border-white/10 bg-white/[.04] p-5 sm:p-6"><h2 className="mb-4 font-semibold">Novo administrador de provedor</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className="admin-input" /><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" className="admin-input" /><span className="relative"><input required minLength={8} type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha inicial (mín. 8)" className="admin-input w-full pr-11" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span><select required value={providerId} onChange={(e) => setProviderId(e.target.value)} className="admin-input text-white">{providers.map((provider) => <option className="bg-[#202832] text-white" value={provider.id} key={provider.id}>{provider.name}</option>)}</select></div><button disabled={saving || !providerId} className="mt-4 flex items-center gap-2 rounded-xl bg-lime-300 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar administrador</button></form>
    {message && <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">{message}</p>}
    {loading ? <Loader2 className="mx-auto animate-spin text-white/40" /> : admins.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/40">Nenhum administrador criado.</p> : <div className="space-y-2.5">{admins.map((admin) => <div key={admin.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${admin.admin_active ? 'border-white/10 bg-white/[.03]' : 'border-red-300/10 bg-red-300/[.03] opacity-70'}`}><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${admin.admin_active ? 'bg-lime-300/15 text-lime-300' : 'bg-white/5 text-white/30'}`}><ShieldCheck className="h-5 w-5" /></span><div className="min-w-[210px] flex-1"><p className="text-sm font-semibold">{admin.display_name || admin.email}</p><p className="mt-0.5 text-xs text-white/40">{admin.email} · {admin.iptv_providers?.name || 'Sem provedor'}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-semibold ${admin.admin_active ? 'bg-emerald-300/10 text-emerald-300' : 'bg-red-300/10 text-red-300'}`}>{admin.admin_active ? 'Ativo' : 'Desativado'}</span><div className="flex items-center gap-1">{busyId === admin.id ? <Loader2 className="m-2 h-4 w-4 animate-spin" /> : <><button title="Editar" onClick={() => setEditing(admin)} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white"><Pencil className="h-4 w-4" /> Editar</button><button title="Trocar senha" onClick={() => void resetPassword(admin)} className="rounded-lg p-2 text-sky-300 hover:bg-sky-300/10"><KeyRound className="h-4 w-4" /></button><button title={admin.admin_active ? 'Desativar' : 'Ativar'} onClick={() => void action(admin.id, { action: 'toggle' }, admin.admin_active ? 'Acesso desativado.' : 'Acesso ativado.')} className={`rounded-lg p-2 ${admin.admin_active ? 'text-amber-300' : 'text-emerald-300'}`}><Power className="h-4 w-4" /></button><button title="Excluir" onClick={() => void remove(admin)} className="rounded-lg p-2 text-red-300 hover:bg-red-300/10"><Trash2 className="h-4 w-4" /></button></>}</div></div>)}</div>}
    {editing && <EditAdminModal admin={editing} providers={providers} saving={busyId === editing.id} onClose={() => setEditing(null)} onSave={async (values) => { const ok = await action(editing.id, { action: 'update', ...values }, 'Administrador atualizado.'); if (ok) setEditing(null); }} />}
  </div>;
}

function EditAdminModal({ admin, providers, saving, onClose, onSave }: { admin: Profile; providers: Provider[]; saving: boolean; onClose: () => void; onSave: (values: { displayName: string; email: string; providerId: string }) => Promise<void>; }) {
  const [displayName, setDisplayName] = useState(admin.display_name || ''), [email, setEmail] = useState(admin.email), [providerId, setProviderId] = useState(admin.provider_id || '');
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 px-4 backdrop-blur-md"><div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#101b25] p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><div><h3 className="text-lg font-semibold">Editar administrador</h3><p className="mt-1 text-xs text-white/40">Altere os dados de acesso e o provedor vinculado.</p></div><button onClick={onClose} className="rounded-xl p-2 text-white/40 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button></div><form onSubmit={(event) => { event.preventDefault(); void onSave({ displayName: displayName.trim(), email: email.trim(), providerId }); }} className="space-y-4"><label className="block"><span className="mb-2 block text-xs text-white/60">Nome</span><input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="admin-input w-full" /></label><label className="block"><span className="mb-2 block text-xs text-white/60">E-mail</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="admin-input w-full" /></label><label className="block"><span className="mb-2 block text-xs text-white/60">Provedor</span><select required value={providerId} onChange={(e) => setProviderId(e.target.value)} className="admin-input w-full text-white">{providers.map((provider) => <option className="bg-[#202832] text-white" key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label><button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime-300 py-3.5 text-sm font-bold text-slate-950 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar alterações</button></form></div></div>;
}
