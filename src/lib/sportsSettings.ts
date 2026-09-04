import { supabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';
import {
  cacheSportsSettings,
  DEFAULT_SPORTS_COMPETITIONS,
  type SportsCompetitionSlug,
  type SportsWidgetSettings,
} from '@/lib/sports';

export async function loadSportsWidgetSettings(): Promise<SportsWidgetSettings> {
  const credentials = storage.getCredentials();

  if (!credentials?.provider) {
    const fallback = { enabled: true, competitions: [...DEFAULT_SPORTS_COMPETITIONS] };
    cacheSportsSettings(fallback);
    return fallback;
  }

  const { data: rows } = await supabase.rpc('find_public_provider', {
    provider_name: credentials.provider,
  });

  const provider = rows?.[0];

  if (!provider) {
    const fallback = { enabled: true, competitions: [...DEFAULT_SPORTS_COMPETITIONS] };
    cacheSportsSettings(fallback);
    return fallback;
  }

  const { data } = await supabase
    .from('provider_branding')
    .select('sports_widget_enabled, sports_competitions')
    .eq('provider_id', provider.id)
    .maybeSingle();

  const settings: SportsWidgetSettings = {
    enabled: data?.sports_widget_enabled !== false,
    competitions: Array.isArray(data?.sports_competitions) && data.sports_competitions.length
      ? data.sports_competitions as SportsCompetitionSlug[]
      : [...DEFAULT_SPORTS_COMPETITIONS],
  };

  cacheSportsSettings(settings);
  return settings;
}
