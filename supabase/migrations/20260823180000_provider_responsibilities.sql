/* O Super Admin cria somente o nome; cada provedor configura sua operação. */
CREATE OR REPLACE FUNCTION public.update_own_provider_settings(
  next_server_url text,
  next_default_dns_id uuid,
  next_renewal_url text,
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
  SELECT provider_id INTO own_provider
  FROM public.profiles
  WHERE id = auth.uid() AND role = 'provider_admin' AND admin_active = true;

  IF own_provider IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF next_default_dns_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.iptv_dns
    WHERE id = next_default_dns_id AND provider_id = own_provider
  ) THEN
    RAISE EXCEPTION 'invalid dns';
  END IF;

  UPDATE public.iptv_providers
  SET server_url = NULLIF(trim(next_server_url), ''),
      default_dns_id = next_default_dns_id,
      renewal_url = NULLIF(trim(next_renewal_url), ''),
      auto_registration = next_auto_registration,
      updated_at = now()
  WHERE id = own_provider;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_provider_settings(text, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_provider_settings(text, uuid, text, boolean) TO authenticated;
