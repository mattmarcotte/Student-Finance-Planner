-- Initial user profiles. Applied remotely as migration: create_user_profiles.
-- Supabase Auth owns identities, email addresses, passwords, and sessions.

create schema private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 200),
  default_currency text not null default 'CAD'
    check (default_currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'UTC',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Private application preferences; one profile per Supabase Auth user.';
comment on column public.profiles.default_currency is
  'Preferred three-letter currency code. Confirm during onboarding.';
comment on column public.profiles.timezone is
  'Postgres-recognized timezone name. Confirm during onboarding.';

alter table public.profiles enable row level security;

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, default_currency, timezone, onboarding_completed_at)
  on public.profiles to authenticated;
grant all on public.profiles to service_role;

create policy profiles_select_own
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Trigger-only helpers live outside the exposed API schema.
create function private.prepare_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.timezone is distinct from old.timezone then
    if not exists (
      select 1 from pg_catalog.pg_timezone_names as zones
      where zones.name = new.timezone
    ) then
      raise exception 'Unrecognized timezone' using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.prepare_profile()
  from public, anon, authenticated;

create trigger profiles_prepare_write
  before insert or update on public.profiles
  for each row execute function private.prepare_profile();

-- A definer is needed because Auth's signup role cannot write app profiles.
-- This function accepts no IDs from callers and only runs for auth.users inserts.
-- Metadata supplies a display label only, never authorization information.
create function private.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' or tg_table_schema <> 'auth' or tg_table_name <> 'users' then
    raise exception 'This function only handles new Auth users';
  end if;

  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name',
                  new.raw_user_meta_data ->> 'name'), 200)
  );
  return new;
end;
$$;

revoke all on function private.create_profile_for_auth_user()
  from public, anon, authenticated;

create trigger auth_user_create_profile
  after insert on auth.users
  for each row execute function private.create_profile_for_auth_user();

-- Preserve support for Auth users created before this migration.
insert into public.profiles (id, display_name)
select id, left(coalesce(raw_user_meta_data ->> 'full_name',
                        raw_user_meta_data ->> 'name'), 200)
from auth.users
on conflict (id) do nothing;
