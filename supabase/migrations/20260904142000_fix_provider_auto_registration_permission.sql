/*
  Corrige divergência entre o login do Admin e o RPC de Cadastro automático.

  O frontend permite administrador quando admin_active IS NOT FALSE.
  A função anterior exigia admin_active = true, então perfis antigos com NULL
  conseguiam entrar no Admin, mas recebiam "Erro ao salvar".
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
    AND admin_active IS DISTINCT FROM false;

  IF own_provider IS NULL THEN
    RAISE EXCEPTION 'Administrador sem provedor vinculado ou acesso desativado.';
  END IF;

  UPDATE public.iptv_providers
  SET auto_registration = next_auto_registration,
      updated_at = now()
  WHERE id = own_provider;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Provedor vinculado não encontrado.';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_provider_auto_registration(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_provider_auto_registration(boolean) TO authenticated;


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
    AND admin_active IS DISTINCT FROM false;

  IF own_provider IS NULL THEN
    RAISE EXCEPTION 'Administrador sem provedor vinculado ou acesso desativado.';
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
