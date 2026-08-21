/*
# Make provider server_url optional

1. Modified Tables
- `iptv_providers`: `server_url` is now nullable. The provider acts as a
  credential/name only; the actual server host comes from the DNS assigned
  to each line. Existing rows keep their values.

2. Security
- No policy changes.

3. Important notes
- The connect-line edge function already prefers DNS over server_url. With
  server_url nullable, lines without a DNS and without a provider URL will
  return a clear "server unavailable" error instead of crashing.
*/

ALTER TABLE public.iptv_providers ALTER COLUMN server_url DROP NOT NULL;
