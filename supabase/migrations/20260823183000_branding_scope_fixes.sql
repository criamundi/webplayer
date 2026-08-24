/* Corrige branding global, branding por provedor e upload de imagens. */
ALTER TABLE public.app_branding
  ADD COLUMN IF NOT EXISTS background_url text,
  ADD COLUMN IF NOT EXISTS login_background_url text;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'));
$$;

CREATE OR REPLACE FUNCTION public.find_public_provider(provider_name text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name
  FROM public.iptv_providers p
  WHERE p.active = true AND lower(p.name) = lower(trim(provider_name))
  ORDER BY p.created_at
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.find_public_provider(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_public_provider(text) TO anon, authenticated;

DROP POLICY IF EXISTS "providers_anon_active" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_select_active" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_select_scope" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_select_admin_scope" ON public.iptv_providers;
CREATE POLICY "providers_select_admin_scope" ON public.iptv_providers FOR SELECT TO authenticated
  USING (public.is_super_admin() OR id = public.current_provider_id());

DROP POLICY IF EXISTS "branding_update_admin" ON public.app_branding;
DROP POLICY IF EXISTS "branding_update_super" ON public.app_branding;
CREATE POLICY "branding_update_super" ON public.app_branding
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.can_manage_branding_folder(folder_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF folder_name = 'global' THEN
    RETURN public.is_super_admin();
  END IF;
  IF folder_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN public.can_manage_provider(folder_name::uuid);
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.can_manage_branding_folder(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_branding_folder(text) TO authenticated;

DROP POLICY IF EXISTS "branding_assets_insert_scope" ON storage.objects;
DROP POLICY IF EXISTS "branding_assets_update_scope" ON storage.objects;
DROP POLICY IF EXISTS "branding_assets_delete_scope" ON storage.objects;
CREATE POLICY "branding_assets_insert_scope" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'provider-branding' AND public.can_manage_branding_folder((storage.foldername(name))[1]));
CREATE POLICY "branding_assets_update_scope" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'provider-branding' AND public.can_manage_branding_folder((storage.foldername(name))[1]));
CREATE POLICY "branding_assets_delete_scope" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'provider-branding' AND public.can_manage_branding_folder((storage.foldername(name))[1]));
