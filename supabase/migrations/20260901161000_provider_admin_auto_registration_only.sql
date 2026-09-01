/*
  Regra final de permissões:
  - Super Admin administra provedores.
  - Provider Admin só altera auto_registration do próprio provedor.
*/

CREATE OR REPLACE FUNCTION public.update_own_provider_auto_registration(
  next_auto_registration boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  own_provider uuid;
BEGIN
  SELECT provider_id
  INTO own_provider
  FROM public.profiles
  WHERE id = auth.uid()
    AND role = 'provider_admin'
    AND admin_active = true;

  IF own_provider IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.iptv_providers
  SET auto_registration = next_auto_registration,
      updated_at = now()
  WHERE id = own_provider;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_provider_auto_registration(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_provider_auto_registration(boolean) TO authenticated;

/*
  A função de exclusão continua exclusiva do Super Admin.
*/
CREATE OR REPLACE FUNCTION public.delete_provider_cascade(
  target_provider_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.iptv_providers WHERE id = target_provider_id
  ) THEN
    RETURN false;
  END IF;

  DELETE FROM public.iptv_lines WHERE provider_id = target_provider_id;
  DELETE FROM public.iptv_bouquets WHERE provider_id = target_provider_id;
  DELETE FROM public.provider_branding WHERE provider_id = target_provider_id;
  DELETE FROM public.iptv_dns WHERE provider_id = target_provider_id;

  UPDATE public.profiles
  SET provider_id = NULL
  WHERE provider_id = target_provider_id;

  DELETE FROM public.iptv_providers
  WHERE id = target_provider_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_provider_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_provider_cascade(uuid) TO authenticated;
