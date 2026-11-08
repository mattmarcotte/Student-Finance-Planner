-- Run as an administrator. All synthetic users and financial rows roll back.
begin;

select set_config('app.test_owner', gen_random_uuid()::text, true);
select set_config('app.test_other', gen_random_uuid()::text, true);
insert into auth.users (id) values
  (current_setting('app.test_owner')::uuid),
  (current_setting('app.test_other')::uuid);

insert into public.cash_flows (user_id, label, kind, amount, start_date)
values (current_setting('app.test_other')::uuid,
        'Other user event', 'expense', 25, date '2026-11-06');

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('app.test_owner'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('app.test_owner'), 'role', 'authenticated'
)::text, true);

-- No user_id supplied: ownership defaults to the verified session's user ID.
insert into public.cash_flows (label, kind, amount, start_date)
values ('One-time tuition', 'expense', 1200, date '2026-11-06');
insert into public.cash_flows (
  label, kind, amount, start_date, repeat_unit, repeat_every, end_date
) values ('Paycheque', 'income', 450, date '2026-11-06',
          'week', 2, date '2027-05-01');

-- Many events use more rows, without adding any columns or changing the schema.
insert into public.cash_flows (
  label, kind, amount, start_date, repeat_unit, repeat_every
)
select 'Monthly event ' || n, 'expense', 10, date '2026-11-06', 'month', 1
from generate_series(1, 25) as n;

do $$
declare
  affected integer;
  invalid_amount numeric;
begin
  if current_user <> 'authenticated' or
     (select count(*) from public.cash_flows) <> 27 then
    raise exception 'Expected 27 events visible to the owner';
  end if;
  if exists (select 1 from public.cash_flows
             where user_id <> current_setting('app.test_owner')::uuid) then
    raise exception 'Owner can read another user event';
  end if;

  update public.cash_flows set amount = 500, is_active = false
  where label = 'Paycheque';
  get diagnostics affected = row_count;
  if affected <> 1 or not exists (
    select 1 from public.cash_flows
    where label = 'Paycheque' and amount = 500 and not is_active
  ) then
    raise exception 'Owner cannot update and pause an event';
  end if;

  update public.cash_flows set amount = 100
  where user_id = current_setting('app.test_other')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-user update succeeded'; end if;

  delete from public.cash_flows
  where user_id = current_setting('app.test_other')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-user delete succeeded'; end if;

  begin
    insert into public.cash_flows (user_id, label, kind, amount, start_date)
    values (current_setting('app.test_other')::uuid,
            'Forged owner', 'income', 50, date '2026-11-06');
    raise exception 'Cross-user insert succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.cash_flows set user_id = current_setting('app.test_other')::uuid;
    raise exception 'Ownership reassignment succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.cash_flows set id = gen_random_uuid() where label = 'Paycheque';
    raise exception 'Event identity change succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.cash_flows set updated_at = now() - interval '1 year';
    raise exception 'Client timestamp change succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.cash_flows (label, kind, amount, start_date, created_at)
    values ('Forged time', 'expense', 5, date '2026-11-06', now());
    raise exception 'Client timestamp insert succeeded';
  exception when insufficient_privilege then null;
  end;

  foreach invalid_amount in array array[0::numeric, -1::numeric, 'NaN'::numeric]
  loop
    begin
      update public.cash_flows set amount = invalid_amount where label = 'Paycheque';
      raise exception 'Invalid amount accepted';
    exception when check_violation then null;
    end;
  end loop;

  begin
    insert into public.cash_flows (
      label, kind, amount, start_date, repeat_unit
    ) values ('Missing interval', 'income', 50, date '2026-11-06', 'week');
    raise exception 'Incomplete recurrence accepted';
  exception when check_violation then null;
  end;

  begin
    update public.cash_flows set repeat_every = 0 where label = 'Paycheque';
    raise exception 'Zero recurrence interval accepted';
  exception when check_violation then null;
  end;

  begin
    update public.cash_flows set end_date = date '2026-01-01'
    where label = 'Paycheque';
    raise exception 'End before start accepted';
  exception when check_violation then null;
  end;

  begin
    update public.cash_flows set end_date = date '2027-01-01'
    where label = 'One-time tuition';
    raise exception 'End date accepted on a one-time event';
  exception when check_violation then null;
  end;

  delete from public.cash_flows where label = 'One-time tuition';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner cannot delete own event'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', current_setting('app.test_other'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('app.test_other'), 'role', 'authenticated'
)::text, true);

do $$
begin
  if (select count(*) from public.cash_flows) <> 1 or
     exists (select 1 from public.cash_flows
             where user_id = current_setting('app.test_owner')::uuid) then
    raise exception 'Second user isolation failed';
  end if;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);

do $$
begin
  begin
    if exists (select id from public.cash_flows) then raise exception 'Anonymous read succeeded'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.cash_flows (label, kind, amount, start_date)
    values ('Anonymous', 'expense', 10, date '2026-11-06');
    raise exception 'Anonymous insert succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
delete from auth.users where id = current_setting('app.test_owner')::uuid;
do $$
begin
  if exists (select 1 from public.cash_flows
             where user_id = current_setting('app.test_owner')::uuid) then
    raise exception 'Auth deletion did not cascade';
  end if;
  if not exists (select 1 from public.cash_flows
                 where user_id = current_setting('app.test_other')::uuid) then
    raise exception 'Cascade affected another user';
  end if;
end;
$$;

rollback;
select 'passed: own-event CRUD, default ownership, 25 recurring events, two-user isolation, forged-owner rejection, protected columns, invalid amounts/schedules, anonymous denial, deletion cascade; test changes rolled back' as verification;
