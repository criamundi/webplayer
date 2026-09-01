/* Todos os usuários administrativos podem gerenciar provedores. */

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'provider_admin', 'admin')
      AND COALESCE(admin_active, true) = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "providers_select_admin_scope" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_select_scope" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_insert_super" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_update_super" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_delete_super" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_insert_admin" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_update_admin" ON public.iptv_providers;
DROP POLICY IF EXISTS "providers_delete_admin" ON public.iptv_providers;

CREATE POLICY "providers_select_admin_all"
ON public.iptv_providers
FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "providers_insert_admin_all"
ON public.iptv_providers
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "providers_update_admin_all"
ON public.iptv_providers
FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "providers_delete_admin_all"
ON public.iptv_providers
FOR DELETE TO authenticated
USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.delete_provider_cascade(target_provider_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.iptv_providers WHERE id = target_provider_id) THEN
    RETURN false;
  END IF;

  DELETE FROM public.iptv_lines WHERE provider_id = target_provider_id;
  DELETE FROM public.iptv_bouquets WHERE provider_id = target_provider_id;
  DELETE FROM public.provider_branding WHERE provider_id = target_provider_id;
  DELETE FROM public.iptv_dns WHERE provider_id = target_provider_id;
  UPDATE public.profiles SET provider_id = NULL WHERE provider_id = target_provider_id;
  DELETE FROM public.iptv_providers WHERE id = target_provider_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_provider_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_provider_cascade(uuid) TO authenticated;
