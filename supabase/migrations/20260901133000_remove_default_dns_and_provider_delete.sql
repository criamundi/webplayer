/*
  Remove a antiga ideia de DNS padrão do provedor.
  O connect-line descobre o DNS correto testando os DNS ativos cadastrados.
*/

ALTER TABLE public.iptv_providers
  DROP COLUMN IF EXISTS default_dns_id;

/*
  Mantemos server_url apenas como coluna legada, sem uso pelo player.
  Limpamos os valores para evitar que telas antigas interpretem como fallback.
*/
UPDATE public.iptv_providers
SET server_url = NULL
WHERE server_url IS NOT NULL;

/*
  Nova função de configurações do próprio provedor, sem DNS padrão e sem URL de servidor.
*/
CREATE OR REPLACE FUNCTION public.update_own_provider_settings_v2(
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
  SET renewal_url = NULLIF(trim(next_renewal_url), ''),
      auto_registration = next_auto_registration,
      server_url = NULL,
      updated_at = now()
  WHERE id = own_provider;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_provider_settings_v2(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_provider_settings_v2(text, boolean) TO authenticated;

/*
  Exclusão completa e controlada do provedor.
  Somente Super Admin pode executar.
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
    SELECT 1
    FROM public.iptv_providers
    WHERE id = target_provider_id
  ) THEN
    RETURN false;
  END IF;

  /*
    Remove dados operacionais que não devem ficar órfãos.
    DNS e provider_branding também possuem ON DELETE CASCADE,
    mas são removidos explicitamente para deixar a intenção clara.
  */
  DELETE FROM public.iptv_lines
  WHERE provider_id = target_provider_id;

  DELETE FROM public.iptv_bouquets
  WHERE provider_id = target_provider_id;

  DELETE FROM public.provider_branding
  WHERE provider_id = target_provider_id;

  DELETE FROM public.iptv_dns
  WHERE provider_id = target_provider_id;

  /*
    Administradores vinculados permanecem como usuários,
    mas deixam de pertencer ao provedor excluído.
  */
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
