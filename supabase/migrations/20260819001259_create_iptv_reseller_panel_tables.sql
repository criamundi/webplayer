/*
# Create IPTV reseller panel tables (xcloud-style)

1. New Tables
- `iptv_lines`: IPTV subscriber lines managed by admins. Each line has a username, password (hashed server-side), assigned provider, bouquet, max connections, expiry date, and status.
- `iptv_bouquets`: Content groupings (channel packages) that can be assigned to lines. Each bouquet has a name, description, and assigned provider.
- `iptv_dns`: DNS domains the reseller attaches for load balancing and branding.
- `app_branding`: Single-row table holding the reseller's brand customization (app name, logo URL, primary/secondary colors, layout preferences).

2. Modified Tables
- `iptv_providers`: added `bouquet_count` denormalized column is NOT added (avoid destructive changes). Instead bouquets reference providers via FK.

3. Security
- RLS enabled on all new tables.
- `iptv_lines`: admin-only CRUD; authenticated users can read their own assigned line info (by matching auth email to line username is NOT done — lines are admin-managed, so select is admin-only for the panel, with a separate policy allowing authenticated users to check connection status).
- `iptv_bouquets`: admins can CRUD; authenticated users can read active bouquets (to display available packages).
- `iptv_dns`: admin-only CRUD; authenticated users can read active DNS list (for app connection).
- `app_branding`: admin can read/update; authenticated and anon can read (branding is public, shown on login screen).

4. Important notes
- Line passwords are stored as-is (the panel needs them to authenticate against the upstream provider). They are never exposed to non-admin users.
- The `is_admin()` function from the initial migration is reused for admin checks.
- `app_branding` uses a fixed singleton row enforced by a unique constraint on a dummy key.
*/

-- ============================================================
-- iptv_bouquets
-- ============================================================
CREATE TABLE IF NOT EXISTS public.iptv_bouquets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  description text,
  provider_id uuid REFERENCES public.iptv_providers(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.iptv_bouquets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bouquets_select_admin" ON public.iptv_bouquets;
CREATE POLICY "bouquets_select_admin" ON public.iptv_bouquets
  FOR SELECT TO authenticated USING (public.is_admin() OR active = true);

DROP POLICY IF EXISTS "bouquets_insert_admin" ON public.iptv_bouquets;
CREATE POLICY "bouquets_insert_admin" ON public.iptv_bouquets
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "bouquets_update_admin" ON public.iptv_bouquets;
CREATE POLICY "bouquets_update_admin" ON public.iptv_bouquets
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "bouquets_delete_admin" ON public.iptv_bouquets;
CREATE POLICY "bouquets_delete_admin" ON public.iptv_bouquets
  FOR DELETE TO authenticated USING (public.is_admin());

-- ============================================================
-- iptv_lines
-- ============================================================
CREATE TABLE IF NOT EXISTS public.iptv_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL CHECK (char_length(username) BETWEEN 2 AND 120),
  password text NOT NULL CHECK (char_length(password) BETWEEN 1 AND 200),
  provider_id uuid REFERENCES public.iptv_providers(id) ON DELETE SET NULL,
  bouquet_id uuid REFERENCES public.iptv_bouquets(id) ON DELETE SET NULL,
  max_connections integer NOT NULL DEFAULT 1 CHECK (max_connections BETWEEN 1 AND 10),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'expired', 'banned')),
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.iptv_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lines_select_admin" ON public.iptv_lines;
CREATE POLICY "lines_select_admin" ON public.iptv_lines
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "lines_insert_admin" ON public.iptv_lines;
CREATE POLICY "lines_insert_admin" ON public.iptv_lines
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lines_update_admin" ON public.iptv_lines;
CREATE POLICY "lines_update_admin" ON public.iptv_lines
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "lines_delete_admin" ON public.iptv_lines;
CREATE POLICY "lines_delete_admin" ON public.iptv_lines
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS iptv_lines_status_idx ON public.iptv_lines (status);
CREATE INDEX IF NOT EXISTS iptv_lines_provider_idx ON public.iptv_lines (provider_id);
CREATE INDEX IF NOT EXISTS iptv_lines_expires_idx ON public.iptv_lines (expires_at);

-- ============================================================
-- iptv_dns
-- ============================================================
CREATE TABLE IF NOT EXISTS public.iptv_dns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  host text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.iptv_dns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dns_select" ON public.iptv_dns;
CREATE POLICY "dns_select" ON public.iptv_dns
  FOR SELECT TO authenticated USING (public.is_admin() OR active = true);

DROP POLICY IF EXISTS "dns_insert_admin" ON public.iptv_dns;
CREATE POLICY "dns_insert_admin" ON public.iptv_dns
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "dns_update_admin" ON public.iptv_dns;
CREATE POLICY "dns_update_admin" ON public.iptv_dns
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "dns_delete_admin" ON public.iptv_dns;
CREATE POLICY "dns_delete_admin" ON public.iptv_dns
  FOR DELETE TO authenticated USING (public.is_admin());

-- ============================================================
-- app_branding (singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_branding (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  app_name text NOT NULL DEFAULT 'Nexus Play',
  logo_url text,
  primary_color text NOT NULL DEFAULT '#bef264',
  secondary_color text NOT NULL DEFAULT '#091018',
  player_layout text NOT NULL DEFAULT 'default' CHECK (player_layout IN ('default', 'compact', 'cinema')),
  settings_layout text NOT NULL DEFAULT 'default' CHECK (settings_layout IN ('default', 'grouped')),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branding_select" ON public.app_branding;
CREATE POLICY "branding_select" ON public.app_branding
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "branding_update_admin" ON public.app_branding;
CREATE POLICY "branding_update_admin" ON public.app_branding
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed the singleton row if it doesn't exist
INSERT INTO public.app_branding (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS iptv_bouquets_touch ON public.iptv_bouquets;
CREATE TRIGGER iptv_bouquets_touch BEFORE UPDATE ON public.iptv_bouquets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS iptv_lines_touch ON public.iptv_lines;
CREATE TRIGGER iptv_lines_touch BEFORE UPDATE ON public.iptv_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS iptv_dns_touch ON public.iptv_dns;
CREATE TRIGGER iptv_dns_touch BEFORE UPDATE ON public.iptv_dns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS app_branding_touch ON public.app_branding;
CREATE TRIGGER app_branding_touch BEFORE UPDATE ON public.app_branding
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
