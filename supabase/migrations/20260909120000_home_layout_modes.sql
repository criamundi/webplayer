alter table if exists public.provider_branding
  add column if not exists home_layout text not null default 'complete';

alter table if exists public.app_branding
  add column if not exists home_layout text not null default 'complete';

update public.provider_branding
set home_layout = 'complete'
where home_layout is null or home_layout not in ('complete', 'simple');

update public.app_branding
set home_layout = 'complete'
where home_layout is null or home_layout not in ('complete', 'simple');

alter table if exists public.provider_branding
  drop constraint if exists provider_branding_home_layout_check;

alter table if exists public.provider_branding
  add constraint provider_branding_home_layout_check
  check (home_layout in ('complete', 'simple'));

alter table if exists public.app_branding
  drop constraint if exists app_branding_home_layout_check;

alter table if exists public.app_branding
  add constraint app_branding_home_layout_check
  check (home_layout in ('complete', 'simple'));
