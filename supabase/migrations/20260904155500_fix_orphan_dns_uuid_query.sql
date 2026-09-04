/*
  Correção da migration anterior:
  PostgreSQL não possui min(uuid) nativo.
  Reexecuta de forma segura o reparo de DNS órfãos.
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

DO $$
DECLARE
  provider_count integer;
  only_provider uuid;
BEGIN
  SELECT count(*)
  INTO provider_count
  FROM public.iptv_providers;

  IF provider_count = 1 THEN
    SELECT id
    INTO only_provider
    FROM public.iptv_providers
    LIMIT 1;

    IF only_provider IS NOT NULL THEN
      UPDATE public.iptv_dns
      SET provider_id = only_provider
      WHERE provider_id IS NULL;
    END IF;
  END IF;
END;
$$;
