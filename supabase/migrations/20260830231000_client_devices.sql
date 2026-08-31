/* Nexus Play — controle real de dispositivos por cliente */

ALTER TABLE public.iptv_providers
  ADD COLUMN IF NOT EXISTS device_limit integer NOT NULL DEFAULT 2;

ALTER TABLE public.iptv_providers
  DROP CONSTRAINT IF EXISTS iptv_providers_device_limit_check;

ALTER TABLE public.iptv_providers
  ADD CONSTRAINT iptv_providers_device_limit_check
  CHECK (device_limit BETWEEN 1 AND 20);

CREATE TABLE IF NOT EXISTS public.client_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.iptv_providers(id) ON DELETE CASCADE,
  line_id uuid NOT NULL REFERENCES public.iptv_lines(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_name text,
  device_type text NOT NULL DEFAULT 'browser'
    CHECK (device_type IN ('tv', 'mobile', 'browser')),
  user_agent text,
  active boolean NOT NULL DEFAULT true,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(line_id, device_id)
);

CREATE INDEX IF NOT EXISTS client_devices_provider_idx
  ON public.client_devices(provider_id);

CREATE INDEX IF NOT EXISTS client_devices_line_idx
  ON public.client_devices(line_id);

ALTER TABLE public.client_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_devices_select_scope" ON public.client_devices;
DROP POLICY IF EXISTS "client_devices_insert_scope" ON public.client_devices;
DROP POLICY IF EXISTS "client_devices_update_scope" ON public.client_devices;
DROP POLICY IF EXISTS "client_devices_delete_scope" ON public.client_devices;

CREATE POLICY "client_devices_select_scope" ON public.client_devices
  FOR SELECT TO authenticated
  USING (public.can_manage_provider(provider_id));

CREATE POLICY "client_devices_insert_scope" ON public.client_devices
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_provider(provider_id));

CREATE POLICY "client_devices_update_scope" ON public.client_devices
  FOR UPDATE TO authenticated
  USING (public.can_manage_provider(provider_id))
  WITH CHECK (public.can_manage_provider(provider_id));

CREATE POLICY "client_devices_delete_scope" ON public.client_devices
  FOR DELETE TO authenticated
  USING (public.can_manage_provider(provider_id));

CREATE OR REPLACE FUNCTION public.update_own_device_limit(next_device_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  own_provider uuid;
BEGIN
  IF next_device_limit < 1 OR next_device_limit > 20 THEN
    RAISE EXCEPTION 'invalid device limit';
  END IF;

  SELECT provider_id INTO own_provider
  FROM public.profiles
  WHERE id = auth.uid()
    AND role = 'provider_admin'
    AND admin_active = true;

  IF own_provider IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.iptv_providers
  SET device_limit = next_device_limit,
      updated_at = now()
  WHERE id = own_provider;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_device_limit(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_own_device_limit(integer) TO authenticated;
