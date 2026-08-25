ALTER TABLE public.app_branding
  ADD COLUMN IF NOT EXISTS home_feature_type text NOT NULL DEFAULT 'latest_movie'
  CHECK (home_feature_type IN ('latest_movie', 'latest_series'));

ALTER TABLE public.provider_branding
  ADD COLUMN IF NOT EXISTS home_feature_type text NOT NULL DEFAULT 'latest_movie'
  CHECK (home_feature_type IN ('latest_movie', 'latest_series'));
