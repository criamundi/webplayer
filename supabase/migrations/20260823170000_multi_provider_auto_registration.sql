/* Nexus Play Beta 0.2 — multi-provedor e cadastro automático */

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
UPDATE public.profiles SET role = 'super_admin' WHERE role = 'admin';
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.iptv_providers(id) ON DELETE SET NULL,
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('super_admin', 'provider_admin', 'user'));

ALTER TABLE public.iptv_providers
  ADD COLUMN IF NOT EXISTS auto_registration boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_dns_id uuid REFERENCES public.iptv_dns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS renewal_url text;

ALTER TABLE public.iptv_dns
  ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.iptv_providers(id) ON DELETE CASCADE;

ALTER TABLE public.iptv_lines
  ADD COLUMN IF NOT EXISTS local_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS upstream_status text,
  ADD COLUMN IF NOT EXISTS upstream_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS upstream_active_connections integer,
  ADD COLUMN IF NOT EXISTS upstream_max_connections integer,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_source text NOT NULL DEFAULT 'manual'
    CHECK (registration_source IN ('manual', 'automatic'));
ALTER TABLE public.iptv_lines ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE public.iptv_lines ALTER COLUMN created_by DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS iptv_lines_provider_username_unique
  ON public.iptv_lines(provider_id, username) WHERE provider_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.provider_branding (
  provider_id uuid PRIMARY KEY REFERENCES public.iptv_providers(id) ON DELETE CASCADE,
  app_name text NOT NULL DEFAULT 'Nexus Play',
  logo_url text,
  background_url text,
  login_background_url text,
  primary_color text NOT NULL DEFAULT '#bef264',
  secondary_color text NOT NULL DEFAULT '#091018',
  player_layout text NOT NULL DEFAULT 'default' CHECK (player_layout IN ('default', 'compact', 'cinema')),
  settings_layout text NOT NULL DEFAULT 'default' CHECK (settings_layout IN ('default', 'grouped')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_branding ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.current_provider_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT provider_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_manage_provider(target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'provider_admin' AND provider_id = target
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin','provider_admin'));
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_provider_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_provider(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin(), public.current_provider_id(), public.can_manage_provider(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_provider_admin(target_email text, target_provider uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.profiles SET role = 'provider_admin', provider_id = target_provider
  WHERE lower(email) = lower(trim(target_email));
  RETURN FOUND;
END;
$$;
CREATE OR REPLACE FUNCTION public.remove_provider_admin(target_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.profiles SET role = 'user', provider_id = NULL WHERE id = target_id AND role = 'provider_admin';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_provider_admin(text, uuid), public.remove_provider_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_provider_admin(text, uuid), public.remove_provider_admin(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_profile_for_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, COALESCE(NEW.email, ''),
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.profiles) THEN 'super_admin' ELSE 'user' END);
  RETURN NEW;
END;
$$;

-- Perfis: o global vê todos; o admin do provedor vê a si mesmo.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_scope" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin());

-- Provedores: público enxerga somente o catálogo ativo; alterações são globais.
DROP POLICY IF EXISTS "providers_select_active" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_anon_select_active" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_insert_admin" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_update_admin" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_delete_admin" ON public.iptv_providers;
CREATE POLICY "providers_select_scope" ON public.iptv_providers FOR SELECT TO authenticated
  USING (active OR public.is_super_admin() OR id = public.current_provider_id());
CREATE POLICY "providers_anon_active" ON public.iptv_providers FOR SELECT TO anon USING (active);
CREATE POLICY "providers_insert_super" ON public.iptv_providers FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY "providers_update_super" ON public.iptv_providers FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "providers_delete_super" ON public.iptv_providers FOR DELETE TO authenticated USING (public.is_super_admin());

-- Linhas e DNS ficam isolados pelo provider_id.
DROP POLICY IF EXISTS "lines_select_admin" ON public.iptv_lines;
DROP POLICY IF EXISTS "lines_insert_admin" ON public.iptv_lines;
DROP POLICY IF EXISTS "lines_update_admin" ON public.iptv_lines;
DROP POLICY IF EXISTS "lines_delete_admin" ON public.iptv_lines;
CREATE POLICY "lines_select_scope" ON public.iptv_lines FOR SELECT TO authenticated USING (public.can_manage_provider(provider_id));
CREATE POLICY "lines_insert_scope" ON public.iptv_lines FOR INSERT TO authenticated WITH CHECK (public.can_manage_provider(provider_id));
CREATE POLICY "lines_update_scope" ON public.iptv_lines FOR UPDATE TO authenticated USING (public.can_manage_provider(provider_id)) WITH CHECK (public.can_manage_provider(provider_id));
CREATE POLICY "lines_delete_scope" ON public.iptv_lines FOR DELETE TO authenticated USING (public.can_manage_provider(provider_id));

DROP POLICY IF EXISTS "dns_select" ON public.iptv_dns;
DROP POLICY IF EXISTS "dns_insert_admin" ON public.iptv_dns;
DROP POLICY IF EXISTS "dns_update_admin" ON public.iptv_dns;
DROP POLICY IF EXISTS "dns_delete_admin" ON public.iptv_dns;
CREATE POLICY "dns_select_scope" ON public.iptv_dns FOR SELECT TO authenticated USING (public.can_manage_provider(provider_id));
CREATE POLICY "dns_insert_scope" ON public.iptv_dns FOR INSERT TO authenticated WITH CHECK (public.can_manage_provider(provider_id));
CREATE POLICY "dns_update_scope" ON public.iptv_dns FOR UPDATE TO authenticated USING (public.can_manage_provider(provider_id)) WITH CHECK (public.can_manage_provider(provider_id));
CREATE POLICY "dns_delete_scope" ON public.iptv_dns FOR DELETE TO authenticated USING (public.can_manage_provider(provider_id));

CREATE POLICY "provider_branding_select" ON public.provider_branding FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "provider_branding_insert_scope" ON public.provider_branding FOR INSERT TO authenticated WITH CHECK (public.can_manage_provider(provider_id));
CREATE POLICY "provider_branding_update_scope" ON public.provider_branding FOR UPDATE TO authenticated USING (public.can_manage_provider(provider_id)) WITH CHECK (public.can_manage_provider(provider_id));
CREATE POLICY "provider_branding_delete_super" ON public.provider_branding FOR DELETE TO authenticated USING (public.is_super_admin());

DROP TRIGGER IF EXISTS provider_branding_touch ON public.provider_branding;
CREATE TRIGGER provider_branding_touch BEFORE UPDATE ON public.provider_branding
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.provider_branding (provider_id)
SELECT id FROM public.iptv_providers ON CONFLICT (provider_id) DO NOTHING;

-- O primeiro DNS existente de cada provedor vira o padrão quando possível.
UPDATE public.iptv_dns d SET provider_id = l.provider_id
FROM public.iptv_lines l WHERE l.dns_id = d.id AND d.provider_id IS NULL AND l.provider_id IS NOT NULL;
UPDATE public.iptv_providers p SET default_dns_id = q.id
FROM (SELECT DISTINCT ON (provider_id) provider_id, id FROM public.iptv_dns WHERE provider_id IS NOT NULL ORDER BY provider_id, created_at) q
WHERE p.id = q.provider_id AND p.default_dns_id IS NULL;

-- Imagens enviadas pelo painel (logo e fundos por provedor).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('provider-branding', 'provider-branding', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "branding_assets_public_read" ON storage.objects;
CREATE POLICY "branding_assets_public_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'provider-branding');
DROP POLICY IF EXISTS "branding_assets_insert_scope" ON storage.objects;
CREATE POLICY "branding_assets_insert_scope" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'provider-branding' AND public.can_manage_provider((storage.foldername(name))[1]::uuid));
DROP POLICY IF EXISTS "branding_assets_update_scope" ON storage.objects;
CREATE POLICY "branding_assets_update_scope" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'provider-branding' AND public.can_manage_provider((storage.foldername(name))[1]::uuid));
DROP POLICY IF EXISTS "branding_assets_delete_scope" ON storage.objects;
CREATE POLICY "branding_assets_delete_scope" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'provider-branding' AND public.can_manage_provider((storage.foldername(name))[1]::uuid));
