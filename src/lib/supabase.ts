import { createClient } from '@supabase/supabase-js';

const configuredUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const configuredAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const supabaseConfigReady = Boolean(configuredUrl && configuredAnonKey);
export const supabaseConfigError = supabaseConfigReady
  ? null
  : 'Backend não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY antes de gerar o app para TV.';

// Keep module evaluation safe on packaged TVs. A missing local .env must not
// crash the whole React bundle into a black screen before we can show a useful
// diagnostic. The build:tizen command also blocks packaging when these values
// are missing, so these fallbacks are only a final safety net.
const supabaseUrl = configuredUrl || 'https://invalid.local';
const supabaseAnonKey = configuredAnonKey || 'missing-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
