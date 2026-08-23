import { FormEvent, useEffect, useState } from 'react';
import { Check, Image, Loader2, Save, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Branding { provider_id: string; app_name: string; logo_url: string | null; background_url: string | null; login_background_url: string | null; primary_color: string; secondary_color: string; player_layout: string; settings_layout: string; }
interface Provider { id: string; name: string; }
const empty = (id: string): Branding => ({ provider_id: id, app_name: 'Nexus Play', logo_url: null, background_url: null, login_background_url: null, primary_color: '#bef264', secondary_color: '#091018', player_layout: 'default', settings_layout: 'default' });

export function BrandingView() {
  const [providers, setProviders] = useState<Provider[]>([]), [providerId, setProviderId] = useState('');
  const [branding, setBranding] = useState<Branding | null>(null), [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false), [uploading, setUploading] = useState(''), [saved, setSaved] = useState(false), [error, setError] = useState('');

  useEffect(() => { (async () => {
    const { data: auth } = await supabase.auth.getUser();
    const { data: profile } = auth.user ? await supabase.from('profiles').select('provider_id').eq('id', auth.user.id).maybeSingle() : { data: null };
    const { data } = await supabase.from('iptv_providers').select('id, name').order('name');
    const list = data || []; setProviders(list); setProviderId(profile?.provider_id || list[0]?.id || ''); setLoading(false);
  })(); }, []);
  useEffect(() => { if (!providerId) return; (async () => { setLoading(true); const { data } = await supabase.from('provider_branding').select('*').eq('provider_id', providerId).maybeSingle(); setBranding((data as Branding | null) || empty(providerId)); setLoading(false); })(); }, [providerId]);

  const upload = async (field: 'logo_url' | 'background_url' | 'login_background_url', file?: File) => {
    if (!file || !branding) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setError('Use uma imagem de até 5 MB.'); return; }
    setUploading(field); setError('');
    const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'webp';
    const path = `${branding.provider_id}/${field}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('provider-branding').upload(path, file, { contentType: file.type });
    if (uploadError) { setError('Falha ao enviar. Confirme se a nova migration foi instalada.'); setUploading(''); return; }
    const { data } = supabase.storage.from('provider-branding').getPublicUrl(path);
    setBranding({ ...branding, [field]: data.publicUrl }); setUploading('');
  };
  const save = async (e: FormEvent) => { e.preventDefault(); if (!branding) return; setSaving(true); setError(''); const { error: saveError } = await supabase.from('provider_branding').upsert(branding, { onConflict: 'provider_id' }); setSaving(false); if (saveError) return setError('Não foi possível salvar o branding.'); setSaved(true); setTimeout(() => setSaved(false), 2500); };
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-white/40" /></div>;
  if (!branding) return <p className="rounded-2xl border border-white/10 p-8 text-white/50">Cadastre um provedor primeiro.</p>;

  const Picture = ({ field, title, hint }: { field: 'logo_url' | 'background_url' | 'login_background_url'; title: string; hint: string }) => <label className="block rounded-2xl border border-white/10 bg-black/15 p-4"><b className="text-sm">{title}</b><small className="mt-1 block text-white/40">{hint}</small>{branding[field] && <img src={branding[field] || ''} className={`mt-3 w-full rounded-xl bg-black/30 object-contain ${field === 'logo_url' ? 'h-24' : 'h-32'}`} />}<span className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 p-3 text-xs text-white/60">{uploading === field ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Escolher no computador<input hidden type="file" accept="image/*" onChange={(e) => upload(field, e.target.files?.[0])} /></span></label>;

  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold">Branding por provedor</h1><p className="mt-2 text-sm text-white/45">Identidade visual independente para cada provedor.</p></div>{providers.length > 1 && <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">{providers.map((p) => <option className="bg-slate-900" key={p.id} value={p.id}>{p.name}</option>)}</select>}</div>
    <form onSubmit={save} className="space-y-6"><section className="rounded-3xl border border-white/10 bg-white/[.04] p-6"><label><span className="mb-2 block text-xs text-white/60">Nome do app</span><input value={branding.app_name} onChange={(e) => setBranding({ ...branding, app_name: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3" /></label></section>
    <section className="rounded-3xl border border-white/10 bg-white/[.04] p-6"><div className="mb-5 flex gap-3"><Image className="text-lime-300" /><b>Imagens</b></div><div className="grid gap-4 lg:grid-cols-3"><Picture field="logo_url" title="Logo" hint="PNG transparente recomendado" /><Picture field="background_url" title="Fundo principal" hint="Imagem horizontal do app" /><Picture field="login_background_url" title="Fundo do acesso" hint="Imagem horizontal do login" /></div></section>
    <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/[.04] p-6 sm:grid-cols-2 lg:grid-cols-4"><label><span className="mb-2 block text-xs text-white/60">Cor principal</span><input type="color" value={branding.primary_color} onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })} className="h-12 w-full" /></label><label><span className="mb-2 block text-xs text-white/60">Cor de fundo</span><input type="color" value={branding.secondary_color} onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })} className="h-12 w-full" /></label><label><span className="mb-2 block text-xs text-white/60">Player</span><select value={branding.player_layout} onChange={(e) => setBranding({ ...branding, player_layout: e.target.value })} className="w-full rounded-xl bg-white/5 p-3"><option value="default">Padrão</option><option value="compact">Compacto</option><option value="cinema">Cinema</option></select></label><label><span className="mb-2 block text-xs text-white/60">Configurações</span><select value={branding.settings_layout} onChange={(e) => setBranding({ ...branding, settings_layout: e.target.value })} className="w-full rounded-xl bg-white/5 p-3"><option value="default">Padrão</option><option value="grouped">Agrupado</option></select></label></section>
    {error && <p className="rounded-xl bg-red-400/10 p-3 text-xs text-red-200">{error}</p>}<div className="flex items-center gap-3"><button disabled={saving || !!uploading} className="flex items-center gap-2 rounded-xl bg-lime-300 px-6 py-3 text-sm font-bold text-slate-950">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar branding</button>{saved && <span className="flex gap-2 text-sm text-emerald-300"><Check className="h-4 w-4" /> Salvo</span>}</div></form></div>;
}
