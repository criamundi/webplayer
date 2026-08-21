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
