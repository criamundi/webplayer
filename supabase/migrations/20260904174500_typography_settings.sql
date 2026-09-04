/*
  Tipografia por branding.
  Inter passa a ser o padrão.
  Escala simplificada para A-, A e A+.
*/

ALTER TABLE public.app_branding
  ADD COLUMN IF NOT EXISTS font_family text NOT NULL DEFAULT 'Inter';

ALTER TABLE public.provider_branding
  ADD COLUMN IF NOT EXISTS font_family text NOT NULL DEFAULT 'Inter';

UPDATE public.app_branding
SET font_family = 'Inter'
WHERE font_family IS NULL OR trim(font_family) = '';

UPDATE public.provider_branding
SET font_family = 'Inter'
WHERE font_family IS NULL OR trim(font_family) = '';

ALTER TABLE public.app_branding
  ALTER COLUMN main_font_scale SET DEFAULT 1;

ALTER TABLE public.provider_branding
  ALTER COLUMN main_font_scale SET DEFAULT 1;

UPDATE public.app_branding
SET main_font_scale = 1
WHERE main_font_scale NOT IN (0.92, 1, 1.10);

UPDATE public.provider_branding
SET main_font_scale = 1
WHERE main_font_scale NOT IN (0.92, 1, 1.10);
