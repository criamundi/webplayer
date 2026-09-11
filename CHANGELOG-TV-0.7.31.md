# Top TV Digital 0.7.31 — Tizen runtime hardening

Base: 0.7.30.

## What changed
- Tizen build now refuses to run when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing. The local ZIP intentionally does not contain these deployment values.
- Added `.env.tizen.example` and a clear `.env.tizen.local` workflow.
- Supabase bootstrap is guarded so a missing environment cannot crash module evaluation into a silent black screen.
- Tizen M3U worker is instantiated as a classic worker; web builds keep module workers.
- Tizen post-build remains legacy/SystemJS-only and adds an on-TV startup diagnostic screen for runtime errors.
- Tizen `config.xml` version updated to 0.7.31. Package/Application IDs remain `TopTV2026A` / `TopTV2026A.Player`.

## Important
Use the same **public** Supabase Project URL and anon/publishable key that the working web deployment uses. Never use a `service_role` key in the client.
