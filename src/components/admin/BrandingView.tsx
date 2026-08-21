import { FormEvent, useEffect, useState } from 'react';
import { Check, Image, Loader2, Palette, Save, Type } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Branding {
  app_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  player_layout: string;
  settings_layout: string;
}

export function BrandingView() {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('app_branding').select('app_name, logo_url, primary_color, secondary_color, player_layout, settings_layout').maybeSingle();
      if (data) setBranding(data as Branding);
      setLoading(false);
    })();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!branding) return;
    setSaving(true);
    setError('');
    const { error: updateError } = await supabase.from('app_branding').update({
      app_name: branding.app_name,
      logo_url: branding.logo_url,
      primary_color: branding.primary_color,
      secondary_color: branding.secondary_color,
      player_layout: branding.player_layout,
      settings_layout: branding.settings_layout,
    }).eq('singleton', true);
    setSaving(false);
    if (updateError) { setError('Erro ao salvar.'); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading || !branding) {
    return <div className="flex items-center justify-center py-20 text-white/40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Branding</h1>
        <p className="mt-2 text-sm text-white/45">Personalize o app com sua identidade visual.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-300/15 text-lime-300"><Type className="h-5 w-5" /></span>
            <div><h2 className="font-semibold">Identidade</h2><p className="text-xs text-white/40">Nome do app e logo</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">Nome do app</span>
              <input value={branding.app_name} onChange={(e) => setBranding({ ...branding, app_name: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50" />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">URL do logo</span>
              <input value={branding.logo_url ?? ''} onChange={(e) => setBranding({ ...branding, logo_url: e.target.value || null })} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50" placeholder="https://…" />
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-300/15 text-lime-300"><Palette className="h-5 w-5" /></span>
            <div><h2 className="font-semibold">Cores</h2><p className="text-xs text-white/40">Cor primária e secundária do app</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">Cor primária</span>
              <div className="flex items-center gap-3">
                <input type="color" value={branding.primary_color} onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })} className="h-12 w-16 shrink-0 cursor-pointer rounded-xl border border-white/10 bg-transparent" />
                <input value={branding.primary_color} onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50" />
              </div>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">Cor secundária (fundo)</span>
              <div className="flex items-center gap-3">
                <input type="color" value={branding.secondary_color} onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })} className="h-12 w-16 shrink-0 cursor-pointer rounded-xl border border-white/10 bg-transparent" />
                <input value={branding.secondary_color} onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50" />
              </div>
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-7">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-lime-300/15 text-lime-300"><Image className="h-5 w-5" /></span>
            <div><h2 className="font-semibold">Layouts</h2><p className="text-xs text-white/40">Escolha o estilo do player e das configurações</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">Layout do player</span>
              <select value={branding.player_layout} onChange={(e) => setBranding({ ...branding, player_layout: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50">
                <option value="default" className="bg-slate-900">Padrão</option>
                <option value="compact" className="bg-slate-900">Compacto</option>
                <option value="cinema" className="bg-slate-900">Cinema</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/60">Layout das configurações</span>
              <select value={branding.settings_layout} onChange={(e) => setBranding({ ...branding, settings_layout: e.target.value })} className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white outline-none focus:border-lime-300/50">
                <option value="default" className="bg-slate-900">Padrão</option>
                <option value="grouped" className="bg-slate-900">Agrupado</option>
              </select>
            </label>
          </div>
        </div>

        {error && <p className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-xs text-red-200">{error}</p>}

        <div className="flex items-center gap-3">
          <button disabled={saving} className="flex items-center gap-2 rounded-xl bg-lime-300 px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar branding
          </button>
          {saved && <span className="flex items-center gap-1.5 text-sm text-emerald-300"><Check className="h-4 w-4" /> Salvo com sucesso</span>}
        </div>
      </form>
    </div>
  );
}
