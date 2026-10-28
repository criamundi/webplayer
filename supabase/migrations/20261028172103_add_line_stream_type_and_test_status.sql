/*
# Add stream_type and test status columns to iptv_lines

## Purpose
Supports two new features for the admin Devices panel:
1. **Short URL format + HLS toggle**: Each line can now specify whether its playlist
   URL uses the traditional `get.php?username=…&password=…&type=m3u_plus&output=ts`
   format or the short format `/{type}/{username}/{password}/m3u` (or `/hls`).
   The `stream_type` column stores which format the admin chose for that line.
2. **Playlist testing**: Admins can test a line's playlist from the panel to see
   if it loads successfully or returns an error. The result is persisted so the
   admin can filter lines that have errors.

## Changes to `iptv_lines`
- `stream_type` (text, NOT NULL, DEFAULT 'm3u', CHECK in ('m3u','hls'))
  – Determines the playlist path suffix. `m3u` = traditional get.php URL;
    `hls` = short URL ending in `/hls`.
- `last_tested_at` (timestamptz, nullable) – When the playlist was last tested.
- `test_status` (text, nullable, CHECK in ('ok','error')) – Result of the last test.
- `test_error` (text, nullable) – Error message from the last failed test.

## Security
- No new tables. Existing RLS policies on `iptv_lines` already cover all CRUD
  for authenticated admins. No new policies needed.
- No new grants needed — `authenticated` already has full CRUD on `iptv_lines`.
*/

ALTER TABLE public.iptv_lines
  ADD COLUMN IF NOT EXISTS stream_type text NOT NULL DEFAULT 'm3u'
    CHECK (stream_type IN ('m3u','hls')),
  ADD COLUMN IF NOT EXISTS last_tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS test_status text CHECK (test_status IN ('ok','error')),
  ADD COLUMN IF NOT EXISTS test_error text;
