/*
  Configuração do widget esportivo por provedor.
*/

ALTER TABLE public.provider_branding
  ADD COLUMN IF NOT EXISTS sports_widget_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sports_competitions text[] NOT NULL DEFAULT ARRAY[
    'bra.1',
    'bra.copa_do_brazil',
    'conmebol.libertadores',
    'uefa.champions',
    'eng.1',
    'esp.1',
    'ita.1'
  ]::text[];
