ALTER TABLE public.app_branding
  ADD COLUMN IF NOT EXISTS main_font_scale numeric NOT NULL DEFAULT 1
  CHECK (main_font_scale BETWEEN 0.85 AND 1.30);

ALTER TABLE public.provider_branding
  ADD COLUMN IF NOT EXISTS main_font_scale numeric NOT NULL DEFAULT 1
  CHECK (main_font_scale BETWEEN 0.85 AND 1.30);

ALTER TABLE public.app_branding ALTER COLUMN main_font_scale SET DEFAULT 1.30;
ALTER TABLE public.provider_branding ALTER COLUMN main_font_scale SET DEFAULT 1.30;

UPDATE public.app_branding SET main_font_scale = 1.30 WHERE main_font_scale = 1;
UPDATE public.provider_branding SET main_font_scale = 1.30 WHERE main_font_scale = 1;
