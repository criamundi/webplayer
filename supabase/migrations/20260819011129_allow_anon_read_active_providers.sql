-- Allow anon (unauthenticated player) to read active providers
-- The player screen no longer requires a user account, so the anon role
-- must be able to list active providers for the access screen.
DROP POLICY IF EXISTS "providers_select_active" ON public.iptv_providers;
CREATE POLICY "providers_select_active" ON public.iptv_providers
  FOR SELECT TO anon, authenticated USING (active = true OR public.is_admin());
