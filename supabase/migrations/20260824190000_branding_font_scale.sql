ALTER TABLE public.app_branding
  ADD COLUMN IF NOT EXISTS main_font_scale numeric NOT NULL DEFAULT 1
  CHECK (main_font_scale BETWEEN 0.85 AND 1.30);

ALTER TABLE public.provider_branding
  ADD COLUMN IF NOT EXISTS main_font_scale numeric NOT NULL DEFAULT 1
  CHECK (main_font_scale BETWEEN 0.85 AND 1.30);
