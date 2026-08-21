/*
# Tighten profile role protection and admin function access

1. Security changes
- Revoke EXECUTE on `is_admin()` from anon so unauthenticated callers cannot probe admin status.
- Revoke UPDATE on the `role` column of `profiles` from authenticated users, so a user cannot change their own role through the data API even though the row-level UPDATE policy allows touching their own row.
- Keep `display_name` user-editable; only the privilege-bearing `role` column is revoked.

2. Important notes
- The `profiles_update_own` policy already constrains the role to its current value, but column privileges are checked before policies, so revoking the column is the authoritative control.
- The `on_auth_user_created_profile` trigger and `create_profile_for_user` function remain the only paths that set `role` (to `admin` for the first account, `user` thereafter).
*/

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
