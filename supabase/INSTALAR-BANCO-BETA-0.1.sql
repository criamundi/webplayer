-- Nexus Play Beta 0.1 - Instalador completo do banco
-- Cole todo este arquivo no Supabase SQL Editor e clique em Run.
-- Seguro para banco novo. Executa tudo em uma unica transacao.

BEGIN;

-- ============================================================
-- MIGRATION: work/project/supabase/migrations/20260818214023_create_iptv_access_control.sql
-- ============================================================
/*
# Create IPTV access control and provider catalog

1. New Tables
- `profiles`: one protected profile per account with display name, email, role, and creation date.
- `iptv_providers`: administrator-managed IPTV providers with a label, server URL, active status, creator, and timestamps.

2. Security
- Row Level Security is enabled on both tables.
- Profiles are readable only by the signed-in owner; role changes are not client-writable.
- Active providers can be read by signed-in users; only administrators can create, update, or delete providers.
- Provider server URLs are not stored with user credentials. IPTV username and password are submitted only to the server-side connector during a connection attempt.

3. Bootstrap behavior
- The first account created is assigned the administrator role by a database trigger. Later accounts are regular users.
- This keeps the first setup usable while preventing users from choosing their own role.

4. Important notes
- No IPTV password table is created. Credentials are intentionally not persisted by this migration.
- The server-side connector validates the signed-in session and provider before requesting a playlist.
*/

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.iptv_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  server_url text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iptv_providers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_profile_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.profiles) THEN 'admin' ELSE 'user' END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_user();

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;
CREATE POLICY "profiles_delete_own" ON public.profiles
  FOR DELETE TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "providers_select_active" ON public.iptv_providers;
CREATE POLICY "providers_select_active" ON public.iptv_providers
  FOR SELECT TO authenticated USING (active = true OR public.is_admin());

DROP POLICY IF EXISTS "providers_insert_admin" ON public.iptv_providers;
CREATE POLICY "providers_insert_admin" ON public.iptv_providers
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND created_by = auth.uid());

DROP POLICY IF EXISTS "providers_update_admin" ON public.iptv_providers;
CREATE POLICY "providers_update_admin" ON public.iptv_providers
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "providers_delete_admin" ON public.iptv_providers;
CREATE POLICY "providers_delete_admin" ON public.iptv_providers
  FOR DELETE TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS iptv_providers_active_idx ON public.iptv_providers (active);
-- ============================================================
-- MIGRATION: work/project/supabase/migrations/20260818214220_tighten_profile_role_protection.sql
-- ============================================================
/*
# Tighten profile role protection and admin function access

1. Security changes
- Revoke EXECUTE on `is_admin()` from anon so unauthenticated callers cannot probe admin status.
- Revoke UPDATE on the `role` column of `profiles` from authenticated users, so a user cannot change their own role through the data API even though the row-level UPDATE policy allows touching their own row.
- Keep `display_name` user-editable; only the privilege-bearing `role` column is revoked.

2. Important notes
- The `profiles_update_own` policy already constrains the role to its current value, but column privileges are checked before policies, so revoking the column is the authoritative control.
- The `on_auth_user_created_profile` trigger and `create_profile_for_user` function remain the only paths that set `role` (to `admin` for the first account, `user` thereafter).
*/

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
-- ============================================================
-- MIGRATION: work/project/supabase/migrations/20260819001259_create_iptv_reseller_panel_tables.sql
-- ============================================================
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
-- ============================================================
-- MIGRATION: work/project/supabase/migrations/20260819005344_add_dns_to_lines.sql
-- ============================================================
/*
# Add DNS association to IPTV lines

1. Modified Tables
- `iptv_lines`: added `dns_id` column (nullable FK to `iptv_dns`). When set, the M3U link for that line is built using the DNS host instead of the provider server_url.

2. Security
- No policy changes needed — the column is covered by the existing admin-only CRUD policies on `iptv_lines`.

3. Important notes
- `dns_id` is nullable so existing lines keep working without a DNS assigned.
- The M3U link is computed in the frontend from: `dns.host` (or `provider.server_url` as fallback) + `/get.php?username=...&password=...&type=m3u_plus&output=ts`.
*/

ALTER TABLE public.iptv_lines
  ADD COLUMN IF NOT EXISTS dns_id uuid REFERENCES public.iptv_dns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS iptv_lines_dns_idx ON public.iptv_lines (dns_id);
-- ============================================================
-- MIGRATION: work/project/supabase/migrations/20260819011129_allow_anon_read_active_providers.sql
-- ============================================================
-- Allow anon (unauthenticated player) to read active providers
-- The player screen no longer requires a user account, so the anon role
-- must be able to list active providers for the access screen.
DROP POLICY IF EXISTS "providers_select_active" ON public.iptv_providers;
CREATE POLICY "providers_select_active" ON public.iptv_providers
  FOR SELECT TO anon, authenticated USING (active = true OR public.is_admin());
-- ============================================================
-- MIGRATION: work/project/supabase/migrations/20260819013616_make_provider_server_url_optional.sql
-- ============================================================
/*
# Make provider server_url optional

1. Modified Tables
- `iptv_providers`: `server_url` is now nullable. The provider acts as a
  credential/name only; the actual server host comes from the DNS assigned
  to each line. Existing rows keep their values.

2. Security
- No policy changes.

3. Important notes
- The connect-line edge function already prefers DNS over server_url. With
  server_url nullable, lines without a DNS and without a provider URL will
  return a clear "server unavailable" error instead of crashing.
*/

ALTER TABLE public.iptv_providers ALTER COLUMN server_url DROP NOT NULL;
COMMIT;

-- Verificacao final
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('profiles', 'iptv_providers', 'iptv_bouquets', 'iptv_lines', 'iptv_dns', 'app_branding') ORDER BY tablename;
