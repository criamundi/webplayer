/*
# Add DNS association to IPTV lines

1. Modified Tables
- `iptv_lines`: added `dns_id` column (nullable FK to `iptv_dns`). When set, the M3U link for that line is built using the DNS host instead of the provider server_url.

2. Security
- No policy changes needed — the column is covered by the existing admin-only CRUD policies on `iptv_lines`.

3. Important notes
- `dns_id` is nullable so existing lines keep working without a DNS assigned.
- The M3U link is computed in the frontend from: `dns.host` (or `provider.server_url` as fallback) + `/get.php?username=...&password=...&type=m3u_plus&output=ts`.
*/

ALTER TABLE public.iptv_lines
  ADD COLUMN IF NOT EXISTS dns_id uuid REFERENCES public.iptv_dns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS iptv_lines_dns_idx ON public.iptv_lines (dns_id);
