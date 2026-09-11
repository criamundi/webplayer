-- Registra automaticamente TVs onde o app foi instalado/aberto.
CREATE TABLE IF NOT EXISTS public.iptv_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES public.iptv_lines(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES public.iptv_providers(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT 'Smart TV',
  device_key text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'tv',
  model text,
  model_code text,
  firmware text,
  app_version text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS iptv_devices_line_idx ON public.iptv_devices(line_id);
CREATE INDEX IF NOT EXISTS iptv_devices_provider_idx ON public.iptv_devices(provider_id);
CREATE INDEX IF NOT EXISTS iptv_devices_last_seen_idx ON public.iptv_devices(last_seen_at DESC);

ALTER TABLE public.iptv_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devices_select_admin_scope" ON public.iptv_devices;
CREATE POLICY "devices_select_admin_scope" ON public.iptv_devices
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR provider_id = public.current_provider_id());

DROP POLICY IF EXISTS "devices_update_admin_scope" ON public.iptv_devices;
CREATE POLICY "devices_update_admin_scope" ON public.iptv_devices
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR provider_id = public.current_provider_id())
  WITH CHECK (public.is_super_admin() OR provider_id = public.current_provider_id());

DROP POLICY IF EXISTS "devices_delete_admin_scope" ON public.iptv_devices;
CREATE POLICY "devices_delete_admin_scope" ON public.iptv_devices
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR provider_id = public.current_provider_id());

DROP TRIGGER IF EXISTS iptv_devices_touch ON public.iptv_devices;
CREATE TRIGGER iptv_devices_touch BEFORE UPDATE ON public.iptv_devices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Garante first_seen_at imutável quando o mesmo DUID faz heartbeat.
CREATE OR REPLACE FUNCTION public.preserve_iptv_device_first_seen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.first_seen_at = OLD.first_seen_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS iptv_devices_preserve_first_seen ON public.iptv_devices;
CREATE TRIGGER iptv_devices_preserve_first_seen
  BEFORE UPDATE ON public.iptv_devices
  FOR EACH ROW EXECUTE FUNCTION public.preserve_iptv_device_first_seen();
