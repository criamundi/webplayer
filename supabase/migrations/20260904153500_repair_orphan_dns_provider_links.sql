/*
  Repara DNS antigos que ficaram sem provider_id durante a migração
  para multi-provedor.

  Não recria DNS padrão.

  Regras:
  1. Se uma linha já referencia o DNS e possui provider_id, usa esse provedor.
  2. Se existe somente um provedor cadastrado no sistema, DNS ainda órfãos
     pertencem inequivocamente a ele.
  3. Em ambiente com vários provedores, DNS sem evidência permanecem órfãos
     para evitar vinculação incorreta entre provedores.
*/

UPDATE public.iptv_dns AS dns
SET provider_id = inferred.provider_id
FROM (
  SELECT DISTINCT ON (l.dns_id)
    l.dns_id,
    l.provider_id
  FROM public.iptv_lines AS l
  WHERE l.dns_id IS NOT NULL
    AND l.provider_id IS NOT NULL
  ORDER BY l.dns_id, l.created_at DESC NULLS LAST
) AS inferred
WHERE dns.id = inferred.dns_id
  AND dns.provider_id IS NULL;

/*
  Instalações antigas com apenas um provedor:
  todo DNS órfão é desse único provedor.
*/
DO $$
DECLARE
  provider_count integer;
  only_provider uuid;
BEGIN
  SELECT count(*), min(id)
  INTO provider_count, only_provider
  FROM public.iptv_providers;

  IF provider_count = 1 AND only_provider IS NOT NULL THEN
    UPDATE public.iptv_dns
    SET provider_id = only_provider
    WHERE provider_id IS NULL;
  END IF;
END;
$$;
