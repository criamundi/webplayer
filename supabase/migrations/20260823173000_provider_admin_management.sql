/* Gerenciamento completo de administradores pelo painel Super Admin. */
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS profiles_provider_admin_idx
  ON public.profiles(provider_id, role);
