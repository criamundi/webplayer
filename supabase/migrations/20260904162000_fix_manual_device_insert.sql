/*
  Garante compatibilidade do cadastro manual de dispositivos.

  - renewal_url existe mesmo em instalações que pularam a migration anterior.
  - policy de INSERT respeita o provedor do administrador.
  - Super Admin continua podendo inserir em qualquer provedor.
*/

ALTER TABLE public.iptv_lines
  ADD COLUMN IF NOT EXISTS renewal_url text;

DROP POLICY IF EXISTS "lines_insert_scope" ON public.iptv_lines;

CREATE POLICY "lines_insert_scope"
ON public.iptv_lines
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_manage_provider(provider_id)
);
