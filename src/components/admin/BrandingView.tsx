import { FormEvent, useEffect, useState } from 'react';
import { Check, ChevronDown, Image, Loader2, Save, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Branding { provider_id?: string; app_name: string; logo_url: string | null; background_url: string | null; login_background_url: string | null; primary_color: string; secondary_color: string; player_layout: string; settings_layout: string; main_font_scale: number; }
const empty = (providerId?: string): Branding => ({ ...(providerId ? { provider_id: providerId } : {}), app_name: 'Nexus Play', logo_url: null, background_url: null, login_background_url: null, primary_color: '#bef264', secondary_color: '#091018', player_layout: 'default', settings_layout: 'default', main_font_scale: 1.3 });
const validHex = (value: string) => /^#[0-9a-f]{6}$/i.test(value.trim());

export function BrandingView() {
  const [target, setTarget] = useState('');
  const [isSuper, setIsSuper] = useState(false), [branding, setBranding] = useState<Branding | null>(null), [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false), [uploading, setUploading] = useState(''), [saved, setSaved] = useState(false), [error, setError] = useState('');

  useEffect(() => { void (async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setLoading(false); return; }
    const [{ data: profile }, { data: superAccess }] = await Promise.all([
      supabase.from('profiles').select('provider_id, role').eq('id', auth.user.id).maybeSingle(),
      supabase.rpc('is_super_admin'),
    ]);
    const superRole = Boolean(superAccess) || profile?.role === 'super_admin' || profile?.role === 'admin';
    setIsSuper(superRole);
    if (superRole) {
      setTarget('global');
    } else if (profile?.provider_id) {
      setTarget(profile.provider_id);
    } else setLoading(false);
  })(); }, []);

  useEffect(() => { if (!target) return; void (async () => {
    setLoading(true); setError('');
    const query = target === 'global'
      ? supabase.from('app_branding').select('app_name, logo_url, background_url, login_background_url, primary_color, secondary_color, player_layout, settings_layout, main_font_scale').eq('singleton', true).maybeSingle()
      : supabase.from('provider_branding').select('*').eq('provider_id', target).maybeSingle();
    const { data, error: loadError } = await query;
    if (loadError) setError('Não foi possível carregar o branding. Execute a migration mais recente.');
    setBranding((data as Branding | null) || empty(target === 'global' ? undefined : target)); setLoading(false);
  })(); }, [target]);

  const upload = async (field: 'logo_url' | 'background_url' | 'login_background_url', file?: File) => {
    if (!file || !branding || !target) return;
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) { setError('Use JPG, PNG, WEBP, GIF ou SVG de até 5 MB.'); return; }
    setUploading(field); setError('');
    const ext = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'webp';
    const path = `${target}/${field}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('provider-branding').upload(path, file, { contentType: file.type });
    if (uploadError) { setError(`Falha ao enviar a imagem: ${uploadError.message}`); setUploading(''); return; }
    const { data } = supabase.storage.from('provider-branding').getPublicUrl(path);
    setBranding({ ...branding, [field]: data.publicUrl }); setUploading('');
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!branding || !target) return;
    if (!validHex(branding.primary_color)) { setError('Informe a cor principal no formato hexadecimal, por exemplo #BEF264.'); return; }
    setSaving(true); setError('');
    const payload = { app_name: branding.app_name.trim() || 'Nexus Play', logo_url: branding.logo_url, background_url: null, login_background_url: branding.login_background_url, primary_color: branding.primary_color.toUpperCase(), secondary_color: '#091018', player_layout: branding.player_layout, settings_layout: branding.settings_layout, main_font_scale: Math.min(1.3, Math.max(.85, Number(branding.main_font_scale) || 1)) };
    const result = target === 'global'
      ? await supabase.from('app_branding').update(payload).eq('singleton', true)
      : await supabase.from('provider_branding').upsert({ provider_id: target, ...payload }, { onConflict: 'provider_id' });
    setSaving(false);
    if (result.error) { setError(`Não foi possível salvar: ${result.error.message}`); return; }
    setBranding({ ...branding, ...payload }); setSaved(true); window.dispatchEvent(new Event('branding-updated')); setTimeout(() => setSaved(false), 2500);
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-white/40" /></div>;
  if (!branding) return <p className="rounded-2xl border border-white/10 p-8 text-white/50">Este administrador ainda não está vinculado a um provedor.</p>;

  const Picture = ({ field, title, hint }: { field: 'logo_url' | 'background_url' | 'login_background_url'; title: string; hint: string }) => <div className="rounded-2xl border border-white/10 bg-black/15 p-4"><b className="text-sm">{title}</b><small className="mt-1 block text-white/40">{hint}</small>{branding[field] ? <div className="relative mt-3"><img src={branding[field] || ''} alt={`Prévia de ${title}`} className={`w-full rounded-xl bg-black/30 object-contain ${field === 'logo_url' ? 'h-24' : 'h-32'}`} /><button type="button" onClick={() => setBranding({ ...branding, [field]: null })} className="mt-2 text-xs text-red-300">Remover imagem</button></div> : <div className={`mt-3 rounded-xl bg-black/20 ${field === 'logo_url' ? 'h-24' : 'h-32'}`} />}<label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 p-3 text-xs text-white/60 hover:border-lime-300/40">{uploading === field ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Escolher no computador<input hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" onChange={(e) => upload(field, e.target.files?.[0])} /></label></div>;

  return <div className="space-y-6"><div><h1 className="text-3xl font-semibold">Branding</h1><p className="mt-2 text-sm text-white/45">{isSuper ? 'Identidade exclusiva do painel Super Admin e padrão inicial do app.' : 'Identidade exclusiva do seu provedor.'}</p></div>
    <form onSubmit={save} className="space-y-6"><section className="rounded-3xl border border-white/10 bg-white/[.04] p-6"><label><span className="mb-2 block text-xs text-white/60">Nome do app</span><input required value={branding.app_name} onChange={(e) => setBranding({ ...branding, app_name: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-lime-300/50" /></label></section>
    <section className="rounded-3xl border border-white/10 bg-white/[.04] p-6"><div className="mb-5 flex gap-3"><Image className="text-lime-300" /><b>Imagens</b></div><div className="grid gap-4 lg:grid-cols-2"><Picture field="logo_url" title="Logo" hint="PNG transparente recomendado" /><Picture field="login_background_url" title="Fundo do acesso" hint="Usado somente na tela de login" /></div></section>
    <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/[.04] p-6 sm:grid-cols-2 lg:grid-cols-4"><HexColor label="Cor principal" value={branding.primary_color} onChange={(value) => setBranding({ ...branding, primary_color: value })} /><label><span className="mb-2 flex items-center justify-between text-xs text-white/60"><span>Tamanho das fontes</span><b className="text-white/80">{Math.round((branding.main_font_scale / 1.3) * 100)}%</b></span><input type="range" min="0.85" max="1.30" step="0.05" value={branding.main_font_scale} onChange={(event) => setBranding({ ...branding, main_font_scale: Number(event.target.value) })} className="mt-3 w-full accent-lime-300" /><span className="mt-2 block text-[10px] text-white/35">100% é o novo tamanho padrão do app</span></label><ChoiceSelect label="Player" value={branding.player_layout} options={[['default', 'Padrão'], ['compact', 'Compacto'], ['cinema', 'Cinema']]} onChange={(value) => setBranding({ ...branding, player_layout: value })} /><ChoiceSelect label="Configurações" value={branding.settings_layout} options={[['default', 'Padrão'], ['grouped', 'Agrupado']]} onChange={(value) => setBranding({ ...branding, settings_layout: value })} /></section>
    {error && <p className="rounded-xl border border-red-300/20 bg-red-400/10 p-3 text-xs text-red-200">{error}</p>}<div className="flex items-center gap-3"><button disabled={saving || !!uploading} className="flex items-center gap-2 rounded-xl bg-lime-300 px-6 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar branding</button>{saved && <span className="flex gap-2 text-sm text-emerald-300"><Check className="h-4 w-4" /> Salvo e aplicado</span>}</div></form></div>;
}

function HexColor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const preview = validHex(value) ? value : '#000000';
  return <label><span className="mb-2 block text-xs text-white/60">{label}</span><span className="flex items-center gap-3"><span className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-white/20" style={{ backgroundColor: preview }}><input aria-label={`Escolher ${label}`} type="color" value={preview} onChange={(event) => onChange(event.target.value.toUpperCase())} className="absolute -inset-3 h-16 w-16 cursor-pointer opacity-0" /></span><span className="relative min-w-0 flex-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-white/35">HEX</span><input value={value} maxLength={7} spellCheck={false} onChange={(event) => onChange(event.target.value.startsWith('#') ? event.target.value.toUpperCase() : `#${event.target.value.toUpperCase()}`)} placeholder="#BEF264" className={`w-full rounded-xl border bg-white/5 py-3 pl-11 pr-3 font-mono text-sm uppercase outline-none ${validHex(value) ? 'border-white/10 focus:border-lime-300/50' : 'border-red-300/40'}`} /></span></span></label>;
}

function ChoiceSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(([id]) => id === value)?.[1] || options[0][1];
  return <div className="relative"><span className="mb-2 block text-xs text-white/60">{label}</span><button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#202832] px-4 py-3 text-left text-sm text-white"><span>{selected}</span><ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} /></button>{open && <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-white/10 bg-[#202832] p-1 shadow-2xl shadow-black/50">{options.map(([id, text]) => <button type="button" key={id} onClick={() => { onChange(id); setOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${id === value ? 'bg-lime-300 text-slate-950' : 'text-white hover:bg-white/10'}`}><span>{text}</span>{id === value && <Check className="h-4 w-4" />}</button>)}</div>}</div>;
}
