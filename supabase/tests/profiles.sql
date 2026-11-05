-- Run as the database administrator, never through a user-facing endpoint.
-- Synthetic Auth users and all changes are rolled back at the end.
begin;

select set_config('app.test_owner', gen_random_uuid()::text, true);
select set_config('app.test_other', gen_random_uuid()::text, true);

insert into auth.users (id, raw_user_meta_data)
values
  (current_setting('app.test_owner')::uuid, '{"full_name":"Student One"}'::jsonb),
  (current_setting('app.test_other')::uuid, null);

do $$
begin
  if (select count(*) from public.profiles where id in (
    current_setting('app.test_owner')::uuid,
    current_setting('app.test_other')::uuid
  )) <> 2 then
    raise exception 'Signup trigger did not create both profiles';
  end if;
  if (select display_name from public.profiles
      where id = current_setting('app.test_owner')::uuid) <> 'Student One' then
    raise exception 'Signup did not copy the display name';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.test_owner'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('app.test_owner'), 'role', 'authenticated'
)::text, true);

do $$
declare
  affected integer;
begin
  if current_user <> 'authenticated' then
    raise exception 'Test must run as authenticated';
  end if;
  if not exists (select 1 from public.profiles
                 where id = current_setting('app.test_owner')::uuid) then
    raise exception 'User cannot read own profile';
  end if;
  if exists (select 1 from public.profiles
             where id = current_setting('app.test_other')::uuid) then
    raise exception 'User can read another profile';
  end if;

  update public.profiles
  set display_name = 'Updated Student', default_currency = 'USD',
      timezone = 'America/Vancouver', onboarding_completed_at = now()
  where id = current_setting('app.test_owner')::uuid;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'User cannot update own profile';
  end if;

  update public.profiles set display_name = 'Unauthorized'
  where id = current_setting('app.test_other')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'User can update another profile';
  end if;

  begin
    update public.profiles set timezone = 'Not/A_Timezone'
    where id = current_setting('app.test_owner')::uuid;
    raise exception 'Invalid timezone was accepted';
  exception when check_violation then null;
  end;

  begin
    update public.profiles set default_currency = 'usd'
    where id = current_setting('app.test_owner')::uuid;
    raise exception 'Invalid currency format was accepted';
  exception when check_violation then null;
  end;

  begin
    update public.profiles set id = current_setting('app.test_other')::uuid
    where id = current_setting('app.test_owner')::uuid;
    raise exception 'User can change profile identity';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.profiles set created_at = now() - interval '1 year'
    where id = current_setting('app.test_owner')::uuid;
    raise exception 'User can change creation timestamp';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.profiles (id) values (current_setting('app.test_owner')::uuid);
    raise exception 'User can directly insert profiles';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.profiles where id = current_setting('app.test_owner')::uuid;
    raise exception 'User can directly delete profiles';
  exception when insufficient_privilege then null;
  end;

end;
$$;

-- Check isolation in the other direction as the second user as well.
select set_config('request.jwt.claim.sub', current_setting('app.test_other'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('app.test_other'), 'role', 'authenticated'
)::text, true);

do $$
begin
  if not exists (select 1 from public.profiles
                 where id = current_setting('app.test_other')::uuid)
     or exists (select 1 from public.profiles
                where id = current_setting('app.test_owner')::uuid) then
    raise exception 'Second user isolation failed';
  end if;
end;
$$;

reset role;
do $$
begin
  -- Resolve the private function as the administrator, checking user grants.
  if has_schema_privilege('authenticated', 'private', 'USAGE')
     or has_function_privilege('authenticated',
       'private.create_profile_for_auth_user()', 'EXECUTE')
     or has_function_privilege('anon',
       'private.create_profile_for_auth_user()', 'EXECUTE') then
    raise exception 'Internal signup helper is callable by users';
  end if;
end;
$$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

do $$
begin
  begin
    perform 1 from public.profiles;
    raise exception 'Anonymous visitor can read profiles';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
delete from auth.users where id = current_setting('app.test_owner')::uuid;

do $$
begin
  if exists (select 1 from public.profiles
             where id = current_setting('app.test_owner')::uuid) then
    raise exception 'Auth user deletion did not cascade to profile';
  end if;
end;
$$;

rollback;

select 'passed: signup, metadata, two-user RLS, own-profile edits, input validation, protected columns, denied insert/delete, anonymous access, private helpers, deletion cascade; test changes rolled back' as verification;
