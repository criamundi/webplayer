import { useEffect, useState } from 'react';
import { Check, Loader2, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  cacheSportsSettings,
  DEFAULT_SPORTS_COMPETITIONS,
  SPORTS_COMPETITIONS,
  type SportsCompetitionSlug,
  type SportsWidgetSettings,
} from '@/lib/sports';

export function SportsSettingsView() {
  const [providerId, setProviderId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [competitions, setCompetitions] = useState<SportsCompetitionSlug[]>([...DEFAULT_SPORTS_COMPETITIONS]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || !active) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('provider_id')
        .eq('id', auth.user.id)
        .maybeSingle();

      const ownProvider = profile?.provider_id ?? null;
      setProviderId(ownProvider);

      if (!ownProvider) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('provider_branding')
        .select('sports_widget_enabled, sports_competitions')
        .eq('provider_id', ownProvider)
        .maybeSingle();

      if (!active) return;

      const nextEnabled = data?.sports_widget_enabled !== false;
      const nextCompetitions = Array.isArray(data?.sports_competitions) && data.sports_competitions.length
        ? data.sports_competitions.filter((slug: string) => SPORTS_COMPETITIONS.some((item) => item.slug === slug)) as SportsCompetitionSlug[]
        : [...DEFAULT_SPORTS_COMPETITIONS];

      setEnabled(nextEnabled);
      setCompetitions(nextCompetitions);
      cacheSportsSettings({ enabled: nextEnabled, competitions: nextCompetitions });
      setLoading(false);
    })();

    return () => { active = false; };
  }, []);

  const toggleCompetition = (slug: SportsCompetitionSlug) => {
    setCompetitions((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug]
    );
  };

  const save = async () => {
    if (!providerId) {
      setMessage('Este administrador não possui provedor vinculado.');
      return;
    }

    if (enabled && competitions.length === 0) {
      setMessage('Ative pelo menos um campeonato.');
      return;
    }

    setSaving(true);
    setMessage('');

    const payload: SportsWidgetSettings = {
      enabled,
      competitions,
    };

    const { error } = await supabase
      .from('provider_branding')
      .update({
        sports_widget_enabled: enabled,
        sports_competitions: competitions,
      })
      .eq('provider_id', providerId);

    setSaving(false);

    if (error) {
      setMessage(error.message || 'Não foi possível salvar.');
      return;
    }

    cacheSportsSettings(payload);
    setMessage('Configuração salva.');
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-white/40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Esportes</h1>
        <p className="mt-2 text-sm text-white/45">Controle o widget de partidas da Home e os campeonatos acompanhados.</p>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <span>
          <strong className="block text-sm text-white/90">Widget Jogos do Dia</strong>
          <span className="mt-1 block text-xs leading-5 text-white/40">Ativa ou remove completamente o widget esportivo da Home.</span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="h-5 w-5 accent-lime-300"
        />
      </label>

      <section className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 ${enabled ? '' : 'opacity-45'}`}>
        <div className="mb-4 flex items-center gap-3">
          <Trophy className="h-5 w-5 text-lime-300" />
          <div>
            <h2 className="text-sm font-semibold text-white/90">Campeonatos</h2>
            <p className="mt-1 text-xs text-white/40">Escolha quais competições entram na agenda.</p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {SPORTS_COMPETITIONS.map((competition) => (
            <label key={competition.slug} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/15 px-4 py-3">
              <span className="text-sm text-white/75">{competition.fallbackName}</span>
              <input
                type="checkbox"
                disabled={!enabled}
                checked={competitions.includes(competition.slug)}
                onChange={() => toggleCompetition(competition.slug)}
                className="h-4 w-4 accent-lime-300"
              />
            </label>
          ))}
        </div>
      </section>

      {message && <p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-white/65">{message}</p>}

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Salvar
      </button>
    </div>
  );
}
