ALTER TABLE public.app_branding
  ALTER COLUMN main_font_scale SET DEFAULT 1.30;

ALTER TABLE public.provider_branding
  ALTER COLUMN main_font_scale SET DEFAULT 1.30;

UPDATE public.app_branding
SET main_font_scale = 1.30
WHERE main_font_scale = 1;

UPDATE public.provider_branding
SET main_font_scale = 1.30
WHERE main_font_scale = 1;
